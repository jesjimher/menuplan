import { json } from '@sveltejs/kit';
import { copyPreviousWeek } from '$lib/server/weekplan.js';
import { getWeekKey, getPreviousWeekKey } from '$lib/utils/dates.js';

export async function POST({ request }) {
	const body = await request.json();
	const weekKey = body.weekKey || getWeekKey();
	const previousWeekKey = getPreviousWeekKey(weekKey);
	copyPreviousWeek(weekKey, previousWeekKey);
	return json({ ok: true });
}
