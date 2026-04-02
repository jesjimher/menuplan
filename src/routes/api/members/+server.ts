import { json } from '@sveltejs/kit';
import { getAllMembers } from '$lib/server/members.js';

export async function GET() {
	return json(getAllMembers());
}
