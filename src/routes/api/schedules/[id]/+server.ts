import { json, error } from '@sveltejs/kit';
import { deleteSchedule, moveSchedule } from '$lib/server/schedules.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { scheduleMoveBodySchema } from '$lib/schemas/index.js';

export async function DELETE({ params }) {
	deleteSchedule(parseInt(params.id));
	return json({ ok: true });
}

export async function PATCH({ params, request }) {
	const body = await parseBody(request, scheduleMoveBodySchema);
	const result = moveSchedule(parseInt(params.id), body.weekday, body.anchor_week_key);
	if (!result.ok) {
		if (result.error === 'not_found') throw error(404, 'Programación no encontrada');
		throw error(409, 'Ya existe una programación de esta receta para ese día');
	}
	return json({ ok: true });
}
