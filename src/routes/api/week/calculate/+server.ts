import { json } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { calculatePlan } from '$lib/server/planner.js';
import { getWeekKey } from '$lib/utils/dates.js';

export async function POST({ request }) {
	const body = await request.json();
	const weekKey = body.weekKey || getWeekKey();

	const weekData = getWeekData(weekKey);

	// Build list of empty slots based on configs
	const slotsToFill: { weekday: number; meal_type: 'comida' | 'cena'; slot_index: number; is_accompaniment: number; member_id: number | null; required_tags?: string[] }[] = [];

	for (let weekday = 1; weekday <= 7; weekday++) {
		const config = weekData.configs[weekday];

		for (const mealType of ['comida', 'cena'] as const) {
			const mealConfig = config[mealType];

			for (let slotIdx = 0; slotIdx < mealConfig.recipe_count; slotIdx++) {
				// Check if this main slot is already filled
				const existing = weekData.slots.find(s =>
					s.weekday === weekday && s.meal_type === mealType &&
					s.slot_index === slotIdx && s.is_accompaniment === 0
				);

				if (!existing || !existing.recipe) {
					slotsToFill.push({ weekday, meal_type: mealType, slot_index: slotIdx, is_accompaniment: 0, member_id: null, required_tags: mealConfig.required_tags[slotIdx] ?? [] });
				}

				// Side dishes per recipe
				if (mealConfig.accompaniment_per_recipe > 0) {
					for (let aIdx = 0; aIdx < mealConfig.accompaniment_per_recipe; aIdx++) {
						const existingAcc = weekData.slots.find(s =>
							s.weekday === weekday && s.meal_type === mealType &&
							s.slot_index === slotIdx * mealConfig.accompaniment_per_recipe + aIdx && s.is_accompaniment === 1
						);
						if (!existingAcc || !existingAcc.recipe) {
							slotsToFill.push({
								weekday, meal_type: mealType,
								slot_index: slotIdx * mealConfig.accompaniment_per_recipe + aIdx,
								is_accompaniment: 1, member_id: null
							});
						}
					}
				}
			}

			// Side dishes per slot (independent of recipe count)
			if (mealConfig.accompaniment_per_slot > 0) {
				for (let aIdx = 0; aIdx < mealConfig.accompaniment_per_slot; aIdx++) {
					const existingAcc = weekData.slots.find(s =>
						s.weekday === weekday && s.meal_type === mealType &&
						s.slot_index === aIdx && s.is_accompaniment === 1
					);
					if (!existingAcc || !existingAcc.recipe) {
						slotsToFill.push({ weekday, meal_type: mealType, slot_index: aIdx, is_accompaniment: 1, member_id: null });
					}
				}
			}
		}
	}

	calculatePlan(weekKey, slotsToFill, weekData.slots);

	return json(getWeekData(weekKey));
}
