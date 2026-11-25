// Las programaciones se resuelven al vuelo, salvo en los días ya consolidados: cada día que
// pasa, lo que las programaciones ponían ese día se guarda como filas normales de week_plans
// (con schedule_id apuntando a su programación) y se adelanta la marca «consolidado hasta»
// (consolidationMark.ts). A partir de ahí ese día no depende de las programaciones: editarlas,
// borrarlas o cambiar los huecos no lo altera, y vaciarlo a mano lo deja vacío.
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey, localDateKey, dateKeyToWeekKey, weekdayDateKey } from '$lib/utils/dates.js';
import { getWeekData, assignRecipe } from './weekplan.js';
import { getConsolidatedThrough, setConsolidatedThrough } from './consolidationMark.js';

interface ScheduleAnchorRow {
	id: number;
	every_n_weeks: number;
	anchor_week_key: string;
}

function loadSchedules(ids?: number[]): ScheduleAnchorRow[] {
	const rows = getDb().prepare('SELECT id, every_n_weeks, anchor_week_key FROM schedules').all() as ScheduleAnchorRow[];
	return ids ? rows.filter(r => ids.includes(r.id)) : rows;
}

/** Primera aparición >= cutoffIdx de una programación con ese ancla y periodo. */
function firstOccurrenceFrom(anchorIdx: number, n: number, cutoffIdx: number): number {
	if (anchorIdx >= cutoffIdx) return anchorIdx;
	return anchorIdx + Math.ceil((cutoffIdx - anchorIdx) / n) * n;
}

/**
 * Guarda como filas de week_plans lo que las programaciones (todas o `ids`) ponían en las
 * semanas [fromIdx, toIdx], solo en los días con fecha en (afterDay, throughDay].
 */
function materialize(fromIdx: number, toIdx: number, afterDay: string | null, throughDay: string | null, ids?: number[]): void {
	const idSet = ids ? new Set(ids) : null;
	const db = getDb();
	for (let idx = fromIdx; idx <= toIdx; idx++) {
		const wk = indexToWeekKey(idx);
		const saved = new Set((db.prepare('SELECT slot_id FROM week_plans WHERE week_key = ?').all(wk) as { slot_id: number }[]).map(r => r.slot_id));
		for (const slot of getWeekData(wk).slots) {
			if (!slot.schedule || !slot.recipe || (idSet && !idSet.has(slot.schedule.id))) continue;
			const day = weekdayDateKey(wk, slot.weekday);
			if ((afterDay !== null && day <= afterDay) || (throughDay !== null && day > throughDay)) continue;
			if (saved.has(slot.slot_id)) {
				// Receta puesta a mano que coincide con la programada: queda anotado de dónde sale
				db.prepare('UPDATE week_plans SET schedule_id = ? WHERE week_key = ? AND slot_id = ? AND schedule_id IS NULL')
					.run(slot.schedule.id, wk, slot.slot_id);
			} else {
				assignRecipe(wk, slot.slot_id, slot.recipe.id, slot.is_leftover, slot.people, slot.schedule.id);
			}
		}
	}
}

/**
 * Consolida los días hasta `throughDay` (por defecto, ayer). Idempotente y barato si la marca
 * ya está al día: es lo que se ejecuta en cada petición.
 */
export function consolidateSchedules(throughDay: string = localDateKey(-1)): void {
	const mark = getConsolidatedThrough();
	if (mark !== null && mark >= throughDay) return;
	getDb().transaction(() => {
		const anchors = loadSchedules().map(s => weekKeyToIndex(s.anchor_week_key));
		if (anchors.length > 0) {
			const fromIdx = mark !== null ? weekKeyToIndex(dateKeyToWeekKey(mark)) : Math.min(...anchors);
			materialize(fromIdx, weekKeyToIndex(dateKeyToWeekKey(throughDay)), mark, throughDay);
		}
		setConsolidatedThrough(throughDay);
	})();
}

/** Adelanta las anclas < cutoff a su primera aparición >= cutoff (no cambia el futuro). */
function normalizeAnchors(cutoffWeekKey: string, ids?: number[]): void {
	const db = getDb();
	const cutoffIdx = weekKeyToIndex(cutoffWeekKey);
	const update = db.prepare('UPDATE schedules SET anchor_week_key = ? WHERE id = ?');
	for (const s of loadSchedules(ids)) {
		const anchorIdx = weekKeyToIndex(s.anchor_week_key);
		const newIdx = firstOccurrenceFrom(anchorIdx, s.every_n_weeks, cutoffIdx);
		if (newIdx !== anchorIdx) update.run(indexToWeekKey(newIdx), s.id);
	}
}

function deleteExceptionsBefore(cutoffWeekKey: string, ids?: number[]): void {
	const db = getDb();
	if (!ids) {
		db.prepare('DELETE FROM schedule_exceptions WHERE week_key < ?').run(cutoffWeekKey);
		return;
	}
	const del = db.prepare('DELETE FROM schedule_exceptions WHERE schedule_id = ? AND week_key < ?');
	for (const id of ids) del.run(id, cutoffWeekKey);
}

