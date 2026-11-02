import { json, error } from '@sveltejs/kit';
import { removeRecipe, hasManualEntry } from '$lib/server/weekplan.js';
import { getScheduleForMeal, getActiveSchedulesForWeek, deleteSchedule } from '$lib/server/schedules.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { removeBodySchema } from '$lib/schemas/index.js';
import { withFrozenPast, shiftScheduleRotation, countSchedulesForMeal } from '$lib/server/scheduleFreeze.js';
import { getWeekKey, weekKeyToIndex } from '$lib/utils/dates.js';

export async function POST({ request }) {
	const body = await parseBody(request, removeBodySchema);
	const { weekKey, weekday, meal_type, slot_index, is_accompaniment, recipe_id, force } = body;

	if (force === 'move' || force === 'only_week') {
		// 'only_week': la excepción ya fue añadida por el cliente; aquí solo limpiamos
		// la entrada manual si existe.
		removeRecipe(weekKey, weekday, meal_type, slot_index, is_accompaniment);
		return json({ ok: true, had_schedule: false });
	}

	if (force === 'full_schedule') {
		const sched = getScheduleForMeal(weekday, meal_type, is_accompaniment, recipe_id);
		if (sched) withFrozenPast(() => deleteSchedule(sched.id));
		removeRecipe(weekKey, weekday, meal_type, slot_index, is_accompaniment);
		return json({ ok: true, had_schedule: false });
	}

	if (force === 'shift_rotation') {
		if (weekKeyToIndex(weekKey) < weekKeyToIndex(getWeekKey())) {
			throw error(400, 'No se puede desplazar la rotación en una semana pasada');
		}
		shiftScheduleRotation(weekKey, weekday, meal_type, is_accompaniment);
		removeRecipe(weekKey, weekday, meal_type, slot_index, is_accompaniment);
		return json({ ok: true, had_schedule: false });
	}

	// Sin force: determinar si el slot es virtual (programación) o manual
	const isManual = hasManualEntry(weekKey, weekday, meal_type, slot_index, is_accompaniment);

	if (!isManual) {
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
			return json({ ok: true, had_schedule: true, schedule_id: sched.id, every_n_weeks: sched.every_n_weeks, rotation_size });
		}
		return json({ ok: true, had_schedule: false });
	}

	// La receta es manual: borrar la fila
	removeRecipe(weekKey, weekday, meal_type, slot_index, is_accompaniment);

	// Comprobar si hay programación activa debajo (que ahora reaparecerá)
	const activeScheds = getActiveSchedulesForWeek(weekKey);
	const schedUnderneath = activeScheds.find(s =>
		s.weekday === weekday && s.meal_type === meal_type &&
		s.is_accompaniment === is_accompaniment
	);

	return json({ ok: true, had_schedule: false, schedule_resumed: schedUnderneath ? true : false });
}
