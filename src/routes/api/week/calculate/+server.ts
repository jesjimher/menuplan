import { json } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { calculatePlan, type SlotToFill } from '$lib/server/planner.js';
import { getWeekKey } from '$lib/utils/dates.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { calculateBodySchema } from '$lib/schemas/index.js';
import { MEAL_TYPES } from '$lib/types/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, calculateBodySchema);
	const weekKey = body.weekKey ?? getWeekKey();

	const weekData = getWeekData(weekKey);
	const slotsToFill: SlotToFill[] = [];

	for (let weekday = 1; weekday <= 7; weekday++) {
		for (const mealType of MEAL_TYPES) {
			const cfg = weekData.configs[weekday][mealType];
			if (cfg.disabled) continue;
			const filled = new Set(weekData.slots
				.filter(s => s.weekday === weekday && s.meal_type === mealType && s.recipe)
				.map(s => s.slot_id));
			const push = (slotId: number, isAcc: number, tags: string[]) => {
				if (!filled.has(slotId)) slotsToFill.push({ weekday, meal_type: mealType, slot_id: slotId, is_accompaniment: isAcc, required_tags: isAcc ? [] : tags });
			};
			// Cada plato seguido de sus acompañamientos; al final los de toda la comida
			for (const main of cfg.slots.filter(s => s.kind === 'main' && !s.virtual)) {
				push(main.id, 0, main.tags);
				for (const acc of cfg.slots.filter(s => s.kind === 'acc' && s.parent_id === main.id)) push(acc.id, 1, acc.tags);
			}
			for (const acc of cfg.slots.filter(s => s.kind === 'acc' && s.parent_id === null && !s.virtual)) push(acc.id, 1, acc.tags);
		}
	}

	calculatePlan(weekKey, slotsToFill, weekData.slots);
	return json(getWeekData(weekKey));
}
