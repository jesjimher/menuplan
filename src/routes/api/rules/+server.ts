import { json } from '@sveltejs/kit';
import { getAllRules, createRule } from '$lib/server/rules.js';

export async function GET() {
	return json(getAllRules());
}

export async function POST({ request }) {
	const body = await request.json();
	const rule = createRule({
		tag: body.tag,
		direction: body.direction,
		times: body.times
	});
	return json(rule, { status: 201 });
}
