import { json } from '@sveltejs/kit';
import { addException, removeException } from '$lib/server/schedules.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { exceptionBodySchema } from '$lib/schemas/index.js';

export async function POST({ params, request }) {
	const body = await parseBody(request, exceptionBodySchema);
	addException(parseInt(params.id), body.week_key);
	return json({ ok: true });
}

export async function DELETE({ params, request }) {
	const body = await parseBody(request, exceptionBodySchema);
	removeException(parseInt(params.id), body.week_key);
	return json({ ok: true });
}
