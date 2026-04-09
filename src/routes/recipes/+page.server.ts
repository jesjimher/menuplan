import { fail } from '@sveltejs/kit';
import { getAllRecipes, getAllTags, createRecipe, updateRecipe, deleteRecipe, importPlantoeatRecipes } from '$lib/server/recipes.js';

export function load() {
	return {
		recipes: getAllRecipes(),
		allTags: getAllTags()
	};
}

export const actions = {
	create: async ({ request }) => {
		const fd = await request.formData();
		const name = fd.get('name')?.toString().trim();
		if (!name) return fail(400, { error: 'El nombre es obligatorio' });
		const recipe = createRecipe({
			name,
			description: fd.get('description')?.toString() ?? '',
			tags: fd.get('tags')?.toString() ?? '',
			min_days: parseInt(fd.get('min_days')?.toString() ?? '-1')
		});
		return { createdId: recipe.id };
	},
	update: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		const name = fd.get('name')?.toString().trim();
		if (!id || !name) return fail(400, { error: 'Datos incompletos' });
		updateRecipe(id, {
			name,
			description: fd.get('description')?.toString() ?? '',
			tags: fd.get('tags')?.toString() ?? '',
			min_days: parseInt(fd.get('min_days')?.toString() ?? '-1')
		});
		return { updatedId: id };
	},
	delete: async ({ request }) => {
		const fd = await request.formData();
		const id = parseInt(fd.get('id')?.toString() ?? '');
		if (!id) return fail(400, { error: 'ID inválido' });
		deleteRecipe(id);
	},
	import: async ({ request }) => {
		const fd = await request.formData();
		const text = fd.get('import_text')?.toString();
		if (!text) return fail(400, { error: 'No hay texto para importar' });
		const imported = importPlantoeatRecipes(text);
		return { importedCount: imported.length };
	},
	bulkTag: async ({ request }) => {
		const fd = await request.formData();
		const tag = fd.get('tag')?.toString().trim().toLowerCase();
		const ids = fd.get('ids')?.toString().split(',').map(Number).filter(Boolean);
		if (!tag || !ids?.length) return fail(400, { error: 'Datos incompletos' });

		const allRecipes = getAllRecipes();
		for (const id of ids) {
			const recipe = allRecipes.find(r => r.id === id);
			if (!recipe) continue;
			const current = recipe.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
			if (current.includes(tag)) continue;
			updateRecipe(id, { tags: [...current, tag].join(',') });
		}
	},
	bulkDelete: async ({ request }) => {
		const fd = await request.formData();
		const ids = fd.get('ids')?.toString().split(',').map(Number).filter(Boolean);
		if (!ids?.length) return fail(400, { error: 'Datos incompletos' });
		for (const id of ids) deleteRecipe(id);
	}
};
