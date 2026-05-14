import { json } from '@sveltejs/kit';
import { deleteSchedule } from '$lib/server/schedules.js';

export async function DELETE({ params }) {
	try {
		deleteSchedule(parseInt(params.id));
		return json({ ok: true });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
