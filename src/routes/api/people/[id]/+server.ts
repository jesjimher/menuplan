import { json, error } from '@sveltejs/kit';
import { updatePerson, deletePerson } from '$lib/server/people.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { updatePersonBodySchema } from '$lib/schemas/index.js';
import { parsePersonId } from './parseId.js';

export async function PATCH({ params, request }) {
	const body = await parseBody(request, updatePersonBodySchema);
	const person = updatePerson(parsePersonId(params.id), body);
	if (!person) throw error(404, 'Persona no encontrada');
	return json(person);
}

export async function DELETE({ params }) {
	deletePerson(parsePersonId(params.id));
	return json({ ok: true });
}
