import { json } from '@sveltejs/kit';
import { getAllRecipes, createRecipe, importPlantoeatRecipes, searchRecipes, getTopRecipesForSlot, getAllTags } from '$lib/server/recipes.js';

export async function GET({ url }) {
	const q = url.searchParams.get('q');
	const mealType = url.searchParams.get('mealType');
	const weekday = url.searchParams.get('weekday');

	if (url.searchParams.get('tags') === '1') {
		return json(getAllTags());
	}

	if (q !== null || mealType) {
		const recipes = searchRecipes(q || '', mealType || undefined);
		const top = weekday ? getTopRecipesForSlot(parseInt(weekday), mealType || 'comida') : [];
		return json({ recipes, top });
	}

	return json(getAllRecipes());
}

export async function POST({ request }) {
	const body = await request.json();

	if (body.import_text) {
		const imported = importPlantoeatRecipes(body.import_text);
		return json(imported);
	}

	const recipe = createRecipe({
		name: body.name,
		description: body.description || '',
		tags: body.tags || '',
		min_days: body.min_days ?? -1
	});
	return json(recipe, { status: 201 });
}
