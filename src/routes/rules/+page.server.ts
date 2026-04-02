import { fail } from '@sveltejs/kit';
import { getAllRules, createRule, updateRule, deleteRule } from '$lib/server/rules.js';
import { getAllTags } from '$lib/server/recipes.js';

export function load() {
	return {
		rules: getAllRules(),
		allTags: getAllTags()
	};
}

export const actions = {
	create: async ({ request }) => {
		const fd = await request.formData();
		const tag = fd.get('tag')?.toString().trim();
		const direction = fd.get('direction')?.toString() as 'at_least' | 'no_more_than';
		const times = parseInt(fd.get('times')?.toString() ?? '');
		if (!tag || !direction || isNaN(times)) return fail(400, { error: 'Datos incompletos' });
		createRule({ tag, direction, times });
	},
	update: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		const tag = fd.get('tag')?.toString().trim();
		const direction = fd.get('direction')?.toString() as 'at_least' | 'no_more_than';
		const times = parseInt(fd.get('times')?.toString() ?? '');
		if (!id || !tag || !direction || isNaN(times)) return fail(400, { error: 'Datos incompletos' });
		updateRule(id, { tag, direction, times });
	},
	delete: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		if (!id) return fail(400, { error: 'ID inválido' });
		deleteRule(id);
	}
};
