import { describe, it, expect } from 'vitest';
import { checkRules } from './ruleChecker.js';
import type { SlotData, Rule, Person } from '$lib/types/index.js';

function makeSlot(tags: string, is_accompaniment = 0, people: number[] = []): SlotData {
	return {
		weekday: 1,
		meal_type: 'comida',
		slot_id: 1,
		is_accompaniment,
		is_leftover: 0,
		recipe: { id: 1, name: 'Test', description: '', tags, min_days: -1, image_type: null, created_at: '' },
		schedule: null,
		people
	};
}

function person(id: number, name: string): Person {
	return { id, name, sort_order: id, archived: 0, image_type: null, created_at: '' };
}

function rule(tag: string, direction: Rule['direction'], times: number, people: number[] = []): Rule {
	return { id: 1, tag, direction, times, people };
}

describe('checkRules', () => {
	it('no viola nada sin reglas', () => {
		const slots = [makeSlot('pollo,comida'), makeSlot('pasta,comida')];
		expect(checkRules(slots, [])).toHaveLength(0);
	});

	it('detecta violación no_more_than', () => {
		const slots = [makeSlot('pollo,comida'), makeSlot('pollo,comida'), makeSlot('pollo,comida')];
		const rules: Rule[] = [{ id: 1, tag: 'pollo', direction: 'no_more_than', times: 2, people: [] }];
		const violations = checkRules(slots, rules);
		expect(violations).toHaveLength(1);
		expect(violations[0].current).toBe(3);
	});

	it('detecta violación at_least', () => {
		const slots = [makeSlot('pollo,comida')];
		const rules: Rule[] = [{ id: 1, tag: 'pescado', direction: 'at_least', times: 2, people: [] }];
		const violations = checkRules(slots, rules);
		expect(violations).toHaveLength(1);
		expect(violations[0].current).toBe(0);
	});

	it('los acompañamientos no cuentan para las reglas', () => {
		const slots = [
			makeSlot('pollo,comida', 0),
			makeSlot('pollo,acompañamiento', 1), // no debe contar
			makeSlot('pollo,acompañamiento', 1), // no debe contar
		];
		const rules: Rule[] = [{ id: 1, tag: 'pollo', direction: 'no_more_than', times: 1, people: [] }];
		const violations = checkRules(slots, rules);
		expect(violations).toHaveLength(0); // solo 1 plato principal con pollo
	});

	it('no viola si está dentro del límite', () => {
		const slots = [makeSlot('pollo,comida'), makeSlot('pollo,comida')];
		const rules: Rule[] = [{ id: 1, tag: 'pollo', direction: 'no_more_than', times: 2, people: [] }];
		expect(checkRules(slots, rules)).toHaveLength(0);
	});
});

describe('checkRules por persona', () => {
	const JESUS = person(1, 'Jesús');
	const COIA = person(2, 'Coia');
	const PEOPLE = [JESUS, COIA];

	it('una regla general se cuenta por separado para cada persona', () => {
		// Pescado una vez para cada uno: nadie pasa de 1
		const slots = [makeSlot('pescado', 0, [1]), makeSlot('pescado', 0, [2])];
		expect(checkRules(slots, [rule('pescado', 'no_more_than', 1)], PEOPLE)).toHaveLength(0);
	});

	it('lo que es para todos cuenta para cada persona', () => {
		const slots = [makeSlot('pescado'), makeSlot('pescado', 0, [2])];
		const v = checkRules(slots, [rule('pescado', 'no_more_than', 1)], PEOPLE);
		expect(v).toHaveLength(1);
		expect(v[0].people).toEqual([2]);
		expect(v[0].current).toBe(2);
		expect(v[0].message).toContain('Coia: 2');
	});

	it('si todos incumplen igual, el mensaje no lleva nombres', () => {
		const slots = [makeSlot('pescado'), makeSlot('pescado')];
		const v = checkRules(slots, [rule('pescado', 'no_more_than', 1)], PEOPLE);
		expect(v[0].people).toEqual([1, 2]);
		expect(v[0].message).not.toContain('Jesús');
	});

	it('una regla con personas solo se aplica a ellas', () => {
		const slots = [makeSlot('pescado', 0, [1]), makeSlot('pescado', 0, [1])];
		expect(checkRules(slots, [rule('pescado', 'no_more_than', 1, [2])], PEOPLE)).toHaveLength(0);
		const v = checkRules(slots, [rule('pescado', 'no_more_than', 1, [1])], PEOPLE);
		expect(v).toHaveLength(1);
		expect(v[0].people).toEqual([1]);
	});

	it('at_least se exige a cada persona', () => {
		const slots = [makeSlot('verdura', 0, [1])];
		const v = checkRules(slots, [rule('verdura', 'at_least', 1)], PEOPLE);
		expect(v).toHaveLength(1);
		expect(v[0].people).toEqual([2]);
	});

	it('una regla de una persona archivada (no activa) se ignora', () => {
		const slots = [makeSlot('pescado'), makeSlot('pescado')];
		expect(checkRules(slots, [rule('pescado', 'no_more_than', 1, [3])], PEOPLE)).toHaveLength(0);
	});
});
