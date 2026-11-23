import { json } from '@sveltejs/kit';
import { getAllPeople, createPerson } from '$lib/server/people.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { createPersonBodySchema } from '$lib/schemas/index.js';

export async function GET() {
	return json(getAllPeople());
}

export async function POST({ request }) {
	const body = await parseBody(request, createPersonBodySchema);
	return json(createPerson(body.name));
}
