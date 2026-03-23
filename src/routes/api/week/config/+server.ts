import { json } from '@sveltejs/kit';
import { updateDayConfig, updateSlotRequiredTag } from '$lib/server/weekplan.js';

export async function POST({ request }) {
	const body = await request.json();
	if ('slot_index' in body && 'required_tags' in body) {
		updateSlotRequiredTag(body.weekKey, body.weekday, body.meal_type, body.slot_index, Array.isArray(body.required_tags) ? body.required_tags : []);
	} else {
		updateDayConfig(body.weekKey, body.weekday, body.meal_type, {
			recipe_count: body.recipe_count,
			accompaniment_per_recipe: body.accompaniment_per_recipe,
			accompaniment_per_slot: body.accompaniment_per_slot,
		});
	}
	return json({ ok: true });
}
