import { fail } from '@sveltejs/kit';
import { getAllRules, createRule, updateRule, deleteRule } from '$lib/server/rules.js';
import { getAllTags } from '$lib/server/recipes.js';
import { getActivePeople } from '$lib/server/people.js';

export function load() {
	return {
		rules: getAllRules(),
		allTags: getAllTags(),
		people: getActivePeople()
	};
}

// Personas de la regla: un campo "people" por id; ninguno = se aplica a cada persona
function parsePeople(fd: FormData): number[] {
	return fd.getAll('people').map(v => parseInt(v.toString())).filter(n => Number.isInteger(n) && n > 0);
}

export const actions = {
	create: async ({ request }) => {
		const fd = await request.formData();
		const tag = fd.get('tag')?.toString().trim();
		const direction = fd.get('direction')?.toString() as 'at_least' | 'no_more_than';
		const times = parseInt(fd.get('times')?.toString() ?? '');
		if (!tag || !direction || isNaN(times)) return fail(400, { error: 'Datos incompletos' });
		createRule({ tag, direction, times, people: parsePeople(fd) });
	},
	update: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		const tag = fd.get('tag')?.toString().trim();
		const direction = fd.get('direction')?.toString() as 'at_least' | 'no_more_than';
		const times = parseInt(fd.get('times')?.toString() ?? '');
		if (!id || !tag || !direction || isNaN(times)) return fail(400, { error: 'Datos incompletos' });
		updateRule(id, { tag, direction, times, people: parsePeople(fd) });
	},
	delete: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		if (!id) return fail(400, { error: 'ID inválido' });
		deleteRule(id);
	}
};
