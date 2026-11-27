// Helpers para tests de módulos de servidor. Requiere DATABASE_PATH=':memory:'
// (lo fija src/test-setup.ts vía setupFiles de vitest).
import { getDb } from '$lib/db/index.js';
import type { Recipe, Rule, MealSlotKind } from '$lib/types/index.js';
import { createRecipe } from './recipes.js';
import { createRule } from './rules.js';
import { addSlot, getSlotRowsForWeek } from './mealSlots.js';

/** Semana desde la que rigen los huecos base que crea resetDb. */
export const BASE_WEEK = '2000-W01';

/**
 * Vacía la BD y deja un plato por comida (comida y cena, todos los días) vigente desde
 * BASE_WEEK sin final, como en una instalación nueva. Sin marca de consolidación.
 */
export function resetDb(): void {
	const db = getDb();
	db.exec(`
		DELETE FROM week_plans;
		DELETE FROM schedule_exceptions;
		DELETE FROM schedules;
		DELETE FROM meal_slots;
		DELETE FROM week_meal_state;
		DELETE FROM rules;
		DELETE FROM recipes;
		DELETE FROM people;
		DELETE FROM options WHERE key = 'schedules_consolidated_through';
	`);
	const ins = db.prepare(`
		INSERT INTO meal_slots (slot_id, weekday, meal_type, kind, effective_from, effective_to, position, tags)
		VALUES (0, ?, ?, 'main', ?, NULL, 0, '')
	`);
	for (let d = 1; d <= 7; d++) {
		for (const meal of ['comida', 'cena']) {
			const id = ins.run(d, meal, BASE_WEEK).lastInsertRowid as number;
			db.prepare('UPDATE meal_slots SET slot_id = ? WHERE id = ?').run(id, id);
		}
	}
}

/** Huecos vigentes de un tipo en una comida, por orden. */
export function slotsOf(weekKey: string, weekday: number, mealType: string, kind: MealSlotKind = 'main'): number[] {
	return getSlotRowsForWeek(weekKey)
		.filter(s => s.weekday === weekday && s.meal_type === mealType && s.kind === kind)
		.map(s => s.slot_id);
}

/** slot_id del plato número `index` de una comida esa semana (crea los que falten desde esa semana). */
export function mainSlot(weekKey: string, weekday: number, mealType: string, index = 0): number {
	let ids = slotsOf(weekKey, weekday, mealType);
	while (ids.length <= index) {
		addSlot(weekKey, weekday, mealType, 'main');
		ids = slotsOf(weekKey, weekday, mealType);
	}
	return ids[index];
}

export function seedRecipe(name: string, tags: string, minDays = 0): Recipe {
	return createRecipe({ name, description: '', tags, min_days: minDays });
}

export function seedRule(tag: string, direction: Rule['direction'], times: number, people: number[] = []): Rule {
	return createRule({ tag, direction, times, people });
}

/** slot_id del acompañamiento número `index` (crea los que falten desde esa semana). */
export function accSlot(weekKey: string, weekday: number, mealType: string, index = 0): number {
	const meal = () => getSlotRowsForWeek(weekKey)
		.filter(s => s.weekday === weekday && s.meal_type === mealType && s.kind === 'acc')
		.map(s => s.slot_id);
	let ids = meal();
	while (ids.length <= index) {
		addSlot(weekKey, weekday, mealType, 'acc');
		ids = meal();
	}
	return ids[index];
}

/** Atajo con la forma de la antigua coordenada (índice + es acompañamiento). */
export function slotFor(weekKey: string, weekday: number, mealType: string, index = 0, isAcc = 0): number {
	return isAcc ? accSlot(weekKey, weekday, mealType, index) : mainSlot(weekKey, weekday, mealType, index);
}
