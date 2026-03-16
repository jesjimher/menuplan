import { json } from '@sveltejs/kit';
import { updateDayConfig } from '$lib/server/weekplan.js';

export async function POST({ request }) {
	const body = await request.json();
	updateDayConfig(body.weekKey, body.weekday, body.meal_type, {
		recipe_count: body.recipe_count,
		accompaniment_per_recipe: body.accompaniment_per_recipe,
		accompaniment_per_slot: body.accompaniment_per_slot,
		...('required_tag' in body ? { required_tag: body.required_tag || null } : {})
	});
	return json({ ok: true });
}
