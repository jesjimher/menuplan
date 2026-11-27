import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekData, assignRecipe, removeRecipe, copyPreviousWeek, updateDayConfig } from './weekplan.js';
import { addSlot, removeSlot, setSlotTags } from './mealSlots.js';
import { upsertSchedule } from './schedules.js';
import { resetDb, seedRecipe, seedRule, mainSlot, accSlot, slotsOf } from './test-helpers.js';
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

// Semanas futuras relativas a la actual (los cambios de huecos solo se propagan hacia
// delante cuando se hacen en la semana actual o futuras).
const NOW = weekKeyToIndex(getWeekKey());
const wk = (offset: number) => indexToWeekKey(NOW + offset);
const WEEK = wk(6);
const PREV = wk(5);
const NEXT = wk(7);

const mains = (week: string, d = 1, meal = 'comida') => getWeekData(week).configs[d][meal as 'comida'].slots.filter(s => s.kind === 'main');
const tagsOf = (week: string, slotId: number) => getWeekData(week).configs[1].comida.slots.find(s => s.id === slotId)?.tags;
const versions = (slotId: number) => (getDb().prepare('SELECT COUNT(*) AS n FROM meal_slots WHERE slot_id = ?').get(slotId) as { n: number }).n;

beforeEach(() => resetDb());

describe('assignRecipe + getWeekData', () => {
	it('asigna una receta y la devuelve en el hueco', () => {
		const r = seedRecipe('Lentejas', 'comida,legumbres');
		const slot = mainSlot(WEEK, 1, 'comida');
		assignRecipe(WEEK, slot, r.id);
		const data = getWeekData(WEEK);
		expect(data.slots).toHaveLength(1);
		expect(data.slots[0]).toMatchObject({ weekday: 1, meal_type: 'comida', slot_id: slot, recipe: expect.objectContaining({ id: r.id }) });
	});

	it('hace upsert sobre el mismo hueco', () => {
		const r1 = seedRecipe('Lentejas', 'comida');
		const r2 = seedRecipe('Garbanzos', 'comida');
		const slot = mainSlot(WEEK, 1, 'comida');
		assignRecipe(WEEK, slot, r1.id);
		assignRecipe(WEEK, slot, r2.id);
		const rows = getDb().prepare('SELECT COUNT(*) AS n FROM week_plans WHERE week_key = ?').get(WEEK) as { n: number };
		expect(rows.n).toBe(1);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(r2.id);
	});

	it('rechaza un hueco que no existe esa semana', () => {
		const r = seedRecipe('Lentejas', 'comida');
		const slot = addSlot(WEEK, 1, 'comida', 'main');
		expect(() => assignRecipe(PREV, slot, r.id)).toThrow();
	});

	it('detecta violaciones de reglas en la semana', () => {
		const r1 = seedRecipe('Pasta carbonara', 'comida,pasta');
		const r2 = seedRecipe('Macarrones', 'comida,pasta');
		seedRule('pasta', 'no_more_than', 1);
		assignRecipe(WEEK, mainSlot(WEEK, 1, 'comida'), r1.id);
		assignRecipe(WEEK, mainSlot(WEEK, 2, 'comida'), r2.id);
		const { violations } = getWeekData(WEEK);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].rule.tag).toBe('pasta');
	});
});

