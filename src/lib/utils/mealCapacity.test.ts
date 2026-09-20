import { describe, it, expect } from 'vitest';
import { recipeAccompanimentIndexes, mealAccompanimentIndexes, maxSlots } from './mealCapacity.js';

const cfg = (recipe_count: number, accompaniment_per_recipe: number, accompaniment_per_slot: number) =>
	({ recipe_count, accompaniment_per_recipe, accompaniment_per_slot });

describe('mealCapacity', () => {
	it('los acompañamientos por receta ocupan bloques contiguos', () => {
		expect(recipeAccompanimentIndexes(cfg(2, 2, 0), 0)).toEqual([0, 1]);
		expect(recipeAccompanimentIndexes(cfg(2, 2, 0), 1)).toEqual([2, 3]);
		expect(recipeAccompanimentIndexes(cfg(2, 0, 0), 1)).toEqual([]);
	});

	it('los acompañamientos por franja empiezan en 0', () => {
		expect(mealAccompanimentIndexes(cfg(1, 0, 3))).toEqual([0, 1, 2]);
		expect(mealAccompanimentIndexes(cfg(1, 0, 0))).toEqual([]);
	});

	it('maxSlots: principales = recipe_count; acompañamientos = el mayor de los dos espacios', () => {
		expect(maxSlots(cfg(2, 1, 0), false)).toBe(2);
		expect(maxSlots(cfg(2, 2, 1), true)).toBe(4);
		expect(maxSlots(cfg(1, 1, 3), true)).toBe(3);
		expect(maxSlots(cfg(1, 0, 0), true)).toBe(0);
	});
});
