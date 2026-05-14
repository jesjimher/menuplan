import { json } from '@sveltejs/kit';
import { assignRecipe } from '$lib/server/weekplan.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { assignBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, assignBodySchema);
	assignRecipe(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment, body.recipe_id, body.member_id);
	return json({ ok: true });
}