describe('huecos con vigencia (meal_slots)', () => {
	it('añadir un hueco rige desde esa semana en adelante', () => {
		addSlot(WEEK, 1, 'comida', 'main');
		expect(mains(PREV)).toHaveLength(1);
		expect(mains(WEEK)).toHaveLength(2);
		expect(mains(wk(40))).toHaveLength(2);
	});

	it('quitar un hueco concreto deja los demás intactos, con sus tags', () => {
		const trabajo = mainSlot(WEEK, 1, 'comida', 0);
		const rapido = mainSlot(WEEK, 1, 'comida', 1);
		setSlotTags(WEEK, trabajo, ['trabajo']);
		setSlotTags(WEEK, rapido, ['rápido']);
		removeSlot(WEEK, trabajo);
		const left = mains(WEEK);
		expect(left.map(s => s.id)).toEqual([rapido]);
		expect(left[0].tags).toEqual(['rápido']);
		// Antes de la semana del cambio el hueco sigue existiendo
		expect(mains(PREV).map(s => s.id)).toContain(trabajo);
	});

	it('quitar un hueco borra sus recetas desde esa semana, no las anteriores', () => {
		const r = seedRecipe('Lentejas', 'comida');
		const slot = mainSlot(PREV, 1, 'comida');
		assignRecipe(PREV, slot, r.id);
		assignRecipe(WEEK, slot, r.id);
		removeSlot(WEEK, slot);
		expect(getWeekData(PREV).slots).toHaveLength(1);
		expect(getWeekData(WEEK).slots).toHaveLength(0);
	});

	it('cambiar tags en una semana no afecta a las anteriores y se mantiene después', () => {
		const slot = mainSlot(WEEK, 1, 'comida');
		setSlotTags(PREV, slot, ['trabajo']);
		setSlotTags(WEEK, slot, ['rápido']);
		expect(tagsOf(wk(4), slot)).toEqual([]);
		expect(tagsOf(PREV, slot)).toEqual(['trabajo']);
		expect(tagsOf(WEEK, slot)).toEqual(['rápido']);
		expect(tagsOf(wk(30), slot)).toEqual(['rápido']);
		// Las recetas siguen en el mismo hueco: el id no cambia entre versiones
		expect(mains(WEEK)[0].id).toBe(slot);
	});

	it('un cambio rige hasta el siguiente cambio que ya existía', () => {
		const slot = mainSlot(WEEK, 1, 'comida');
		setSlotTags(NEXT, slot, ['carne']);
		setSlotTags(WEEK, slot, ['pasta']);
		expect(tagsOf(WEEK, slot)).toEqual(['pasta']);
		expect(tagsOf(NEXT, slot)).toEqual(['carne']);
	});

	it('volver a los tags anteriores fusiona las versiones', () => {
		const slot = mainSlot(WEEK, 1, 'comida');
		expect(versions(slot)).toBe(1);
		setSlotTags(WEEK, slot, ['pasta']);
		expect(versions(slot)).toBe(2);
		setSlotTags(WEEK, slot, []);
		expect(versions(slot)).toBe(1);
	});

	it('editar una semana pasada solo la afecta a ella', () => {
		const past = wk(-3);
		const slot = mainSlot(past, 1, 'comida');
		setSlotTags(past, slot, ['pasta']);
		expect(tagsOf(wk(-4), slot)).toEqual([]);
		expect(tagsOf(past, slot)).toEqual(['pasta']);
		expect(tagsOf(wk(-2), slot)).toEqual([]);
		expect(tagsOf(WEEK, slot)).toEqual([]);

		removeSlot(wk(-2), slot);
		expect(mains(wk(-2))).toHaveLength(0);
		expect(mains(wk(-1))).toHaveLength(1);

		addSlot(wk(-5), 1, 'comida', 'main');
		expect(mains(wk(-5))).toHaveLength(2);
		expect(mains(wk(-4))).toHaveLength(1);
	});

	it('quitar un plato no toca los acompañamientos', () => {
		const plato = mainSlot(WEEK, 1, 'comida');
		const a1 = accSlot(WEEK, 1, 'comida', 0);
		const a2 = accSlot(WEEK, 1, 'comida', 1);
		removeSlot(WEEK, plato);
		const left = getWeekData(WEEK).configs[1].comida.slots.map(s => s.id);
		expect(left).toEqual([a1, a2]);
	});
});

