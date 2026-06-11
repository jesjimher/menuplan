// Helpers para tests de módulos de servidor. Requiere DATABASE_PATH=':memory:'
// (lo fija src/test-setup.ts vía setupFiles de vitest).
import { getDb } from '$lib/db/index.js';
import type { Recipe, Member, Rule } from '$lib/types/index.js';
import { createRecipe } from './recipes.js';
import { createMember } from './members.js';
import { createRule } from './rules.js';

export function resetDb(): void {
	getDb().exec(`
		DELETE FROM week_plans;
		DELETE FROM schedule_exceptions;
		DELETE FROM schedules;
		DELETE FROM week_day_config;
		DELETE FROM rules;
		DELETE FROM members;
		DELETE FROM recipes;
	`);
}

export function seedRecipe(name: string, tags: string, minDays = 0): Recipe {
	return createRecipe({ name, description: '', tags, min_days: minDays });
}

export function seedMember(name: string, cannotEat = ''): Member {
	return createMember({ name, cannot_eat: cannotEat, likes: '', dislikes: '' });
}

export function seedRule(tag: string, direction: Rule['direction'], times: number): Rule {
	return createRule({ tag, direction, times });
}
