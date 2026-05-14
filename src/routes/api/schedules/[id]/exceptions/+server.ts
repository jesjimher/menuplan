import { json } from '@sveltejs/kit';
import { addException, removeException } from '$lib/server/schedules.js';

export async function POST({ params, request }) {
	try {
		const body = await request.json();
		addException(parseInt(params.id), body.week_key);
		return json({ ok: true });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}

export async function DELETE({ params, request }) {
	try {
		const body = await request.json();
		removeException(parseInt(params.id), body.week_key);
		return json({ ok: true });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
