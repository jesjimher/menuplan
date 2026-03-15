import { json, error } from '@sveltejs/kit';
import { getRecipeById, updateRecipe, deleteRecipe } from '$lib/server/recipes.js';

export async function GET({ params }) {
	const recipe = getRecipeById(parseInt(params.id));
	if (!recipe) throw error(404, 'Recipe not found');
	return json(recipe);
}

export async function PUT({ params, request }) {
	const body = await request.json();
	const recipe = updateRecipe(parseInt(params.id), body);
	if (!recipe) throw error(404, 'Recipe not found');
	return json(recipe);
}

export async function DELETE({ params }) {
	deleteRecipe(parseInt(params.id));
	return json({ ok: true });
}
