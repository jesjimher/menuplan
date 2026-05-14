import { json } from '@sveltejs/kit';
import { removeRecipe } from '$lib/server/weekplan.js';
import { getScheduleForSlot, deleteSchedule } from '$lib/server/schedules.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { weekKey, weekday, meal_type, slot_index, is_accompaniment, force } = body;
		const slotIdx = slot_index ?? 0;
		const isAcc = is_accompaniment ?? 0;

		if (!force) {
			const sched = getScheduleForSlot(weekday, meal_type, slotIdx, isAcc);
			if (sched) {
				return json({ ok: true, had_schedule: true, schedule_id: sched.id, every_n_weeks: sched.every_n_weeks });
			}
		}

		if (force === 'full_schedule') {
			const sched = getScheduleForSlot(weekday, meal_type, slotIdx, isAcc);
			if (sched) deleteSchedule(sched.id);
		}

		removeRecipe(weekKey, weekday, meal_type, slotIdx, isAcc);
		return json({ ok: true, had_schedule: false });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
