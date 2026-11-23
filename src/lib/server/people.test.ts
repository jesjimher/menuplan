import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekData, assignRecipe, copyPreviousWeek, setSlotPeople, removeRecipe } from './weekplan.js';
import { upsertSchedule } from './schedules.js';
import { createPerson, deletePerson, updatePerson, getActivePeople } from './people.js';
import { calculatePlan } from './planner.js';
import { freezeSchedulesBefore } from './scheduleFreeze.js';
import { resetDb, seedRecipe, seedRule } from './test-helpers.js';
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

const NOW = weekKeyToIndex(getWeekKey());
const WEEK = indexToWeekKey(NOW + 6);
const PREV = indexToWeekKey(NOW + 5);

beforeEach(() => resetDb());

describe('personas en week_plans', () => {
	it('guarda para quién es una receta y lo devuelve en el slot', () => {
		const jesus = createPerson('Jesús');
		const coia = createPerson('Coia');
		const r = seedRecipe('Macarrones', 'comida');
		assignRecipe(WEEK, 2, 'comida', 0, 0, r.id, 0, [jesus.id, coia.id]);
		const data = getWeekData(WEEK);
		expect(data.slots[0].people).toEqual([jesus.id, coia.id]);
		expect(data.people.map(p => p.name)).toEqual(['Jesús', 'Coia']);
	});

	it('sin personas = para todos (lista vacía)', () => {
		const r = seedRecipe('Macarrones', 'comida');
		assignRecipe(WEEK, 2, 'comida', 0, 0, r.id);
		expect(getWeekData(WEEK).slots[0].people).toEqual([]);
	});

	it('cambiar la receta sin indicar personas conserva las del hueco', () => {
		const coia = createPerson('Coia');
		const r1 = seedRecipe('Filete', 'comida');
		const r2 = seedRecipe('Pollo', 'comida');
		assignRecipe(WEEK, 2, 'comida', 0, 0, r1.id, 0, [coia.id]);
		assignRecipe(WEEK, 2, 'comida', 0, 0, r2.id);
		expect(getWeekData(WEEK).slots[0]).toMatchObject({ recipe: expect.objectContaining({ id: r2.id }), people: [coia.id] });
		assignRecipe(WEEK, 2, 'comida', 0, 0, r1.id, 0, []);
		expect(getWeekData(WEEK).slots[0].people).toEqual([]);
	});

	it('quitar la receta borra sus personas', () => {
		const coia = createPerson('Coia');
		const r = seedRecipe('Filete', 'comida');
		assignRecipe(WEEK, 2, 'comida', 0, 0, r.id, 0, [coia.id]);
		removeRecipe(WEEK, 2, 'comida', 0, 0);
		const n = getDb().prepare('SELECT COUNT(*) AS n FROM week_plan_people').get() as { n: number };
		expect(n.n).toBe(0);
	});

	it('borrar una persona deja sus comidas para todos', () => {
		const coia = createPerson('Coia');
		const r = seedRecipe('Filete', 'comida');
		assignRecipe(WEEK, 2, 'comida', 0, 0, r.id, 0, [coia.id]);
		deletePerson(coia.id);
		expect(getWeekData(WEEK).slots[0].people).toEqual([]);
	});

	it('archivar una persona la quita de las activas', () => {
		const coia = createPerson('Coia');
		updatePerson(coia.id, { archived: true });
		expect(getActivePeople()).toHaveLength(0);
	});

	it('copiar la semana anterior copia también las personas', () => {
		const coia = createPerson('Coia');
		const r = seedRecipe('Filete', 'comida');
		assignRecipe(PREV, 2, 'comida', 0, 0, r.id, 0, [coia.id]);
		copyPreviousWeek(WEEK, PREV);
		expect(getWeekData(WEEK).slots[0].people).toEqual([coia.id]);
	});
});

describe('personas en programaciones', () => {
	it('el slot programado lleva las personas de la programación', () => {
		const coia = createPerson('Coia');
		const r = seedRecipe('Paella', 'comida');
		upsertSchedule(r.id, 7, 'comida', 0, 1, WEEK, 'skip', 5, [coia.id]);
		const slot = getWeekData(WEEK).slots[0];
		expect(slot.schedule).not.toBeNull();
		expect(slot.people).toEqual([coia.id]);
	});

	it('cambiar las personas de un slot programado lo materializa solo en esa semana', () => {
		const jesus = createPerson('Jesús');
		const r = seedRecipe('Paella', 'comida');
		upsertSchedule(r.id, 7, 'comida', 0, 1, WEEK, 'skip', 5);
		setSlotPeople(WEEK, 7, 'comida', 0, 0, r.id, [jesus.id]);
		const slot = getWeekData(WEEK).slots[0];
		expect(slot.people).toEqual([jesus.id]);
		expect(slot.schedule).not.toBeNull(); // sigue reconociéndose como programada
		expect(getWeekData(indexToWeekKey(NOW + 7)).slots[0].people).toEqual([]);
	});

	it('al congelar el pasado se guardan las personas de la programación', () => {
		const coia = createPerson('Coia');
		const r = seedRecipe('Paella', 'comida');
		const past = indexToWeekKey(NOW - 2);
		upsertSchedule(r.id, 7, 'comida', 0, 1, past, 'skip', 5, [coia.id]);
		freezeSchedulesBefore();
		const n = getDb().prepare(`
			SELECT COUNT(*) AS n FROM week_plan_people wpp JOIN week_plans wp ON wp.id = wpp.week_plan_id
			WHERE wp.week_key = ? AND wpp.person_id = ?
		`).get(past, coia.id) as { n: number };
		expect(n.n).toBe(1);
	});
});

describe('planificador con personas', () => {
	it('respeta una regla personal contando lo que es para todos', () => {
		const jesus = createPerson('Jesús');
		createPerson('Coia');
		const pescado1 = seedRecipe('Merluza', 'comida,pescado');
		seedRecipe('Salmón', 'comida,pescado');
		const ok = seedRecipe('Lentejas', 'comida');
		seedRule('pescado', 'no_more_than', 1, [jesus.id]);
		// Jesús ya tiene un pescado (solo suyo) esta semana
		assignRecipe(WEEK, 1, 'comida', 0, 0, pescado1.id, 0, [jesus.id]);
		calculatePlan(WEEK, [{ weekday: 2, meal_type: 'comida', slot_index: 0, is_accompaniment: 0 }], getWeekData(WEEK).slots);
		const filled = getWeekData(WEEK).slots.find(s => s.weekday === 2)!;
		expect(filled.recipe?.id).toBe(ok.id);
		expect(filled.people).toEqual([]); // el planificador deja todo para todos
	});

	it('una regla de otra persona no limita lo que es solo de una', () => {
		const jesus = createPerson('Jesús');
		const coia = createPerson('Coia');
		const pescado = seedRecipe('Merluza', 'comida,pescado');
		seedRule('pescado', 'no_more_than', 1, [coia.id]);
		// Jesús tiene pescado; Coia no: un pescado para todos aún cabe
		assignRecipe(WEEK, 1, 'comida', 0, 0, pescado.id, 0, [jesus.id]);
		calculatePlan(WEEK, [{ weekday: 2, meal_type: 'comida', slot_index: 0, is_accompaniment: 0 }], getWeekData(WEEK).slots);
		expect(getWeekData(WEEK).slots.find(s => s.weekday === 2)?.recipe?.id).toBe(pescado.id);
	});
});
