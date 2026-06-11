import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekData, assignRecipe, copyPreviousWeek, updateDayConfig } from './weekplan.js';
import { resetDb, seedRecipe, seedRule } from './test-helpers.js';
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

// Semanas futuras relativas a la actual (las configs solo se vuelven sticky
// en semanas presentes o futuras).
const NOW = weekKeyToIndex(getWeekKey());
const WEEK = indexToWeekKey(NOW + 6);
const PREV = indexToWeekKey(NOW + 5);
const NEXT = indexToWeekKey(NOW + 7);

beforeEach(() => resetDb());

describe('assignRecipe + getWeekData', () => {
	it('asigna una receta y la devuelve en el slot', () => {
		const r = seedRecipe('Lentejas', 'comida,legumbres');
		assignRecipe(WEEK, 1, 'comida', 0, 0, r.id, null);
		const data = getWeekData(WEEK);
		expect(data.slots).toHaveLength(1);
		expect(data.slots[0]).toMatchObject({ weekday: 1, meal_type: 'comida', recipe: expect.objectContaining({ id: r.id }) });
	});

	it('hace upsert sobre el mismo slot (índice de expresión)', () => {
		const r1 = seedRecipe('Lentejas', 'comida');
		const r2 = seedRecipe('Garbanzos', 'comida');
		assignRecipe(WEEK, 1, 'comida', 0, 0, r1.id, null);
		assignRecipe(WEEK, 1, 'comida', 0, 0, r2.id, null);
		const rows = getDb().prepare('SELECT COUNT(*) AS n FROM week_plans WHERE week_key = ?').get(WEEK) as { n: number };
		expect(rows.n).toBe(1);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(r2.id);
	});

	it('detecta violaciones de reglas en la semana', () => {
		const r1 = seedRecipe('Pasta carbonara', 'comida,pasta');
		const r2 = seedRecipe('Macarrones', 'comida,pasta');
		seedRule('pasta', 'no_more_than', 1);
		assignRecipe(WEEK, 1, 'comida', 0, 0, r1.id, null);
		assignRecipe(WEEK, 2, 'comida', 0, 0, r2.id, null);
		const { violations } = getWeekData(WEEK);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].rule.tag).toBe('pasta');
	});
});

describe('configuración por día (week_day_config)', () => {
	it('aplica la configuración exacta de la semana', () => {
		updateDayConfig(WEEK, 1, 'comida', { recipe_count: 2 });
		expect(getWeekData(WEEK).configs[1].comida.recipe_count).toBe(2);
	});

	it('hereda la configuración sticky de semanas anteriores', () => {
		updateDayConfig(PREV, 2, 'cena', { recipe_count: 3 });
		// Semana posterior: hereda
		expect(getWeekData(WEEK).configs[2].cena.recipe_count).toBe(3);
		// Semana anterior a la config: usa el valor por defecto global
		expect(getWeekData(indexToWeekKey(NOW + 4)).configs[2].cena.recipe_count).toBe(1);
	});

	it('disabled y note solo aplican a la semana exacta', () => {
		updateDayConfig(WEEK, 1, 'comida', { disabled: 1, disabled_comment: 'fuera', note: 'nota' });
		const cfg = getWeekData(WEEK).configs[1].comida;
		expect(cfg.disabled).toBe(true);
		expect(cfg.disabled_comment).toBe('fuera');
		expect(cfg.note).toBe('nota');
		const cfgNext = getWeekData(NEXT).configs[1].comida;
		expect(cfgNext.disabled).toBe(false);
		expect(cfgNext.note).toBeNull();
	});
});

describe('copyPreviousWeek', () => {
	it('copia los slots de la semana anterior', () => {
		const r = seedRecipe('Lentejas', 'comida');
		assignRecipe(PREV, 3, 'comida', 0, 0, r.id, null);
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0]).toMatchObject({ weekday: 3, recipe: expect.objectContaining({ id: r.id }) });
	});

	it('reemplaza el contenido previo de la semana destino', () => {
		const viejo = seedRecipe('Viejo', 'comida');
		const nuevo = seedRecipe('Nuevo', 'comida');
		assignRecipe(WEEK, 1, 'comida', 0, 0, viejo.id, null);
		assignRecipe(PREV, 2, 'comida', 0, 0, nuevo.id, null);
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0].recipe?.id).toBe(nuevo.id);
	});
});
