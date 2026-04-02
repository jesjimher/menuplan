import { fail } from '@sveltejs/kit';
import { getOptions, setOptions } from '$lib/server/options.js';

export function load() {
	return {
		options: getOptions()
	};
}

export const actions = {
	save: async ({ request }) => {
		const fd = await request.formData();
		const values = {
			default_min_days: parseInt(fd.get('default_min_days')?.toString() ?? ''),
			meals_per_day: parseInt(fd.get('meals_per_day')?.toString() ?? ''),
			dinners_per_day: parseInt(fd.get('dinners_per_day')?.toString() ?? ''),
			side_dishes_per_recipe: parseInt(fd.get('side_dishes_per_recipe')?.toString() ?? ''),
			side_dishes_per_slot: parseInt(fd.get('side_dishes_per_slot')?.toString() ?? '')
		};
		if (Object.values(values).some(v => isNaN(v))) {
			return fail(400, { error: 'Todos los campos deben ser números válidos' });
		}
		setOptions(values);
		return { saved: true };
	}
};
