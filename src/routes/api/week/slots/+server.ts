import { json, error } from '@sveltejs/kit';
import { addSlot } from '$lib/server/mealSlots.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { addSlotBodySchema } from '$lib/schemas/index.js';

// Añade un hueco a una comida desde la semana indicada
export async function POST({ request }) {
	const body = await parseBody(request, addSlotBodySchema);
	try {
		const slot_id = addSlot(body.weekKey, body.weekday, body.meal_type, body.kind, body.parent_id ?? null, body.tags ?? []);
		return json({ ok: true, slot_id });
	} catch (e) {
		throw error(400, (e as Error).message);
	}
}
