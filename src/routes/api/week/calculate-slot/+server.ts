import { json } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { calculatePlan } from '$lib/server/planner.js';

export async function POST({ request }) {
	const body = await request.json();
	const { weekKey, weekday, meal_type, slot_index, is_accompaniment } = body;

	const weekData = getWeekData(weekKey);

	const slot = {
		weekday,
		meal_type: meal_type as 'comida' | 'cena',
		slot_index,
		is_accompaniment: is_accompaniment ?? 0,
		member_id: null
	};

	calculatePlan(weekKey, [slot], weekData.slots);

	// Devuelve solo la receta asignada al slot
	const updated = getWeekData(weekKey);
	const filledSlot = updated.slots.find(s =>
		s.weekday === weekday && s.meal_type === meal_type &&
		s.slot_index === slot_index && s.is_accompaniment === (is_accompaniment ?? 0)
	);

	return json({ recipe: filledSlot?.recipe ?? null });
}
