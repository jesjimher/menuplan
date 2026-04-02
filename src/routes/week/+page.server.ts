import { getWeekData } from '$lib/server/weekplan.js';
import { getAllRecipes, getAllTags } from '$lib/server/recipes.js';
import { getAllRules } from '$lib/server/rules.js';
import { getWeekKey } from '$lib/utils/dates.js';

export function load({ url }) {
	const weekKey = url.searchParams.get('weekKey') || getWeekKey();
	return {
		weekKey,
		weekData: getWeekData(weekKey),
		recipes: getAllRecipes(),
		rules: getAllRules(),
		allTags: getAllTags()
	};
}
