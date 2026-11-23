import { error } from '@sveltejs/kit';

export function parsePersonId(raw: string): number {
	const id = parseInt(raw);
	if (!Number.isInteger(id) || id < 1) throw error(400, 'id de persona inválido');
	return id;
}
