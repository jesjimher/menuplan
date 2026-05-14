import { json, error } from '@sveltejs/kit';
import { getRecipeById, updateRecipe, deleteRecipe } from '$lib/server/recipes.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { updateRecipeBodySchema } from '$lib/schemas/index.js';

export async function GET({ params }) {
	const recipe = getRecipeById(parseInt(params.id));
	if (!recipe) throw error(404, 'Receta no encontrada');
	return json(recipe);
}

export async function PUT({ params, request }) {
	const body = await parseBody(request, updateRecipeBodySchema);
	const recipe = updateRecipe(parseInt(params.id), body);
	if (!recipe) throw error(404, 'Receta no encontrada');
	return json(recipe);
}

export async function DELETE({ params }) {
	deleteRecipe(parseInt(params.id));
	return json({ ok: true });
}
