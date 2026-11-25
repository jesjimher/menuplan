import { json } from '@sveltejs/kit';
import { setSlotPeople } from '$lib/server/weekplan.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { slotPeopleBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, slotPeopleBodySchema);
	const slot_id = setSlotPeople(body.weekKey, body.slot_id, body.recipe_id, body.people);
	return json({ ok: true, slot_id });
}
