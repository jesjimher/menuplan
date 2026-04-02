import { json } from '@sveltejs/kit';
import { clearWeek } from '$lib/server/weekplan.js';
import { getWeekKey } from '$lib/utils/dates.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const weekKey = body.weekKey || getWeekKey();
		clearWeek(weekKey);
		return json({ ok: true });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
}
