import { json } from '@sveltejs/kit';
import { updateDayConfig, updateSlotRequiredTag } from '$lib/server/weekplan.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { configBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, configBodySchema);
	if ('required_tags' in body) {
		updateSlotRequiredTag(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.required_tags);
	} else {
		updateDayConfig(body.weekKey, body.weekday, body.meal_type, body);
	}
	return json({ ok: true });
}
