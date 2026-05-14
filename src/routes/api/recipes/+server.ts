import { json } from '@sveltejs/kit';
import { getAllRecipes, createRecipe, importPlantoeatRecipes, searchRecipes, getTopRecipesForSlot, getAllTags } from '$lib/server/recipes.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { createRecipeBodySchema } from '$lib/schemas/index.js';

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
	const body = await parseBody(request, createRecipeBodySchema);

	if (body.import_text) {
		return json(importPlantoeatRecipes(body.import_text));
	}

	const recipe = createRecipe({
		name: body.name,
		description: body.description,
		tags: body.tags,
		min_days: body.min_days
	});
	return json(recipe, { status: 201 });
}