describe('estado por semana (week_meal_state)', () => {
	it('disabled y note solo aplican a la semana exacta', () => {
		updateDayConfig(WEEK, 1, 'comida', { disabled: true, disabled_comment: 'fuera', note: 'nota' });
		const cfg = getWeekData(WEEK).configs[1].comida;
		expect(cfg.disabled).toBe(true);
		expect(cfg.disabled_comment).toBe('fuera');
		expect(cfg.note).toBe('nota');
		const cfgNext = getWeekData(NEXT).configs[1].comida;
		expect(cfgNext.disabled).toBe(false);
		expect(cfgNext.note).toBeNull();
	});

	it('la fila de estado desaparece al volver a los valores por defecto', () => {
		updateDayConfig(WEEK, 1, 'comida', { disabled: true, disabled_comment: 'fuera', note: 'x' });
		updateDayConfig(WEEK, 1, 'comida', { disabled: false, disabled_comment: null, note: null });
		const n = getDb().prepare('SELECT COUNT(*) AS n FROM week_meal_state').get() as { n: number };
		expect(n.n).toBe(0);
	});

	it('un cambio parcial de estado conserva el resto de campos', () => {
		updateDayConfig(WEEK, 1, 'comida', { disabled: true, disabled_comment: 'fuera' });
		updateDayConfig(WEEK, 1, 'comida', { note: 'nota' });
		const cfg = getWeekData(WEEK).configs[1].comida;
		expect(cfg.disabled).toBe(true);
		expect(cfg.disabled_comment).toBe('fuera');
		expect(cfg.note).toBe('nota');
	});
});

describe('copyPreviousWeek', () => {
	it('copia las recetas al mismo hueco', () => {
		const r = seedRecipe('Lentejas', 'comida');
		const slot = mainSlot(PREV, 3, 'comida');
		assignRecipe(PREV, slot, r.id);
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0]).toMatchObject({ weekday: 3, slot_id: slot, recipe: expect.objectContaining({ id: r.id }) });
	});

	it('reemplaza el contenido previo de la semana destino', () => {
		const viejo = seedRecipe('Viejo', 'comida');
		const nuevo = seedRecipe('Nuevo', 'comida');
		assignRecipe(WEEK, mainSlot(WEEK, 1, 'comida'), viejo.id);
		assignRecipe(PREV, mainSlot(PREV, 2, 'comida'), nuevo.id);
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0].recipe?.id).toBe(nuevo.id);
	});

	it('si el hueco ya no existe usa otro libre del mismo tipo, y si no hay lo descarta', () => {
		const a = seedRecipe('A', 'comida');
		const b = seedRecipe('B', 'comida');
		const s0 = mainSlot(PREV, 1, 'comida', 0);
		const s1 = mainSlot(PREV, 1, 'comida', 1);
		assignRecipe(PREV, s0, a.id);
		assignRecipe(PREV, s1, b.id);
		removeSlot(WEEK, s0);
		copyPreviousWeek(WEEK, PREV);
		expect(getWeekData(WEEK).slots.map(s => s.recipe?.name)).toEqual(['B']);

		const nuevo = addSlot(WEEK, 1, 'comida', 'main');
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots.find(s => s.slot_id === s1)?.recipe?.name).toBe('B');
		expect(slots.find(s => s.slot_id === nuevo)?.recipe?.name).toBe('A');
	});
});

