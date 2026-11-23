import { json } from '@sveltejs/kit';
import { reorderPeople } from '$lib/server/people.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { reorderPeopleBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, reorderPeopleBodySchema);
	reorderPeople(body.ids);
	return json({ ok: true });
}
