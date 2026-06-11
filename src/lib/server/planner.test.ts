import { describe, it, expect, beforeEach } from 'vitest';
import { calculatePlan, getDiscardedRecipes } from './planner.js';
import { assignRecipe, getWeekData } from './weekplan.js';
import { resetDb, seedRecipe, seedMember, seedRule } from './test-helpers.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

// Semanas relativas a la actual para que wasPlannedRecently se comporte igual
// independientemente de cuándo se ejecuten los tests.
const NOW = weekKeyToIndex(getWeekKey());
const WEEK = indexToWeekKey(NOW + 6);
const ONE_WEEK_AGO = indexToWeekKey(NOW + 5);
const TWO_WEEKS_AGO = indexToWeekKey(NOW + 4);

function slot(weekday: number, mealType: 'comida' | 'cena', extra: Record<string, unknown> = {}) {
	return { weekday, meal_type: mealType, slot_index: 0, is_accompaniment: 0, member_id: null, ...extra };
}

beforeEach(() => resetDb());

describe('calculatePlan', () => {
	it('rellena un slot con una receta del tipo de comida', () => {
		const r = seedRecipe('Lentejas', 'comida,legumbres');
		seedRecipe('Pescado a la plancha', 'cena');
		calculatePlan(WEEK, [slot(1, 'comida')], []);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0].recipe?.id).toBe(r.id);
	});

	it('respeta las restricciones dietéticas de los miembros', () => {
		seedRecipe('Paella de marisco', 'comida,marisco');
		const ok = seedRecipe('Arroz a la cubana', 'comida');
		seedMember('Ana', 'marisco');
		calculatePlan(WEEK, [slot(1, 'comida')], []);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(ok.id);
	});

	it('descarta recetas planificadas hace menos de min_days', () => {
		const reciente = seedRecipe('Cocido', 'comida', 30);
		const otra = seedRecipe('Ensalada', 'comida');
		assignRecipe(ONE_WEEK_AGO, 1, 'comida', 0, 0, reciente.id, null);
		calculatePlan(WEEK, [slot(2, 'comida')], []);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(otra.id);
	});

	it('relaja min_days al 50% si no hay candidatos', () => {
		// Planificada hace 2 semanas (~18 días): min_days 20 la excluye,
		// pero el reintento relajado (10 días) la admite.
		const unica = seedRecipe('Fabada', 'comida', 20);
		assignRecipe(TWO_WEEKS_AGO, 1, 'comida', 0, 0, unica.id, null);
		calculatePlan(WEEK, [slot(1, 'comida')], []);
		expect(getWeekData(WEEK).slots.some(s => s.recipe?.id === unica.id)).toBe(true);
	});

	it('no supera reglas no_more_than', () => {
		seedRecipe('Pasta carbonara', 'comida,pasta');
		seedRecipe('Macarrones', 'comida,pasta');
		seedRule('pasta', 'no_more_than', 1);
		calculatePlan(WEEK, [slot(1, 'comida'), slot(2, 'comida')], []);
		const filled = getWeekData(WEEK).slots.filter(s => s.recipe);
		expect(filled).toHaveLength(1);
	});

	it('prioriza recetas que ayudan a reglas at_least', () => {
		const legumbres = seedRecipe('Garbanzos', 'comida,legumbres');
		seedRecipe('Filete', 'comida');
		seedRule('legumbres', 'at_least', 1);
		calculatePlan(WEEK, [slot(1, 'comida')], []);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(legumbres.id);
	});

	it('aplica los required_tags del slot', () => {
		seedRecipe('Filete', 'comida');
		const pez = seedRecipe('Merluza', 'comida,pescado');
		calculatePlan(WEEK, [slot(1, 'comida', { required_tags: ['pescado'] })], []);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(pez.id);
	});

	it('los acompañamientos usan el tag acompañamiento', () => {
		seedRecipe('Filete', 'comida');
		const acc = seedRecipe('Patatas fritas', 'acompañamiento');
		calculatePlan(WEEK, [slot(1, 'comida', { is_accompaniment: 1 })], []);
		const s = getWeekData(WEEK).slots[0];
		expect(s.recipe?.id).toBe(acc.id);
		expect(s.is_accompaniment).toBe(1);
	});
});

describe('getDiscardedRecipes', () => {
	it('explica el descarte por restricción dietética', () => {
		seedMember('Ana', 'marisco');
		seedRecipe('Paella de marisco', 'comida,marisco');
		const d = getDiscardedRecipes(WEEK, 1, 'comida', 0, 0, []);
		expect(d).toHaveLength(1);
		expect(d[0].reason).toContain('marisco');
	});

	it('explica el descarte por min_days', () => {
		const r = seedRecipe('Cocido', 'comida', 30);
		assignRecipe(ONE_WEEK_AGO, 1, 'comida', 0, 0, r.id, null);
		const d = getDiscardedRecipes(WEEK, 1, 'comida', 0, 0, []);
		expect(d).toHaveLength(1);
		expect(d[0].reason).toContain('recientemente');
	});

	it('no descarta recetas válidas', () => {
		seedRecipe('Ensalada', 'comida');
		expect(getDiscardedRecipes(WEEK, 1, 'comida', 0, 0, [])).toHaveLength(0);
	});
});
