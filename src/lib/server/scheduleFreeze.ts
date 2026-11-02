// Las programaciones se resuelven al vuelo para cualquier semana, también las pasadas.
// Para que editar una programación no reescriba el histórico, antes de cada cambio se
// "congela" el pasado: lo que las programaciones colocaban en semanas anteriores al corte
// se guarda como filas normales en week_plans, y las anclas se adelantan a su primera
// aparición >= corte para que ninguna programación vuelva a activarse en el pasado.
import { getDb } from '$lib/db/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';
import { getWeekData, assignRecipe } from './weekplan.js';

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

/** Guarda como filas de week_plans lo que las programaciones ponían en semanas < cutoff. */
function materializePast(cutoffWeekKey: string, ids?: number[], fromWeekKey?: string): void {
	const schedules = loadSchedules(ids);
	if (schedules.length === 0) return;
	const cutoffIdx = weekKeyToIndex(cutoffWeekKey);
	let startIdx = Math.min(...schedules.map(s => weekKeyToIndex(s.anchor_week_key)));
	if (fromWeekKey) startIdx = Math.max(startIdx, weekKeyToIndex(fromWeekKey));
	const idSet = new Set(schedules.map(s => s.id));

	for (let idx = startIdx; idx < cutoffIdx; idx++) {
		const wk = indexToWeekKey(idx);
		for (const slot of getWeekData(wk).slots) {
			if (slot.schedule && idSet.has(slot.schedule.id) && slot.recipe) {
				assignRecipe(wk, slot.weekday, slot.meal_type, slot.slot_index, slot.is_accompaniment, slot.recipe.id, slot.is_leftover);
			}
		}
	}
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
 * Congela las semanas anteriores a `cutoffWeekKey`: materializa lo que mostraban las
 * programaciones, normaliza anclas y borra excepciones ya irrelevantes. Idempotente.
 */
export function freezeSchedulesBefore(cutoffWeekKey: string = getWeekKey()): void {
	getDb().transaction(() => {
		materializePast(cutoffWeekKey);
		normalizeAnchors(cutoffWeekKey);
		deleteExceptionsBefore(cutoffWeekKey);
	})();
}

/**
 * Ejecuta una mutación de programaciones sin alterar las semanas pasadas: congela antes,
 * y después vuelve a normalizar anclas por si la mutación puso alguna en el pasado.
 */
export function withFrozenPast<T>(fn: () => T): T {
	const cutoff = getWeekKey();
	return getDb().transaction(() => {
		freezeSchedulesBefore(cutoff);
		const result = fn();
		normalizeAnchors(cutoff);
		return result;
	})();
}

export function countSchedulesForMeal(weekday: number, mealType: string, isAccompaniment: number): number {
	const row = getDb().prepare(
		'SELECT COUNT(*) AS n FROM schedules WHERE weekday = ? AND meal_type = ? AND is_accompaniment = ?'
	).get(weekday, mealType, isAccompaniment) as { n: number };
	return row.n;
}

/**
 * Quita la receta programada de `weekKey` y adelanta una semana toda la rotación de esa
 * comida: lo de la semana siguiente pasa a esta, etc., y la quitada vuelve al final del ciclo.
 * Solo para la semana actual o futuras.
 */
export function shiftScheduleRotation(weekKey: string, weekday: number, mealType: string, isAccompaniment: number): void {
	const current = getWeekKey();
	const weekIdx = weekKeyToIndex(weekKey);
	if (weekIdx < weekKeyToIndex(current)) throw new Error('No se puede desplazar la rotación en una semana pasada');

	const db = getDb();
	db.transaction(() => {
		freezeSchedulesBefore(current);

		const ids = (db.prepare(
			'SELECT id FROM schedules WHERE weekday = ? AND meal_type = ? AND is_accompaniment = ?'
		).all(weekday, mealType, isAccompaniment) as { id: number }[]).map(r => r.id);
		if (ids.length === 0) return;

		// Las semanas entre la actual y la editada tampoco deben cambiar
		materializePast(weekKey, ids, current);
		normalizeAnchors(weekKey, ids);
		deleteExceptionsBefore(weekKey, ids);

		// Adelantar una semana cada programación del hueco
		const updateAnchor = db.prepare('UPDATE schedules SET anchor_week_key = ? WHERE id = ?');
		for (const s of loadSchedules(ids)) {
			const shifted = firstOccurrenceFrom(weekKeyToIndex(s.anchor_week_key) - 1, s.every_n_weeks, weekIdx);
			updateAnchor.run(indexToWeekKey(shifted), s.id);
		}

		// Las excepciones siguen a la aparición a la que apuntaban (una semana antes);
		// se recorren en orden ascendente para no chocar con UNIQUE(schedule_id, week_key).
		const exceptions = db.prepare(
			`SELECT schedule_id, week_key FROM schedule_exceptions
			 WHERE schedule_id IN (${ids.map(() => '?').join(',')}) AND week_key >= ?
			 ORDER BY week_key ASC`
		).all(...ids, weekKey) as { schedule_id: number; week_key: string }[];
		const delEx = db.prepare('DELETE FROM schedule_exceptions WHERE schedule_id = ? AND week_key = ?');
		const insEx = db.prepare('INSERT OR IGNORE INTO schedule_exceptions (schedule_id, week_key) VALUES (?, ?)');
		for (const ex of exceptions) {
			delEx.run(ex.schedule_id, ex.week_key);
			const newIdx = weekKeyToIndex(ex.week_key) - 1;
			if (newIdx >= weekIdx) insEx.run(ex.schedule_id, indexToWeekKey(newIdx));
		}
	})();
}
