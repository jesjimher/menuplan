import { describe, it, expect, beforeEach } from 'vitest';
import { importPlantoeatRecipes, getAllTags, searchRecipes, getRecipesPlannedNearDate } from './recipes.js';
import { resetDb, seedRecipe } from './test-helpers.js';
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
		assignRecipe(WEEK, 1, 'comida', 0, 0, recipe.id, null); // lunes
		const dates = getWeekDates(WEEK);
		const result = getRecipesPlannedNearDate(dates[6]); // domingo
		expect(result.map(r => r.id)).toContain(recipe.id);
	});

	it('no incluye acompañamientos ni recetas ya marcadas como restos', () => {
		const acc = seedRecipe('Pan', 'acompañamiento');
		const leftover = seedRecipe('Sobras', 'legumbres');
		assignRecipe(WEEK, 1, 'comida', 0, 1, acc.id, null);
		assignRecipe(WEEK, 1, 'comida', 1, 0, leftover.id, null, 1);
		const dates = getWeekDates(WEEK);
		const result = getRecipesPlannedNearDate(dates[2]);
		expect(result.map(r => r.id)).not.toContain(acc.id);
		expect(result.map(r => r.id)).not.toContain(leftover.id);
	});
});
