import { json } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { calculatePlan } from '$lib/server/planner.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { calculateSlotBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, calculateSlotBodySchema);
	const { weekKey, weekday, meal_type, slot_index, is_accompaniment } = body;

	const weekData = getWeekData(weekKey);
	const mealCfg = weekData.configs[weekday]?.[meal_type];

	const slot = {
		weekday,
		meal_type,
		slot_index,
		is_accompaniment,
		member_id: null,
		required_tags: is_accompaniment === 0 ? (mealCfg?.required_tags[slot_index] ?? []) : []
	};

	calculatePlan(weekKey, [slot], weekData.slots);

	const updated = getWeekData(weekKey);
	const filledSlot = updated.slots.find(s =>
		s.weekday === weekday && s.meal_type === meal_type &&
		s.slot_index === slot_index && s.is_accompaniment === is_accompaniment
	);

	return json({ recipe: filledSlot?.recipe ?? null });
}
