import { json, error } from '@sveltejs/kit';
import { getMemberById, updateMember, deleteMember } from '$lib/server/members.js';

export async function GET({ params }) {
	const member = getMemberById(parseInt(params.id));
	if (!member) throw error(404, 'Member not found');
	return json(member);
}

export async function PUT({ params, request }) {
	const body = await request.json();
	const member = updateMember(parseInt(params.id), body);
	if (!member) throw error(404, 'Member not found');
	return json(member);
}

export async function DELETE({ params }) {
	deleteMember(parseInt(params.id));
	return json({ ok: true });
}
