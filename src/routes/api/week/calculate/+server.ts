import { json } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { calculatePlan } from '$lib/server/planner.js';
import { getWeekKey } from '$lib/utils/dates.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { calculateBodySchema } from '$lib/schemas/index.js';
import { type MealType, MEAL_TYPES } from '$lib/types/index.js';
import { recipeAccompanimentIndexes, mealAccompanimentIndexes } from '$lib/utils/mealCapacity.js';

export async function POST({ request }) {
	const body = await parseBody(request, calculateBodySchema);
	const weekKey = body.weekKey ?? getWeekKey();

	const weekData = getWeekData(weekKey);

	const slotsToFill: { weekday: number; meal_type: MealType; slot_index: number; is_accompaniment: number; required_tags?: string[] }[] = [];

	for (let weekday = 1; weekday <= 7; weekday++) {
		const config = weekData.configs[weekday];

		for (const mealType of MEAL_TYPES) {
			const mealConfig = config[mealType];
			if (mealConfig.disabled) continue;

			for (let slotIdx = 0; slotIdx < mealConfig.recipe_count; slotIdx++) {
				const existing = weekData.slots.find(s =>
					s.weekday === weekday && s.meal_type === mealType &&
					s.slot_index === slotIdx && s.is_accompaniment === 0
				);

				if (!existing || !existing.recipe) {
					slotsToFill.push({ weekday, meal_type: mealType, slot_index: slotIdx, is_accompaniment: 0, required_tags: mealConfig.required_tags[slotIdx] ?? [] });
				}

				for (const accIdx of recipeAccompanimentIndexes(mealConfig, slotIdx)) {
					const existingAcc = weekData.slots.find(s =>
						s.weekday === weekday && s.meal_type === mealType &&
						s.slot_index === accIdx && s.is_accompaniment === 1
					);
					if (!existingAcc || !existingAcc.recipe) {
						slotsToFill.push({ weekday, meal_type: mealType, slot_index: accIdx, is_accompaniment: 1 });
					}
				}
			}

			for (const aIdx of mealAccompanimentIndexes(mealConfig)) {
				const existingAcc = weekData.slots.find(s =>
					s.weekday === weekday && s.meal_type === mealType &&
					s.slot_index === aIdx && s.is_accompaniment === 1
				);
				if (!existingAcc || !existingAcc.recipe) {
					slotsToFill.push({ weekday, meal_type: mealType, slot_index: aIdx, is_accompaniment: 1 });
				}
			}
		}
	}

	calculatePlan(weekKey, slotsToFill, weekData.slots);
	return json(getWeekData(weekKey));
}
