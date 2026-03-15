import { json } from '@sveltejs/kit';
import { removeRecipe } from '$lib/server/weekplan.js';

export async function POST({ request }) {
	const body = await request.json();
	removeRecipe(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment ?? 0);
	return json({ ok: true });
}
