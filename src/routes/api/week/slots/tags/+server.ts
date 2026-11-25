import { json, error } from '@sveltejs/kit';
import { setSlotTags } from '$lib/server/mealSlots.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { slotTagsBodySchema } from '$lib/schemas/index.js';

// Tags exigidos a un hueco desde la semana indicada (solo esa semana si es pasada)
export async function POST({ request }) {
	const body = await parseBody(request, slotTagsBodySchema);
	try {
		setSlotTags(body.weekKey, body.slot_id, body.tags);
	} catch (e) {
		throw error(400, (e as Error).message);
	}
	return json({ ok: true });
}
