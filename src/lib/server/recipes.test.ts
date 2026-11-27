import { describe, it, expect, beforeEach } from 'vitest';
import { importPlantoeatRecipes, exportPlantoeatRecipes, getAllRecipes, createRecipe, getAllTags, searchRecipes, getRecipesPlannedNearDate,
	getTopRecipesForSlot, getTopRecipesOverall, getRecentRecipesForSlot, getOldestPlannedRecipes } from './recipes.js';
import { POST as assignPost } from '../../routes/api/week/assign/+server.js';
import { resetDb, seedRecipe, slotFor } from './test-helpers.js';
import { assignRecipe } from './weekplan.js';
import { upsertSchedule } from './schedules.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey, getWeekDates } from '$lib/utils/dates.js';

beforeEach(() => resetDb());

describe('importPlantoeatRecipes', () => {
	it('parsea un bloque con tags separados por " ^ "', () => {
		const text = 'Title: Tortilla de patatas\nCourse: Comida\nTags: Huevo ^ Patata\nDirections: Batir y freír.';
		const created = importPlantoeatRecipes(text);
		expect(created).toHaveLength(1);
		expect(created[0].name).toBe('Tortilla de patatas');
		expect(created[0].tags).toBe('comida,huevo,patata');
		expect(created[0].description).toBe('Batir y freír.');
	});

	it('separa varias recetas por líneas de guiones', () => {
		const text = 'Title: Una\nCourse: Comida\n\n-----\n\nTitle: Otra\nCourse: Cena';
		const created = importPlantoeatRecipes(text);
		expect(created.map(r => r.name)).toEqual(['Una', 'Otra']);
	});

	it('admite tags separados por comas', () => {
		const text = 'Title: Ensalada\nTags: verano, ligero';
		const created = importPlantoeatRecipes(text);
		expect(created[0].tags).toBe('verano,ligero');
	});

	it('ignora bloques sin título', () => {
		expect(importPlantoeatRecipes('Tags: huérfano')).toHaveLength(0);
	});

	it('no corta las instrucciones con líneas «Algo: …» que no son claves de Plantoeat', () => {
		const text = 'Title: Sopa\nDirections: Hervir.\nNota: sin sal\nPaso final: servir';
		const [r] = importPlantoeatRecipes(text);
		expect(r.description).toBe('Hervir.\nNota: sin sal\nPaso final: servir');
	});

	it('lee el campo Min Days', () => {
		const [r] = importPlantoeatRecipes('Title: Lentejas\nMin Days: 10');
		expect(r.min_days).toBe(10);
	});
});

describe('exportPlantoeatRecipes', () => {
	it('genera texto que se reimporta sin pérdidas', () => {
		createRecipe({ name: 'Tortilla', description: 'Batir.\nNota: poco aceite\n-----\nFreír.', tags: 'comida,huevo', min_days: 7 });
		createRecipe({ name: 'Ensalada', description: '', tags: '', min_days: -1 });
		createRecipe({ name: 'Crema', description: 'Triturar', tags: 'cena, Verano', min_days: 0 });
		const strip = () => getAllRecipes().map(r => ({ name: r.name, description: r.description, tags: r.tags, min_days: r.min_days }));
		const before = strip().map(r => r.name === 'Tortilla'
			? { ...r, description: 'Batir.\nNota: poco aceite\n----\nFreír.' }
			: r.name === 'Crema' ? { ...r, tags: 'cena,verano' } : r);

		const text = exportPlantoeatRecipes();
		expect(text).toContain('Tags: comida ^ huevo');
		resetDb();
		expect(importPlantoeatRecipes(text)).toHaveLength(3);
		expect(strip()).toEqual(before);
	});
});

describe('getAllTags', () => {
	it('devuelve tags únicos en minúsculas y ordenados', () => {
		seedRecipe('Uno', 'Pasta, comida');
		seedRecipe('Dos', 'comida,Verano');
		expect(getAllTags()).toEqual(['comida', 'pasta', 'verano']);
	});
});

describe('searchRecipes', () => {
	it('filtra por texto y por tag de tipo de comida', () => {
		seedRecipe('Lentejas con chorizo', 'comida,legumbres');
		seedRecipe('Crema de calabacín', 'cena');
		expect(searchRecipes('lentejas').map(r => r.name)).toEqual(['Lentejas con chorizo']);
		expect(searchRecipes('', 'cena').map(r => r.name)).toEqual(['Crema de calabacín']);
		expect(searchRecipes('lentejas', 'cena')).toHaveLength(0);
	});
});

