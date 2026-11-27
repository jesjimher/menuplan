import { error, json } from '@sveltejs/kit';
import { getTopRecipesForSlot, getTopRecipesOverall, getRecentRecipesForSlot, getOldestPlannedRecipes, getRecipesPlannedNearDate } from '$lib/server/recipes.js';
import { getDiscardedRecipes } from '$lib/server/planner.js';
import { getWeekData } from '$lib/server/weekplan.js';
import { getWeekDates } from '$lib/utils/dates.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const weekKey = url.searchParams.get('weekKey') ?? '';
	const weekday = parseInt(url.searchParams.get('weekday') ?? '1');
	const mealType = url.searchParams.get('mealType') ?? 'comida';
	const slotId = parseInt(url.searchParams.get('slotId') ?? '0');
	const isAcc = parseInt(url.searchParams.get('isAcc') ?? '0');
	if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw error(400, 'weekday inválido');
	if (!Number.isInteger(slotId)) throw error(400, 'slotId inválido');
	if (!Number.isInteger(isAcc)) throw error(400, 'isAcc inválido');

	const weekData = getWeekData(weekKey);
	const currentSlots = weekData?.slots ?? [];
	const slotRequiredTags: string[] = weekData?.configs[weekday]?.[mealType as 'comida' | 'cena']?.slots.find(s => s.id === slotId)?.tags ?? [];

	const topForDay = getTopRecipesForSlot(weekday, mealType, 20, isAcc);
	const topOverall = getTopRecipesOverall(mealType, 20, isAcc);
	const recentForDay = getRecentRecipesForSlot(weekday, mealType, 20, isAcc);
	const oldestPlanned = getOldestPlannedRecipes(mealType, 20, isAcc);
	const discarded = getDiscardedRecipes(weekKey, weekday, mealType, isAcc, currentSlots, slotRequiredTags);

	const leftovers = isAcc ? [] : getRecipesPlannedNearDate(getWeekDates(weekKey)[weekday - 1], 7);

	return json({ topForDay, topOverall, recentForDay, oldestPlanned, discarded, leftovers });
};
