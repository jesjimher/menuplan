import { json, error } from '@sveltejs/kit';
import { getRuleById, updateRule, deleteRule } from '$lib/server/rules.js';

export async function PUT({ params, request }) {
	const body = await request.json();
	const rule = updateRule(parseInt(params.id), body);
	if (!rule) throw error(404, 'Rule not found');
	return json(rule);
}

export async function DELETE({ params }) {
	deleteRule(parseInt(params.id));
	return json({ ok: true });
}
