import { json } from '@sveltejs/kit';
import { setSlotPeople } from '$lib/server/weekplan.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { slotPeopleBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, slotPeopleBodySchema);
	setSlotPeople(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment, body.recipe_id, body.people);
	return json({ ok: true });
}