/**
 * Ejecuta una mutación de programaciones sin alterar el pasado: consolida hasta ayer antes, y
 * después normaliza anclas y limpia excepciones de semanas pasadas (ya no influyen en nada).
 */
export function withFrozenPast<T>(fn: () => T): T {
	const cutoff = getWeekKey();
	return getDb().transaction(() => {
		consolidateSchedules();
		const result = fn();
		normalizeAnchors(cutoff);
		deleteExceptionsBefore(cutoff);
		return result;
	})();
}

export function countSchedulesForMeal(weekday: number, mealType: string, isAccompaniment: number): number {
	const row = getDb().prepare(
		'SELECT COUNT(*) AS n FROM schedules WHERE weekday = ? AND meal_type = ? AND is_accompaniment = ?'
	).get(weekday, mealType, isAccompaniment) as { n: number };
	return row.n;
}

function mealScheduleIds(weekday: number, mealType: string, isAccompaniment: number): number[] {
	return (getDb().prepare(
		'SELECT id FROM schedules WHERE weekday = ? AND meal_type = ? AND is_accompaniment = ?'
	).all(weekday, mealType, isAccompaniment) as { id: number }[]).map(r => r.id);
}

/** Desplaza `delta` semanas las excepciones >= fromWeekKey (en el orden que evita chocar con el UNIQUE). */
function shiftExceptions(ids: number[], fromWeekKey: string, delta: 1 | -1, minWeekIdx: number): void {
	const db = getDb();
	const exceptions = db.prepare(
		`SELECT schedule_id, week_key FROM schedule_exceptions
		 WHERE schedule_id IN (${ids.map(() => '?').join(',')}) AND week_key >= ?
		 ORDER BY week_key ${delta < 0 ? 'ASC' : 'DESC'}`
	).all(...ids, fromWeekKey) as { schedule_id: number; week_key: string }[];
	const delEx = db.prepare('DELETE FROM schedule_exceptions WHERE schedule_id = ? AND week_key = ?');
	const insEx = db.prepare('INSERT OR IGNORE INTO schedule_exceptions (schedule_id, week_key) VALUES (?, ?)');
	for (const ex of exceptions) {
		delEx.run(ex.schedule_id, ex.week_key);
		const newIdx = weekKeyToIndex(ex.week_key) + delta;
		if (newIdx >= minWeekIdx) insEx.run(ex.schedule_id, indexToWeekKey(newIdx));
	}
}

/**
 * «Pasar a la siguiente»: quita la receta programada de `weekKey` y adelanta una semana toda la
 * rotación de esa comida: lo de la semana siguiente pasa a esta, etc., y la quitada vuelve al
 * final del ciclo. Solo para la semana actual o futuras.
 */
export function shiftScheduleRotation(weekKey: string, weekday: number, mealType: string, isAccompaniment: number): void {
	const current = getWeekKey();
	const weekIdx = weekKeyToIndex(weekKey);
	if (weekIdx < weekKeyToIndex(current)) throw new Error('No se puede desplazar la rotación en una semana pasada');

	const db = getDb();
	db.transaction(() => {
		consolidateSchedules();

		const ids = mealScheduleIds(weekday, mealType, isAccompaniment);
		if (ids.length === 0) return;

		// Las semanas entre la actual y la editada tampoco deben cambiar (sus días ya consolidados
		// no dependen de las programaciones)
		materialize(weekKeyToIndex(current), weekIdx - 1, getConsolidatedThrough(), null, ids);
		normalizeAnchors(weekKey, ids);
		deleteExceptionsBefore(weekKey, ids);

		// Adelantar una semana cada programación del hueco
		const updateAnchor = db.prepare('UPDATE schedules SET anchor_week_key = ? WHERE id = ?');
		for (const s of loadSchedules(ids)) {
			const shifted = firstOccurrenceFrom(weekKeyToIndex(s.anchor_week_key) - 1, s.every_n_weeks, weekIdx);
			updateAnchor.run(indexToWeekKey(shifted), s.id);
		}

		// Las excepciones siguen a la aparición a la que apuntaban (una semana antes)
		shiftExceptions(ids, weekKey, -1, weekIdx);
	})();
}

/**
 * Para un día ya consolidado en el que no se comió lo programado: retrasa una semana toda la
 * rotación de esa comida a partir de `weekKey`, de modo que la receta que tocaba pasa a la semana
 * siguiente y las demás se corren detrás. Los días consolidados no cambian.
 */
export function delayScheduleRotation(weekKey: string, weekday: number, mealType: string, isAccompaniment: number): void {
	const db = getDb();
	db.transaction(() => {
		consolidateSchedules();
		const ids = mealScheduleIds(weekday, mealType, isAccompaniment);
		if (ids.length === 0) return;
		const weekIdx = weekKeyToIndex(weekKey);
		const updateAnchor = db.prepare('UPDATE schedules SET anchor_week_key = ? WHERE id = ?');
		for (const s of loadSchedules(ids)) {
			const first = firstOccurrenceFrom(weekKeyToIndex(s.anchor_week_key), s.every_n_weeks, weekIdx);
			updateAnchor.run(indexToWeekKey(first + 1), s.id);
		}
		shiftExceptions(ids, weekKey, 1, weekIdx);
	})();
}
