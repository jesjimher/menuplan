import { json } from '@sveltejs/kit';
import { getTopRecipesForSlot, getTopRecipesOverall, getRecentRecipesForSlot, getOldestPlannedRecipes } from '$lib/server/recipes.js';
import { getDiscardedRecipes } from '$lib/server/planner.js';
import { getWeekData } from '$lib/server/weekplan.js';

export async function GET({ url }) {
	const weekKey = url.searchParams.get('weekKey') ?? '';
	const weekday = parseInt(url.searchParams.get('weekday') ?? '1');
	const mealType = url.searchParams.get('mealType') ?? 'comida';
	const slotIndex = parseInt(url.searchParams.get('slotIndex') ?? '0');
	const isAcc = parseInt(url.searchParams.get('isAcc') ?? '0');

	const weekData = getWeekData(weekKey);
	const currentSlots = weekData?.slots ?? [];
	const slotRequiredTags: string[] = isAcc
		? []
		: (weekData?.configs[weekday]?.[mealType as 'comida' | 'cena']?.required_tags[slotIndex] ?? []);

	const topForDay = getTopRecipesForSlot(weekday, mealType, 20);
	const topOverall = getTopRecipesOverall(mealType, 20);
	const recentForDay = getRecentRecipesForSlot(weekday, mealType, 20);
	const oldestPlanned = getOldestPlannedRecipes(mealType, 20);
	const discarded = getDiscardedRecipes(weekKey, weekday, mealType, isAcc, slotIndex, currentSlots, slotRequiredTags);

	return json({ topForDay, topOverall, recentForDay, oldestPlanned, discarded });
}
