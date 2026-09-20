import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekData, assignRecipe, removeRecipe, copyPreviousWeek, updateDayConfig, updateSlotRequiredTag } from './weekplan.js';
import { upsertSchedule } from './schedules.js';
import { resetDb, seedRecipe, seedRule } from './test-helpers.js';
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

// Semanas futuras relativas a la actual (las vigencias de meal_config solo se propagan
// al futuro cuando se editan en semanas presentes o futuras).
const NOW = weekKeyToIndex(getWeekKey());
const WEEK = indexToWeekKey(NOW + 6);
const PREV = indexToWeekKey(NOW + 5);
const NEXT = indexToWeekKey(NOW + 7);

beforeEach(() => resetDb());

describe('assignRecipe + getWeekData', () => {
	it('asigna una receta y la devuelve en el slot', () => {
		const r = seedRecipe('Lentejas', 'comida,legumbres');
		assignRecipe(WEEK, 1, 'comida', 0, 0, r.id);
		const data = getWeekData(WEEK);
		expect(data.slots).toHaveLength(1);
		expect(data.slots[0]).toMatchObject({ weekday: 1, meal_type: 'comida', recipe: expect.objectContaining({ id: r.id }) });
	});

	it('hace upsert sobre el mismo slot (índice de expresión)', () => {
		const r1 = seedRecipe('Lentejas', 'comida');
		const r2 = seedRecipe('Garbanzos', 'comida');
		assignRecipe(WEEK, 1, 'comida', 0, 0, r1.id);
		assignRecipe(WEEK, 1, 'comida', 0, 0, r2.id);
		const rows = getDb().prepare('SELECT COUNT(*) AS n FROM week_plans WHERE week_key = ?').get(WEEK) as { n: number };
		expect(rows.n).toBe(1);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(r2.id);
	});

	it('detecta violaciones de reglas en la semana', () => {
		const r1 = seedRecipe('Pasta carbonara', 'comida,pasta');
		const r2 = seedRecipe('Macarrones', 'comida,pasta');
		seedRule('pasta', 'no_more_than', 1);
		assignRecipe(WEEK, 1, 'comida', 0, 0, r1.id);
		assignRecipe(WEEK, 2, 'comida', 0, 0, r2.id);
		const { violations } = getWeekData(WEEK);
		expect(violations.length).toBeGreaterThan(0);
		expect(violations[0].rule.tag).toBe('pasta');
	});
});

