import { json, error } from '@sveltejs/kit';
import { removeRecipe, getPlanRow } from '$lib/server/weekplan.js';
import { getScheduleForMeal, getActiveSchedulesForWeek, deleteSchedule } from '$lib/server/schedules.js';
import { slotTarget } from '$lib/server/mealSlots.js';
import { isDayConsolidated } from '$lib/server/consolidationMark.js';
import { getDb } from '$lib/db/index.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { removeBodySchema } from '$lib/schemas/index.js';
import { withFrozenPast, shiftScheduleRotation, countSchedulesForMeal } from '$lib/server/scheduleFreeze.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

export async function POST({ request }) {
	const body = await parseBody(request, removeBodySchema);
	const { weekKey, slot_id, recipe_id, force } = body;
	const target = slotTarget(slot_id);
	if (!target) throw error(400, 'Hueco desconocido');
	const { weekday, meal_type, is_accompaniment } = target;

	if (force === 'move' || force === 'only_week') {
		// 'only_week': la excepción ya fue añadida por el cliente (si hacía falta); aquí solo
		// limpiamos la fila guardada si existe.
		removeRecipe(weekKey, slot_id);
		return json({ ok: true, had_schedule: false });
	}

	if (force === 'full_schedule') {
		const sched = getScheduleForMeal(weekday, meal_type, is_accompaniment, recipe_id);
		if (sched) withFrozenPast(() => deleteSchedule(sched.id));
		removeRecipe(weekKey, slot_id);
		return json({ ok: true, had_schedule: false });
	}

	if (force === 'shift_rotation') {
		if (weekKeyToIndex(weekKey) < weekKeyToIndex(getWeekKey())) {
			throw error(400, 'No se puede desplazar la rotación en una semana pasada');
		}
		shiftScheduleRotation(weekKey, weekday, meal_type, is_accompaniment);
		removeRecipe(weekKey, slot_id);
		return json({ ok: true, had_schedule: false });
	}

	const row = slot_id >= 0 ? getPlanRow(weekKey, slot_id) : undefined;

	if (!row) {
		// La receta visible viene de una programación activa → preguntar al usuario
		const activeScheds = getActiveSchedulesForWeek(weekKey);
		const sched = activeScheds.find(s =>
			s.weekday === weekday && s.meal_type === meal_type &&
			s.is_accompaniment === is_accompaniment &&
			(recipe_id === undefined || s.recipe_id === recipe_id)
		);
		if (sched) {
			// La rotación solo se puede adelantar desde la semana actual o futuras
			const isPast = weekKeyToIndex(weekKey) < weekKeyToIndex(getWeekKey());
			const rotation_size = isPast ? 0 : countSchedulesForMeal(weekday, meal_type, is_accompaniment);
			// Al adelantar la rotación, esta semana pasa a tener lo programado para la siguiente
			// (las excepciones de la semana siguiente también se adelantan, así que se respetan)
			const next_in_rotation = rotation_size >= 2
				? getActiveSchedulesForWeek(indexToWeekKey(weekKeyToIndex(weekKey) + 1))
					.filter(s => s.weekday === weekday && s.meal_type === meal_type && s.is_accompaniment === is_accompaniment)
					.map(s => s.recipe.name)
				: [];
			return json({ ok: true, had_schedule: true, schedule_id: sched.id, every_n_weeks: sched.every_n_weeks, rotation_size, next_in_rotation });
		}
		return json({ ok: true, had_schedule: false });
	}

	// Receta consolidada de una programación (día ya pasado): antes de quitarla, preguntar si
	// se quiere retrasar la rotación para no perder la receta que tocaba
	if (row.schedule_id !== null && isDayConsolidated(weekKey, weekday)
		&& getDb().prepare('SELECT 1 FROM schedules WHERE id = ?').get(row.schedule_id)) {
		return json({ ok: true, had_schedule: false, consolidated_schedule_id: row.schedule_id });
	}

	// La receta es manual: borrar la fila
	removeRecipe(weekKey, slot_id);

	// Comprobar si hay programación activa debajo (que ahora reaparecerá)
	const schedUnderneath = !isDayConsolidated(weekKey, weekday) && getActiveSchedulesForWeek(weekKey).some(s =>
		s.weekday === weekday && s.meal_type === meal_type &&
		s.is_accompaniment === is_accompaniment
	);

	return json({ ok: true, had_schedule: false, schedule_resumed: schedUnderneath });
}
