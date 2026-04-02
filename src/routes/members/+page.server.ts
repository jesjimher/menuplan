import { fail } from '@sveltejs/kit';
import { getAllMembers, createMember, updateMember, deleteMember } from '$lib/server/members.js';
import { getAllTags } from '$lib/server/recipes.js';

export function load() {
	return {
		members: getAllMembers(),
		allTags: getAllTags()
	};
}

export const actions = {
	create: async ({ request }) => {
		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim();
		if (!name) return fail(400, { error: 'El nombre es obligatorio' });
		createMember({
			name,
			cannot_eat: fd.get('cannot_eat')?.toString() ?? '',
			likes: fd.get('likes')?.toString() ?? '',
			dislikes: fd.get('dislikes')?.toString() ?? ''
		});
	},
	update: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		const name = fd.get('name')?.toString().trim();
		if (!id || !name) return fail(400, { error: 'Datos incompletos' });
		updateMember(id, {
			name,
			cannot_eat: fd.get('cannot_eat')?.toString() ?? '',
			likes: fd.get('likes')?.toString() ?? '',
			dislikes: fd.get('dislikes')?.toString() ?? ''
		});
	},
	delete: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		if (!id) return fail(400, { error: 'ID inválido' });
		deleteMember(id);
	}
};