describe('getRecipesPlannedNearDate', () => {
	const NOW = weekKeyToIndex(getWeekKey());
	const WEEK = indexToWeekKey(NOW + 8);

	it('incluye recetas colocadas por una programación, no solo las asignadas manualmente', () => {
		const recipe = seedRecipe('Lentejas', 'legumbres');
		upsertSchedule(recipe.id, 1, 'comida', 0, 1, WEEK, 'skip', 1); // lunes
		const dates = getWeekDates(WEEK);
		const result = getRecipesPlannedNearDate(dates[2]); // miércoles
		expect(result.map(r => r.id)).toContain(recipe.id);
	});

	it('cubre la separación completa de una semana (lunes -> domingo, 6 días)', () => {
		const recipe = seedRecipe('Cocido', 'legumbres');
		assignRecipe(WEEK, slotFor(WEEK, 1, 'comida', 0, 0), recipe.id); // lunes
		const dates = getWeekDates(WEEK);
		const result = getRecipesPlannedNearDate(dates[6]); // domingo
		expect(result.map(r => r.id)).toContain(recipe.id);
	});

	it('en la cena incluye la comida del mismo día, y en la comida no', () => {
		const recipe = seedRecipe('Paella', 'arroz');
		assignRecipe(WEEK, slotFor(WEEK, 3, 'comida', 0, 0), recipe.id); // miércoles
		const dates = getWeekDates(WEEK);
		expect(getRecipesPlannedNearDate(dates[2], 7, 'cena').map(r => r.id)).toContain(recipe.id);
		expect(getRecipesPlannedNearDate(dates[2], 7, 'comida').map(r => r.id)).not.toContain(recipe.id);
	});

	it('también el lunes por la noche, aunque la semana anterior no tenga nada', () => {
		const recipe = seedRecipe('Lasaña', 'pasta');
		assignRecipe(WEEK, slotFor(WEEK, 1, 'comida', 0, 0), recipe.id); // lunes
		const dates = getWeekDates(WEEK);
		expect(getRecipesPlannedNearDate(dates[0], 7, 'cena').map(r => r.id)).toContain(recipe.id);
	});

	it('no incluye acompañamientos ni recetas ya marcadas como restos', () => {
		const acc = seedRecipe('Pan', 'acompañamiento');
		const leftover = seedRecipe('Sobras', 'legumbres');
		assignRecipe(WEEK, slotFor(WEEK, 1, 'comida', 0, 1), acc.id);
		assignRecipe(WEEK, slotFor(WEEK, 1, 'comida', 1, 0), leftover.id, 1);
		const dates = getWeekDates(WEEK);
		const result = getRecipesPlannedNearDate(dates[2]);
		expect(result.map(r => r.id)).not.toContain(acc.id);
		expect(result.map(r => r.id)).not.toContain(leftover.id);
	});
});

describe('listas del selector de recetas', () => {
	const WEEK = indexToWeekKey(weekKeyToIndex(getWeekKey()) - 1);

	it('en un acompañamiento solo ofrecen acompañamientos, y en un plato solo platos', () => {
		const plato = seedRecipe('Lentejas', 'comida');
		const pan = seedRecipe('Pan', 'acompañamiento');
		assignRecipe(WEEK, slotFor(WEEK, 1, 'comida', 0, 0), plato.id);
		assignRecipe(WEEK, slotFor(WEEK, 1, 'comida', 0, 1), pan.id);
		const ids = (list: { id: number }[]) => list.map(r => r.id);
		for (const [isAcc, ok, ko] of [[1, pan, plato], [0, plato, pan]] as const) {
			for (const list of [
				getTopRecipesForSlot(1, 'comida', 20, isAcc),
				getTopRecipesOverall('comida', 20, isAcc),
				getRecentRecipesForSlot(1, 'comida', 20, isAcc),
				getOldestPlannedRecipes('comida', 20, isAcc)
			]) {
				expect(ids(list)).toContain(ok.id);
				expect(ids(list)).not.toContain(ko.id);
			}
		}
	});

	it('un hueco de acompañamiento rechaza una receta que no lo es', async () => {
		const plato = seedRecipe('Lentejas', 'comida');
		const pan = seedRecipe('Pan', 'acompañamiento');
		const slot_id = slotFor(WEEK, 1, 'comida', 0, 1);
		const call = (recipe_id: number) => assignPost({
			request: new Request('http://x/api/week/assign', { method: 'POST', body: JSON.stringify({ weekKey: WEEK, slot_id, recipe_id }) })
		} as Parameters<typeof assignPost>[0]);
		await expect(call(plato.id)).rejects.toMatchObject({ status: 400 });
		expect((await call(pan.id)).status).toBe(200);
	});
});
