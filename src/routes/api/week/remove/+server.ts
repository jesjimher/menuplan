import { json } from '@sveltejs/kit';
import { removeRecipe } from '$lib/server/weekplan.js';
import { getScheduleForSlot, deleteSchedule } from '$lib/server/schedules.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { removeBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, removeBodySchema);
	const { weekKey, weekday, meal_type, slot_index, is_accompaniment, force } = body;

	if (!force) {
		const sched = getScheduleForSlot(weekday, meal_type, slot_index, is_accompaniment);
		if (sched) {
			return json({ ok: true, had_schedule: true, schedule_id: sched.id, every_n_weeks: sched.every_n_weeks });
		}
	}

	if (force === 'full_schedule') {
		const sched = getScheduleForSlot(weekday, meal_type, slot_index, is_accompaniment);
		if (sched) deleteSchedule(sched.id);
	}

	removeRecipe(weekKey, weekday, meal_type, slot_index, is_accompaniment);
	return json({ ok: true, had_schedule: false });
}
