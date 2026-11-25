import { json } from '@sveltejs/kit';
import { removeSlot } from '$lib/server/mealSlots.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { removeSlotBodySchema } from '$lib/schemas/index.js';

// Quita un hueco desde la semana indicada (solo esa semana si es pasada)
export async function POST({ request }) {
	const body = await parseBody(request, removeSlotBodySchema);
	removeSlot(body.weekKey, body.slot_id);
	return json({ ok: true });
}
