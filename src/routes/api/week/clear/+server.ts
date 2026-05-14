import { json } from '@sveltejs/kit';
import { clearWeek } from '$lib/server/weekplan.js';
import { getWeekKey } from '$lib/utils/dates.js';
import { parseBody } from '$lib/utils/parseBody.js';
import { clearBodySchema } from '$lib/schemas/index.js';

export async function POST({ request }) {
	const body = await parseBody(request, clearBodySchema);
	clearWeek(body.weekKey ?? getWeekKey());
	return json({ ok: true });
}