describe('programaciones sobre huecos', () => {
	it('on_conflict=skip: la asignación manual gana y la programación se reubica en otro hueco libre', () => {
		const programada = seedRecipe('Programada', 'comida');
		const manual = seedRecipe('Manual', 'comida');
		const s0 = mainSlot(WEEK, 1, 'comida', 0);
		mainSlot(WEEK, 1, 'comida', 1);
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'skip', 5);
		expect(getWeekData(WEEK).slots[0]).toMatchObject({ slot_id: s0, recipe: expect.objectContaining({ id: programada.id }) });

		assignRecipe(WEEK, s0, manual.id);
		expect(getWeekData(WEEK).slots.map(s => s.recipe?.id)).toEqual([manual.id, programada.id]);
	});

	it('prefiere un hueco cuyos tags cumple la receta', () => {
		const programada = seedRecipe('Tupper', 'comida,trabajo');
		const s0 = mainSlot(WEEK, 1, 'comida', 0);
		const s1 = mainSlot(WEEK, 1, 'comida', 1);
		const s2 = mainSlot(WEEK, 1, 'comida', 2);
		setSlotTags(WEEK, s0, ['rápido']);
		setSlotTags(WEEK, s2, ['trabajo']);
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'skip', 5);
		expect(getWeekData(WEEK).slots[0].slot_id).toBe(s2);

		// Ocupado el hueco que encaja, va a uno sin tags antes que a uno cuyos tags no cumple
		assignRecipe(WEEK, s2, seedRecipe('Otra', 'comida').id);
		expect(getWeekData(WEEK).slots.find(s => s.schedule)?.slot_id).toBe(s1);
	});

	it('on_conflict=overwrite: nunca sustituye una receta puesta a mano', () => {
		const programada = seedRecipe('Programada', 'comida');
		const manual = seedRecipe('Manual', 'comida');
		const slot = mainSlot(WEEK, 1, 'comida');
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 5);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(programada.id);
		assignRecipe(WEEK, slot, manual.id);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(manual.id);
		// Al quitar la manual, la programación retoma el hueco
		removeRecipe(WEEK, slot);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(programada.id);
	});

	it('overwrite sigue pudiendo desplazar a otra programación', () => {
		const a = seedRecipe('Programación A', 'comida');
		const b = seedRecipe('Programación B', 'comida');
		upsertSchedule(a.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 1);
		upsertSchedule(b.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 10);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect([a.id, b.id]).toContain(slots[0].recipe?.id);
	});

	it('on_conflict=add: crea un hueco virtual solo esa semana, que se materializa al asignarle algo', () => {
		const fija = seedRecipe('Fija', 'comida');
		const extra = seedRecipe('Extra', 'comida');
		assignRecipe(WEEK, mainSlot(WEEK, 1, 'comida'), fija.id);
		const schedId = upsertSchedule(extra.id, 1, 'comida', 0, 1, WEEK, 'add', 5);
		const cfg = getWeekData(WEEK).configs[1].comida;
		expect(cfg.slots.map(s => s.id)).toContain(-schedId);
		expect(getWeekData(WEEK).slots.find(s => s.slot_id === -schedId)?.recipe?.id).toBe(extra.id);

		const real = assignRecipe(WEEK, -schedId, extra.id, 0, []);
		expect(real).toBeGreaterThan(0);
		expect(mains(WEEK).map(s => s.id)).toContain(real);
		expect(mains(NEXT).map(s => s.id)).not.toContain(real);
	});

	it('un acompañamiento programado ocupa el primer acompañamiento libre', () => {
		const ensalada = seedRecipe('Ensalada', 'acompañamiento');
		const general = accSlot(WEEK, 1, 'comida', 0);
		accSlot(WEEK, 1, 'comida', 1);
		upsertSchedule(ensalada.id, 1, 'comida', 1, 1, WEEK, 'skip', 5);
		const accSlots = getWeekData(WEEK).slots.filter(s => s.is_accompaniment === 1);
		expect(accSlots).toHaveLength(1);
		expect(accSlots[0].slot_id).toBe(general);
	});

	it('sin huecos libres de ese tipo, skip no coloca la programación', () => {
		const r = seedRecipe('Programada', 'comida');
		removeSlot(WEEK, mainSlot(WEEK, 1, 'comida'));
		upsertSchedule(r.id, 1, 'comida', 0, 1, WEEK, 'skip', 5);
		expect(getWeekData(WEEK).slots).toHaveLength(0);
		expect(slotsOf(WEEK, 1, 'comida')).toHaveLength(0);
	});
});
