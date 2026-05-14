import { json } from '@sveltejs/kit';
import { deleteSchedule } from '$lib/server/schedules.js';

export async function DELETE({ params }) {
	deleteSchedule(parseInt(params.id));
	return json({ ok: true });
}
