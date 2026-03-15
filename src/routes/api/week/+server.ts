import { json } from '@sveltejs/kit';
import { getWeekData } from '$lib/server/weekplan.js';
import { getWeekKey } from '$lib/utils/dates.js';

export async function GET({ url }) {
	const weekKey = url.searchParams.get('weekKey') || getWeekKey();
	return json(getWeekData(weekKey));
}
