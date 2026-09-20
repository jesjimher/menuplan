// Reglas de capacidad de una comida (día + tipo), compartidas por servidor y cliente.
//
// Los platos principales ocupan slot_index 0..recipe_count-1. Los acompañamientos comparten
// un único espacio de índices entre dos orígenes:
//   - "por receta": accompaniment_per_recipe por cada plato principal, en bloques contiguos
//     (el acompañamiento `a` del plato `s` es el índice s * accompaniment_per_recipe + a);
//   - "por franja": accompaniment_per_slot compartidos por toda la comida, índices 0..n-1.
import type { MealConfig } from '$lib/types/index.js';

type Capacity = Pick<MealConfig, 'recipe_count' | 'accompaniment_per_recipe' | 'accompaniment_per_slot'>;

function range(n: number): number[] {
	return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}

/** slot_index de los acompañamientos "por receta" del plato principal `recipeSlot`. */
export function recipeAccompanimentIndexes(cfg: Capacity, recipeSlot: number): number[] {
	return range(cfg.accompaniment_per_recipe).map(a => recipeSlot * cfg.accompaniment_per_recipe + a);
}

/** slot_index de los acompañamientos "por franja" (compartidos por toda la comida). */
export function mealAccompanimentIndexes(cfg: Capacity): number[] {
	return range(cfg.accompaniment_per_slot);
}

/** Número de huecos (slot_index 0..n-1) que la rejilla pinta para platos principales o acompañamientos. */
export function maxSlots(cfg: Capacity, isAccompaniment: boolean): number {
	return isAccompaniment
		? Math.max(cfg.recipe_count * cfg.accompaniment_per_recipe, cfg.accompaniment_per_slot)
		: cfg.recipe_count;
}
