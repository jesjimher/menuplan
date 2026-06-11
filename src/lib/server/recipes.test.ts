import { describe, it, expect, beforeEach } from 'vitest';
import { importPlantoeatRecipes, getAllTags, searchRecipes } from './recipes.js';
import { resetDb, seedRecipe } from './test-helpers.js';

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
