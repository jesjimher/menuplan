import { json } from '@sveltejs/kit';
import { getAllSchedules, upsertSchedule } from '$lib/server/schedules.js';

export async function GET() {
	return json(getAllSchedules());
}

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { recipe_id, weekday, meal_type, slot_index, is_accompaniment, every_n_weeks, anchor_week_key } = body;
		const id = upsertSchedule(recipe_id, weekday, meal_type, slot_index ?? 0, is_accompaniment ?? 0, every_n_weeks, anchor_week_key);
		return json({ ok: true, id });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
