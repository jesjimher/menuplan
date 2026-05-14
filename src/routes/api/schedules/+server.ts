import { json } from '@sveltejs/kit';
import { getAllSchedules, upsertSchedule } from '$lib/server/schedules.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { scheduleBodySchema } from '$lib/schemas/index.js';

export async function GET() {
	return json(getAllSchedules());
}

export async function POST({ request }) {
	const body = await parseBody(request, scheduleBodySchema);
	const id = upsertSchedule(body.recipe_id, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment, body.every_n_weeks, body.anchor_week_key);
	return json({ ok: true, id });
}
