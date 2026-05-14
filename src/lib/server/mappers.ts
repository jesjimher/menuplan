import type { Recipe, MealType } from '$lib/types/index.js';

export interface RecipeRow {
	id: number;
	name: string;
	description: string;
	tags: string;
	min_days: number;
	image_type: string | null;
	created_at: string;
}

export function mapRowToRecipe(row: Record<string, unknown>, prefix = ''): Recipe {
	return {
		id: row[`${prefix}id`] as number,
		name: row[`${prefix}name`] as string,
		description: row[`${prefix}description`] as string,
		tags: row[`${prefix}tags`] as string,
		min_days: row[`${prefix}min_days`] as number,
		image_type: (row[`${prefix}image_type`] as string | null) ?? null,
		created_at: row[`${prefix}created_at`] as string,
	};
}
