import { json, error } from '@sveltejs/kit';
import { assignRecipe } from '$lib/server/weekplan.js';
import { getSlotVersion } from '$lib/server/mealSlots.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { assignBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, assignBodySchema);
	if (body.slot_id >= 0 && !getSlotVersion(body.slot_id, body.weekKey)) throw error(400, 'El hueco no existe esa semana');
	// Un hueco virtual se materializa: el cliente recibe el slot_id real
	const slot_id = assignRecipe(body.weekKey, body.slot_id, body.recipe_id, body.is_leftover ?? 0, body.people);
	return json({ ok: true, slot_id });
}
