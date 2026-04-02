import { json } from '@sveltejs/kit';
import { getAllRules } from '$lib/server/rules.js';

export async function GET() {
	return json(getAllRules());
}
