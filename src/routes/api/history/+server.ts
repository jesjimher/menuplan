import { json } from '@sveltejs/kit';
import { getHistory } from '$lib/server/weekplan.js';

export async function GET() {
	return json(getHistory());
}
