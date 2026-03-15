import { json } from '@sveltejs/kit';
import { getOptions, setOptions } from '$lib/server/options.js';

export async function GET() {
	return json(getOptions());
}

export async function PUT({ request }) {
	const body = await request.json();
	return json(setOptions(body));
}
