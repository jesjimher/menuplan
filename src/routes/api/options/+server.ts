import { json } from '@sveltejs/kit';
import { getOptions } from '$lib/server/options.js';

export async function GET() {
	return json(getOptions());
}
