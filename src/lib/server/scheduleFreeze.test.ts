import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekData } from './weekplan.js';
import { upsertSchedule, deleteSchedule, moveSchedule, addException } from './schedules.js';
import { freezeSchedulesBefore, withFrozenPast, shiftScheduleRotation, countSchedulesForMeal } from './scheduleFreeze.js';
import { resetDb, seedRecipe } from './test-helpers.js';
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

const NOW = weekKeyToIndex(getWeekKey());
const wk = (offset: number) => indexToWeekKey(NOW + offset);

/** Nombres de las recetas del lunes-comida de una semana. */
function mondayLunch(offset: number): string[] {
	return getWeekData(wk(offset)).slots
		.filter(s => s.weekday === 1 && s.meal_type === 'comida' && s.is_accompaniment === 0)
		.map(s => s.recipe?.name ?? '');
}

function snapshot(from: number, to: number): string[][] {
	const out: string[][] = [];
	for (let i = from; i <= to; i++) out.push(mondayLunch(i));
	return out;
}

function schedule(name: string, every: number, anchorOffset: number): number {
	const r = seedRecipe(name, 'comida');
	return upsertSchedule(r.id, 1, 'comida', 0, every, wk(anchorOffset), 'skip', 5);
}

beforeEach(() => resetDb());

describe('withFrozenPast', () => {
	it('eliminar una programación no cambia las semanas pasadas', () => {
		const id = schedule('Arroz', 2, -10);
		const before = snapshot(-10, -1);
		withFrozenPast(() => deleteSchedule(id));
		expect(snapshot(-10, -1)).toEqual(before);
		expect(snapshot(0, 3).flat()).toEqual([]);
	});

	it('mover una programación de día no cambia el pasado y sí el futuro', () => {
		const id = schedule('Arroz', 1, -4);
		const before = snapshot(-4, -1);
		const result = withFrozenPast(() => moveSchedule(id, 2));
		expect(result.ok).toBe(true);
		expect(snapshot(-4, -1)).toEqual(before);
		expect(mondayLunch(0)).toEqual([]);
		const tuesday = getWeekData(wk(0)).slots.filter(s => s.weekday === 2);
		expect(tuesday.map(s => s.recipe?.name)).toEqual(['Arroz']);
	});

	it('cambiar la frecuencia no cambia el pasado', () => {
		const r = seedRecipe('Arroz', 'comida');
		upsertSchedule(r.id, 1, 'comida', 0, 1, wk(-6), 'skip', 5);
		const before = snapshot(-6, -1);
		withFrozenPast(() => upsertSchedule(r.id, 1, 'comida', 0, 3, wk(-6), 'skip', 5));
		expect(snapshot(-6, -1)).toEqual(before);
		// Futuro: cada 3 semanas desde el ancla original (-6 → 0, 3, 6...)
		expect(snapshot(0, 3)).toEqual([['Arroz'], [], [], ['Arroz']]);
	});

	it('crear una programación con ancla en el pasado no la muestra en el pasado', () => {
		const r = seedRecipe('Arroz', 'comida');
		withFrozenPast(() => upsertSchedule(r.id, 1, 'comida', 0, 2, wk(-5), 'skip', 5));
		expect(snapshot(-5, -1).flat()).toEqual([]);
		// Mantiene la fase: -5, -3, -1, 1, 3...
		expect(snapshot(0, 3)).toEqual([[], ['Arroz'], [], ['Arroz']]);
	});

	it('es idempotente', () => {
		schedule('Arroz', 2, -6);
		freezeSchedulesBefore();
		const rows1 = getDb().prepare('SELECT COUNT(*) AS n FROM week_plans').get() as { n: number };
		const anchors1 = getDb().prepare('SELECT anchor_week_key FROM schedules').all();
		freezeSchedulesBefore();
		const rows2 = getDb().prepare('SELECT COUNT(*) AS n FROM week_plans').get() as { n: number };
		expect(rows2.n).toBe(rows1.n);
		expect(getDb().prepare('SELECT anchor_week_key FROM schedules').all()).toEqual(anchors1);
		expect(rows1.n).toBe(3); // -6, -4, -2
	});
});

describe('shiftScheduleRotation', () => {
	function rotation() {
		const a = schedule('Arroz', 3, -3);
		const m = schedule('Macarrones', 3, -2);
		const l = schedule('Lentejas', 3, -1);
		return { a, m, l };
	}

	it('adelanta la rotación una semana y la quitada vuelve al final', () => {
		rotation();
		expect(snapshot(0, 3)).toEqual([['Arroz'], ['Macarrones'], ['Lentejas'], ['Arroz']]);
		const past = snapshot(-3, -1);
		shiftScheduleRotation(wk(0), 1, 'comida', 0);
		expect(snapshot(0, 3)).toEqual([['Macarrones'], ['Lentejas'], ['Arroz'], ['Macarrones']]);
		expect(snapshot(-3, -1)).toEqual(past);
	});

	it('las excepciones futuras siguen a su aparición', () => {
		const { l } = rotation();
		addException(l, wk(5)); // lentejas: 2, 5, 8 → se excluye la de la semana 5
		shiftScheduleRotation(wk(0), 1, 'comida', 0);
		// Tras adelantar, lentejas cae en 1, 4, 7: la excluida ahora es la 4
		expect(snapshot(0, 7)).toEqual([['Macarrones'], ['Lentejas'], ['Arroz'], ['Macarrones'], [], ['Arroz'], ['Macarrones'], ['Lentejas']]);
	});

	it('desplazar en una semana futura no altera las semanas intermedias', () => {
		rotation();
		const before = snapshot(-3, 1);
		shiftScheduleRotation(wk(2), 1, 'comida', 0);
		expect(snapshot(-3, 1)).toEqual(before);
		// Semana 2 era lentejas → ahora arroz (lo que tocaba en la 3), luego macarrones, luego lentejas
		expect(snapshot(2, 5)).toEqual([['Arroz'], ['Macarrones'], ['Lentejas'], ['Arroz']]);
	});

	it('rechaza semanas pasadas', () => {
		rotation();
		expect(() => shiftScheduleRotation(wk(-1), 1, 'comida', 0)).toThrow();
	});

	it('cuenta las programaciones del hueco', () => {
		rotation();
		expect(countSchedulesForMeal(1, 'comida', 0)).toBe(3);
		expect(countSchedulesForMeal(2, 'comida', 0)).toBe(0);
	});
});
