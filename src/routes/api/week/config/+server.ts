import { json } from '@sveltejs/kit';
import { updateDayConfig, updateSlotRequiredTag } from '$lib/server/weekplan.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		if ('slot_index' in body && 'required_tags' in body) {
			updateSlotRequiredTag(body.weekKey, body.weekday, body.meal_type, body.slot_index, Array.isArray(body.required_tags) ? body.required_tags : []);
		} else {
			const cfg: Record<string, unknown> = {
				recipe_count: body.recipe_count,
				accompaniment_per_recipe: body.accompaniment_per_recipe,
				accompaniment_per_slot: body.accompaniment_per_slot,
			};
			if ('disabled' in body) cfg.disabled = body.disabled;
			if ('disabled_comment' in body) cfg.disabled_comment = body.disabled_comment;
			updateDayConfig(body.weekKey, body.weekday, body.meal_type, cfg as any);
		}
		return json({ ok: true });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