describe('configuración por día (meal_config / week_meal_state)', () => {
	it('aplica la configuración exacta de la semana', () => {
		updateDayConfig(WEEK, 1, 'comida', { recipe_count: 2 });
		expect(getWeekData(WEEK).configs[1].comida.recipe_count).toBe(2);
	});

	it('hereda la configuración de semanas anteriores', () => {
		updateDayConfig(PREV, 2, 'cena', { recipe_count: 3 });
		// Semana posterior: hereda
		expect(getWeekData(WEEK).configs[2].cena.recipe_count).toBe(3);
		// Semana anterior a la config: usa el valor por defecto global
		expect(getWeekData(indexToWeekKey(NOW + 4)).configs[2].cena.recipe_count).toBe(1);
	});

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

	const count = (table: string) => (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

	it('una edición posterior sustituye a la anterior desde su semana', () => {
		updateDayConfig(indexToWeekKey(NOW + 1), 1, 'comida', { recipe_count: 2 });
		updateDayConfig(indexToWeekKey(NOW + 4), 1, 'comida', { recipe_count: 3 });
		const rc = (off: number) => getWeekData(indexToWeekKey(NOW + off)).configs[1].comida.recipe_count;
		expect(rc(0)).toBe(1);
		expect(rc(2)).toBe(2);
		expect(rc(4)).toBe(3);
		expect(rc(5)).toBe(3);
	});

	it('editar una semana pasada solo la afecta a ella', () => {
		const past = indexToWeekKey(NOW - 3);
		updateDayConfig(past, 1, 'comida', { recipe_count: 4 });
		const rc = (off: number) => getWeekData(indexToWeekKey(NOW + off)).configs[1].comida.recipe_count;
		expect(rc(-3)).toBe(4);
		expect(rc(-4)).toBe(1);
		expect(rc(-2)).toBe(1);
		expect(rc(0)).toBe(1);
	});

	it('un override de una semana pasada convive con una vigencia anterior sin límite', () => {
		// Estado que solo existe por el paso del tiempo (o por migración): una vigencia sin límite
		// y, después, un override de una sola semana ya pasada encima de ella.
		const ins = getDb().prepare(`
			INSERT INTO meal_config (weekday, meal_type, effective_from, effective_to, recipe_count)
			VALUES (1, 'comida', ?, ?, ?)
		`);
		ins.run(indexToWeekKey(NOW - 10), null, 2);
		ins.run(indexToWeekKey(NOW - 5), indexToWeekKey(NOW - 5), 5);
		const rc = (off: number) => getWeekData(indexToWeekKey(NOW + off)).configs[1].comida.recipe_count;
		expect(rc(-6)).toBe(2);
		expect(rc(-5)).toBe(5); // gana el override (from más reciente)
		expect(rc(-4)).toBe(2); // el override no se propaga
		expect(rc(3)).toBe(2);
	});

	it('disabled y note no crean ni fijan una vigencia de capacidad', () => {
		updateDayConfig(WEEK, 1, 'comida', { disabled: true, note: 'nota' });
		expect(count('meal_config')).toBe(0);
		expect(count('week_meal_state')).toBe(1);
	});

	it('la fila de estado desaparece al volver a los valores por defecto', () => {
		updateDayConfig(WEEK, 1, 'comida', { disabled: true, disabled_comment: 'fuera', note: 'x' });
		updateDayConfig(WEEK, 1, 'comida', { disabled: false, disabled_comment: null, note: null });
		expect(count('week_meal_state')).toBe(0);
		expect(getWeekData(WEEK).configs[1].comida.disabled).toBe(false);
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

describe('tags exigidos por slot (meal_config_required_tags)', () => {
	const tagsOf = (week: string) => getWeekData(week).configs[1].comida.required_tags;

	it('guarda varios tags por slot y se heredan a semanas posteriores', () => {
		updateSlotRequiredTag(WEEK, 1, 'comida', 0, ['pasta', 'rapido']);
		updateSlotRequiredTag(WEEK, 1, 'comida', 1, ['carne']);
		expect(tagsOf(WEEK)).toEqual([['pasta', 'rapido'], ['carne']]);
		expect(tagsOf(NEXT)).toEqual([['pasta', 'rapido'], ['carne']]);
		expect(tagsOf(PREV)).toEqual([]);
	});

	it('vaciar un slot deja el hueco y conserva los demás', () => {
		updateSlotRequiredTag(WEEK, 1, 'comida', 0, ['pasta']);
		updateSlotRequiredTag(WEEK, 1, 'comida', 1, ['carne']);
		updateSlotRequiredTag(WEEK, 1, 'comida', 0, []);
		expect(tagsOf(WEEK)).toEqual([[], ['carne']]);
	});

	it('una edición en otra semana hereda los tags y la capacidad vigentes', () => {
		updateDayConfig(PREV, 1, 'comida', { recipe_count: 3 });
		updateSlotRequiredTag(PREV, 1, 'comida', 0, ['pasta']);
		updateSlotRequiredTag(WEEK, 1, 'comida', 1, ['carne']);
		const cfg = getWeekData(WEEK).configs[1].comida;
		expect(cfg.recipe_count).toBe(3);
		expect(cfg.required_tags).toEqual([['pasta'], ['carne']]);
		// La semana anterior no se ve afectada por lo que se añade después
		expect(tagsOf(PREV)).toEqual([['pasta']]);
	});
});

describe('copyPreviousWeek', () => {
	it('copia los slots de la semana anterior', () => {
		const r = seedRecipe('Lentejas', 'comida');
		assignRecipe(PREV, 3, 'comida', 0, 0, r.id);
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0]).toMatchObject({ weekday: 3, recipe: expect.objectContaining({ id: r.id }) });
	});

	it('reemplaza el contenido previo de la semana destino', () => {
		const viejo = seedRecipe('Viejo', 'comida');
		const nuevo = seedRecipe('Nuevo', 'comida');
		assignRecipe(WEEK, 1, 'comida', 0, 0, viejo.id);
		assignRecipe(PREV, 2, 'comida', 0, 0, nuevo.id);
		copyPreviousWeek(WEEK, PREV);
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect(slots[0].recipe?.id).toBe(nuevo.id);
	});
});

describe('asignación manual sobre una receta programada', () => {
	it('on_conflict=skip: la asignación manual gana y la programación se reubica en otro hueco libre', () => {
		const programada = seedRecipe('Programada', 'comida');
		const manual = seedRecipe('Manual', 'comida');
		updateDayConfig(WEEK, 1, 'comida', { recipe_count: 2 });
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'skip', 5);

		// Antes de tocar nada, la programación ocupa el hueco libre (slot_index 0)
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(programada.id);

		assignRecipe(WEEK, 1, 'comida', 0, 0, manual.id);

		// La manual se queda en el índice 0; como aún queda un segundo hueco libre
		// (recipe_count=2), la programación se reubica ahí en vez de desaparecer.
		const slots = getWeekData(WEEK).slots;
		expect(slots.map(s => s.recipe?.id)).toEqual([manual.id, programada.id]);
	});

	it('on_conflict=overwrite: la manual ya no queda enmascarada por la programación', () => {
		const programada = seedRecipe('Programada', 'comida');
		const manual = seedRecipe('Manual', 'comida');
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 5);

		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(programada.id);

		assignRecipe(WEEK, 1, 'comida', 0, 0, manual.id);

		// Antes: on_conflict='overwrite' sustituía el slot 0 sin mirar si era manual.
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(manual.id);
	});

	it('al quitar la receta manual, la programación retoma el control del hueco sin ningún paso extra', () => {
		const programada = seedRecipe('Programada', 'comida');
		const manual = seedRecipe('Manual', 'comida');
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 5);
		assignRecipe(WEEK, 1, 'comida', 0, 0, manual.id);
		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(manual.id);

		removeRecipe(WEEK, 1, 'comida', 0, 0);

		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(programada.id);
	});

	it('cambiar de una receta manual a otra sigue bloqueando la programación', () => {
		const programada = seedRecipe('Programada', 'comida');
		const manualA = seedRecipe('Manual A', 'comida');
		const manualB = seedRecipe('Manual B', 'comida');
		upsertSchedule(programada.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 5);

		assignRecipe(WEEK, 1, 'comida', 0, 0, manualA.id);
		assignRecipe(WEEK, 1, 'comida', 0, 0, manualB.id);

		expect(getWeekData(WEEK).slots[0].recipe?.id).toBe(manualB.id);
	});

	it('overwrite sigue pudiendo desplazar a otra programación (no solo a huecos manuales)', () => {
		const unaId = seedRecipe('Programación A', 'comida');
		const otraId = seedRecipe('Programación B', 'comida');
		upsertSchedule(unaId.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 1);
		upsertSchedule(otraId.id, 1, 'comida', 0, 1, WEEK, 'overwrite', 10);

		// Sin manual de por medio, 'overwrite' sigue resolviendo el conflicto entre
		// programaciones dejando una sola en el único hueco (no lo bloquea el fix).
		const slots = getWeekData(WEEK).slots;
		expect(slots).toHaveLength(1);
		expect([unaId.id, otraId.id]).toContain(slots[0].recipe?.id);
	});

	it('acompañamiento programado con accompaniment_per_slot=0 aparece en el índice 0', () => {
		const acomp = seedRecipe('Ensalada', 'acompañamiento');
		updateDayConfig(WEEK, 1, 'comida', { accompaniment_per_recipe: 1, accompaniment_per_slot: 0 });
		upsertSchedule(acomp.id, 1, 'comida', 1, 1, WEEK, 'skip', 5);

		const accSlots = getWeekData(WEEK).slots.filter(s => s.is_accompaniment === 1);
		expect(accSlots).toHaveLength(1);
		expect(accSlots[0]).toMatchObject({ slot_index: 0, recipe: expect.objectContaining({ id: acomp.id }) });
	});
});
