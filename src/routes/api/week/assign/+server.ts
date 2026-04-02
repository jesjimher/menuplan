import { json } from '@sveltejs/kit';
import { assignRecipe } from '$lib/server/weekplan.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		assignRecipe(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment ?? 0, body.recipe_id, body.member_id ?? null);
		return json({ ok: true });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
