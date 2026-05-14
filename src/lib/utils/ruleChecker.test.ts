import { describe, it, expect } from 'vitest';
import { checkRules } from './ruleChecker.js';
import type { SlotData, Rule } from '$lib/types/index.js';

function makeSlot(tags: string, is_accompaniment = 0): SlotData {
	return {
		weekday: 1,
		meal_type: 'comida',
		slot_index: 0,
		is_accompaniment,
		recipe: { id: 1, name: 'Test', description: '', tags, min_days: -1, image_type: null, created_at: '' },
		member: null,
		schedule: null
	};
}

describe('checkRules', () => {
	it('no viola nada sin reglas', () => {
		const slots = [makeSlot('pollo,comida'), makeSlot('pasta,comida')];
		expect(checkRules(slots, [])).toHaveLength(0);
	});

	it('detecta violación no_more_than', () => {
		const slots = [makeSlot('pollo,comida'), makeSlot('pollo,comida'), makeSlot('pollo,comida')];
		const rules: Rule[] = [{ id: 1, tag: 'pollo', direction: 'no_more_than', times: 2 }];
		const violations = checkRules(slots, rules);
		expect(violations).toHaveLength(1);
		expect(violations[0].current).toBe(3);
	});

	it('detecta violación at_least', () => {
		const slots = [makeSlot('pollo,comida')];
		const rules: Rule[] = [{ id: 1, tag: 'pescado', direction: 'at_least', times: 2 }];
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
		const rules: Rule[] = [{ id: 1, tag: 'pollo', direction: 'no_more_than', times: 1 }];
		const violations = checkRules(slots, rules);
		expect(violations).toHaveLength(0); // solo 1 plato principal con pollo
	});

	it('no viola si está dentro del límite', () => {
		const slots = [makeSlot('pollo,comida'), makeSlot('pollo,comida')];
		const rules: Rule[] = [{ id: 1, tag: 'pollo', direction: 'no_more_than', times: 2 }];
		expect(checkRules(slots, rules)).toHaveLength(0);
	});
});
