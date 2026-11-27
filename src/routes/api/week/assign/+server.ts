import { json, error } from '@sveltejs/kit';
import { assignRecipe } from '$lib/server/weekplan.js';
import { getSlotVersion, slotTarget } from '$lib/server/mealSlots.js';
import { getRecipeById } from '$lib/server/recipes.js';
import { parseTags } from '$lib/utils/parseTags.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { assignBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, assignBodySchema);
	if (body.slot_id >= 0 && !getSlotVersion(body.slot_id, body.weekKey)) throw error(400, 'El hueco no existe esa semana');
	// En un hueco de acompañamiento solo caben recetas de acompañamiento
	const target = slotTarget(body.slot_id);
	const recipe = getRecipeById(body.recipe_id);
	if (!target || !recipe) throw error(400, 'Hueco o receta inexistente');
	if (target.is_accompaniment && !parseTags(recipe.tags).includes('acompañamiento')) {
		throw error(400, 'Esa receta no es un acompañamiento');
	}
	// Un hueco virtual se materializa: el cliente recibe el slot_id real
	const slot_id = assignRecipe(body.weekKey, body.slot_id, body.recipe_id, body.is_leftover ?? 0, body.people);
	return json({ ok: true, slot_id });
}
