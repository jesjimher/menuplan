import { describe, it, expect } from 'vitest';
import { getWeekKey, getPreviousWeekKey, weekKeyToIndex, indexToWeekKey } from './dates.js';

// Años con 53 semanas ISO: 2020 (bisiesto que empieza en miércoles), 2026 (empieza en jueves)
// Años con 52 semanas ISO: 2024, 2025, 2027

describe('getWeekKey', () => {
	it('devuelve la semana ISO correcta para una fecha normal', () => {
		expect(getWeekKey(new Date('2024-01-08'))).toBe('2024-W02');
	});

	it('29 de diciembre de 2025 pertenece a 2026-W01', () => {
		// Ese lunes, el jueves de la semana cae el 1/1/2026 → 2026-W01
		expect(getWeekKey(new Date('2025-12-29'))).toBe('2026-W01');
	});

	it('28 de diciembre de 2026 pertenece a 2026-W53 (2026 tiene 53 semanas)', () => {
		expect(getWeekKey(new Date('2026-12-28'))).toBe('2026-W53');
	});

	it('28 de diciembre de 2020 pertenece a 2020-W53 (2020 tiene 53 semanas)', () => {
		expect(getWeekKey(new Date('2020-12-28'))).toBe('2020-W53');
	});
});

describe('getPreviousWeekKey', () => {
	it('retrocede semanas normales', () => {
		expect(getPreviousWeekKey('2024-W10')).toBe('2024-W09');
	});

	it('cruza año en año ISO de 52 semanas: 2024-W01 → 2023-W52', () => {
		expect(getPreviousWeekKey('2024-W01')).toBe('2023-W52');
	});

	it('cruza año ISO de 53 semanas: 2021-W01 → 2020-W53', () => {
		// 2020 es bisiesto y empieza en miércoles → tiene 53 semanas ISO
		expect(getPreviousWeekKey('2021-W01')).toBe('2020-W53');
	});

	it('cruza año ISO de 53 semanas: 2027-W01 → 2026-W53', () => {
		// 2026 empieza en jueves → tiene 53 semanas ISO
		expect(getPreviousWeekKey('2027-W01')).toBe('2026-W53');
	});

	it('no genera W53 al cruzar un año de 52 semanas: 2025-W01 → 2024-W52', () => {
		expect(getPreviousWeekKey('2025-W01')).toBe('2024-W52');
	});
});

describe('indexToWeekKey', () => {
	it('es la inversa de weekKeyToIndex para semanas normales', () => {
		const keys = ['2024-W01', '2023-W52', '2024-W10', '2024-W52'];
		for (const k of keys) {
			expect(indexToWeekKey(weekKeyToIndex(k))).toBe(k);
		}
	});

	it('es la inversa de weekKeyToIndex para semanas 53', () => {
		expect(indexToWeekKey(weekKeyToIndex('2020-W53'))).toBe('2020-W53');
		expect(indexToWeekKey(weekKeyToIndex('2026-W53'))).toBe('2026-W53');
	});
});

describe('weekKeyToIndex', () => {
	it('índices consecutivos para semanas W52 → W01 (52 semanas)', () => {
		const a = weekKeyToIndex('2024-W52');
		const b = weekKeyToIndex('2025-W01');
		expect(b - a).toBe(1);
	});

	it('índices consecutivos cuando hay W53: 2020-W52 → W53 → 2021-W01', () => {
		const w52 = weekKeyToIndex('2020-W52');
		const w53 = weekKeyToIndex('2020-W53');
		const w01 = weekKeyToIndex('2021-W01');
		expect(w53 - w52).toBe(1);
		expect(w01 - w53).toBe(1);
	});

	it('índices consecutivos cuando hay W53: 2026-W52 → W53 → 2027-W01', () => {
		const w52 = weekKeyToIndex('2026-W52');
		const w53 = weekKeyToIndex('2026-W53');
		const w01 = weekKeyToIndex('2027-W01');
		expect(w53 - w52).toBe(1);
		expect(w01 - w53).toBe(1);
	});
});
