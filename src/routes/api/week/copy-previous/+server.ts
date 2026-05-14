import { json } from '@sveltejs/kit';
import { copyPreviousWeek } from '$lib/server/weekplan.js';
import { getWeekKey, getPreviousWeekKey } from '$lib/utils/dates.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { copyPreviousBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, copyPreviousBodySchema);
	const weekKey = body.weekKey ?? getWeekKey();
	copyPreviousWeek(weekKey, getPreviousWeekKey(weekKey));
	return json({ ok: true });
}
