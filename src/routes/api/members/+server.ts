import { json } from '@sveltejs/kit';
import { getAllMembers, createMember } from '$lib/server/members.js';

export async function GET() {
	return json(getAllMembers());
}

export async function POST({ request }) {
	const body = await request.json();
	const member = createMember({
		name: body.name,
		cannot_eat: body.cannot_eat || '',
		likes: body.likes || '',
		dislikes: body.dislikes || ''
	});
	return json(member, { status: 201 });
}
