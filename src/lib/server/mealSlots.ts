// Huecos de cada comida (meal_slots). Cada fila es una versión de un hueco: `slot_id` es la
// identidad (común a todas sus versiones) y la versión rige de effective_from a effective_to
// (NULL = sin final). Las versiones de un mismo hueco no se solapan.
//
// Toda edición se hace «desde una semana W»:
//   - W actual o futura: rige desde W hasta el siguiente cambio que ya tuviera el hueco
//     (añadir o quitar, en cambio, valen para siempre desde W);
//   - W pasada: solo afecta a W (la versión se parte en antes / W / después).
import { getDb } from '$lib/db/index.js';
import type { MealSlotKind, MealSlotRow, MealType } from '$lib/types/index.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';
import { parseTags } from '$lib/utils/parseTags.js';

const COVERS = 'effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)';

const prevWeek = (wk: string) => indexToWeekKey(weekKeyToIndex(wk) - 1);
const nextWeek = (wk: string) => indexToWeekKey(weekKeyToIndex(wk) + 1);
const isPast = (wk: string) => weekKeyToIndex(wk) < weekKeyToIndex(getWeekKey());

export interface SlotIdentity {
	weekday: number;
	meal_type: MealType;
	kind: MealSlotKind;
	parent_slot_id: number | null;
}

/** Versiones vigentes en una semana (todas las comidas). */
export function getSlotRowsForWeek(weekKey: string): MealSlotRow[] {
	return getDb().prepare(`
		SELECT * FROM meal_slots WHERE ${COVERS}
		ORDER BY weekday, meal_type, position, slot_id
	`).all(weekKey, weekKey) as MealSlotRow[];
}

/** Versión de un hueco vigente en una semana, o undefined si ese hueco no existe esa semana. */
export function getSlotVersion(slotId: number, weekKey: string): MealSlotRow | undefined {
	return getDb().prepare(`SELECT * FROM meal_slots WHERE slot_id = ? AND ${COVERS}`)
		.get(slotId, weekKey, weekKey) as MealSlotRow | undefined;
}

/** Día, comida y tipo de un hueco (no cambian entre versiones). */
export function getSlotIdentity(slotId: number): SlotIdentity | undefined {
	return getDb().prepare('SELECT weekday, meal_type, kind, parent_slot_id FROM meal_slots WHERE slot_id = ? LIMIT 1')
		.get(slotId) as SlotIdentity | undefined;
}

/** Última semana en la que existe un hueco (null = sin final). */
function lifetimeEnd(slotId: number): string | null {
	const rows = getDb().prepare('SELECT effective_to FROM meal_slots WHERE slot_id = ?').all(slotId) as { effective_to: string | null }[];
	if (rows.some(r => r.effective_to === null)) return null;
	return rows.reduce((max, r) => (r.effective_to! > max ? r.effective_to! : max), '');
}

function normalizeTags(tags: string[]): string {
	return [...new Set(parseTags(tags.join(',')))].join(',');
}

/**
 * Crea un hueco en una comida desde `weekKey`. Va detrás de sus hermanos (mismo tipo y mismo
 * plato padre). Un acompañamiento «por receta» no puede durar más que su plato.
 * Devuelve el slot_id del hueco nuevo.
 */
export function addSlot(
	weekKey: string, weekday: number, mealType: string, kind: MealSlotKind,
	parentSlotId: number | null = null, tags: string[] = [], singleWeek = false
): number {
	const db = getDb();
	return db.transaction(() => {
		let to: string | null = singleWeek || isPast(weekKey) ? weekKey : null;
		if (parentSlotId !== null) {
			const parent = getSlotVersion(parentSlotId, weekKey);
			if (!parent || parent.kind !== 'main' || parent.weekday !== weekday || parent.meal_type !== mealType) {
				throw new Error('El plato del que cuelga el acompañamiento no existe esa semana');
			}
			if (kind !== 'acc') throw new Error('Solo un acompañamiento puede colgar de un plato');
			const parentEnd = lifetimeEnd(parentSlotId);
			if (to === null) to = parentEnd;
			else if (parentEnd !== null && parentEnd < to) to = parentEnd;
		}
		const { maxPos } = db.prepare(`
			SELECT MAX(position) AS maxPos FROM meal_slots
			WHERE weekday = ? AND meal_type = ? AND kind = ? AND parent_slot_id IS ? AND ${COVERS}
		`).get(weekday, mealType, kind, parentSlotId, weekKey, weekKey) as { maxPos: number | null };
		const id = db.prepare(`
			INSERT INTO meal_slots (slot_id, weekday, meal_type, kind, parent_slot_id, effective_from, effective_to, position, tags)
			VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(weekday, mealType, kind, parentSlotId, weekKey, to, (maxPos ?? -1) + 1, normalizeTags(tags)).lastInsertRowid as number;
		db.prepare('UPDATE meal_slots SET slot_id = ? WHERE id = ?').run(id, id);
		return id;
	})();
}

function copyVersion(v: MealSlotRow, from: string, to: string | null): number {
	return getDb().prepare(`
		INSERT INTO meal_slots (slot_id, weekday, meal_type, kind, parent_slot_id, effective_from, effective_to, position, tags)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(v.slot_id, v.weekday, v.meal_type, v.kind, v.parent_slot_id, from, to, v.position, v.tags).lastInsertRowid as number;
}

/**
 * Parte la versión vigente en `weekKey` para que el tramo afectado por una edición desde esa
 * semana quede en una versión propia, y devuelve su id (null si el hueco no existe esa semana).
 */
function isolateFrom(slotId: number, weekKey: string): number | null {
	const db = getDb();
	const v = getSlotVersion(slotId, weekKey);
	if (!v) return null;
	const end = isPast(weekKey) ? weekKey : v.effective_to;
	if (end !== v.effective_to) copyVersion(v, nextWeek(weekKey), v.effective_to);
	if (v.effective_from < weekKey) {
		db.prepare('UPDATE meal_slots SET effective_to = ? WHERE id = ?').run(prevWeek(weekKey), v.id);
		return copyVersion(v, weekKey, end);
	}
	db.prepare('UPDATE meal_slots SET effective_to = ? WHERE id = ?').run(end, v.id);
	return v.id;
}

/** Fusiona versiones contiguas de un hueco que hayan quedado iguales. */
function mergeVersions(slotId: number): void {
	const db = getDb();
	const rows = db.prepare('SELECT * FROM meal_slots WHERE slot_id = ? ORDER BY effective_from').all(slotId) as MealSlotRow[];
	for (let i = rows.length - 1; i > 0; i--) {
		const a = rows[i - 1], b = rows[i];
		if (a.effective_to !== null && nextWeek(a.effective_to) === b.effective_from && a.tags === b.tags && a.position === b.position) {
			db.prepare('UPDATE meal_slots SET effective_to = ? WHERE id = ?').run(b.effective_to, a.id);
			db.prepare('DELETE FROM meal_slots WHERE id = ?').run(b.id);
			a.effective_to = b.effective_to;
		}
	}
}

/** Cambia los tags de un hueco desde `weekKey`. */
export function setSlotTags(weekKey: string, slotId: number, tags: string[]): void {
	const db = getDb();
	db.transaction(() => {
		const id = isolateFrom(slotId, weekKey);
		if (id === null) throw new Error('El hueco no existe esa semana');
		db.prepare('UPDATE meal_slots SET tags = ? WHERE id = ?').run(normalizeTags(tags), id);
		// Si el cambio devuelve los tags a los de la versión vecina, no dejar versiones duplicadas
		mergeVersions(slotId);
	})();
}

function removeOne(weekKey: string, slotId: number): void {
	const db = getDb();
	if (isPast(weekKey)) {
		const id = isolateFrom(slotId, weekKey);
		if (id === null) return;
		db.prepare('DELETE FROM meal_slots WHERE id = ?').run(id);
		db.prepare('DELETE FROM week_plans WHERE slot_id = ? AND week_key = ?').run(slotId, weekKey);
		return;
	}
	db.prepare('DELETE FROM meal_slots WHERE slot_id = ? AND effective_from >= ?').run(slotId, weekKey);
	db.prepare(`UPDATE meal_slots SET effective_to = ? WHERE slot_id = ? AND ${COVERS}`).run(prevWeek(weekKey), slotId, weekKey, weekKey);
	db.prepare('DELETE FROM week_plans WHERE slot_id = ? AND week_key >= ?').run(slotId, weekKey);
}

/**
 * Quita un hueco desde `weekKey` (solo esa semana si es pasada), junto con los acompañamientos
 * que cuelgan de él y las recetas que tuvieran en las semanas en que dejan de existir.
 */
export function removeSlot(weekKey: string, slotId: number): void {
	const db = getDb();
	db.transaction(() => {
		const children = (db.prepare('SELECT DISTINCT slot_id FROM meal_slots WHERE parent_slot_id = ?').all(slotId) as { slot_id: number }[])
			.map(r => r.slot_id);
		for (const id of [...children, slotId]) removeOne(weekKey, id);
	})();
}

/**
 * Hueco real para una asignación. Un id negativo es el hueco virtual que añade una programación
 * «add» (-schedule_id): se materializa como hueco de una sola semana.
 */
export function resolveSlotId(weekKey: string, slotId: number): number {
	if (slotId >= 0) return slotId;
	const sched = getDb().prepare('SELECT weekday, meal_type, is_accompaniment FROM schedules WHERE id = ?')
		.get(-slotId) as { weekday: number; meal_type: string; is_accompaniment: number } | undefined;
	if (!sched) throw new Error('Hueco virtual de una programación que ya no existe');
	return addSlot(weekKey, sched.weekday, sched.meal_type, sched.is_accompaniment ? 'acc' : 'main', null, [], true);
}

/** Día, comida y tipo de un hueco real o virtual. */
export function slotTarget(slotId: number): { weekday: number; meal_type: MealType; is_accompaniment: number } | undefined {
	if (slotId < 0) {
		const s = getDb().prepare('SELECT weekday, meal_type, is_accompaniment FROM schedules WHERE id = ?')
			.get(-slotId) as { weekday: number; meal_type: MealType; is_accompaniment: number } | undefined;
		return s;
	}
	const ident = getSlotIdentity(slotId);
	return ident && { weekday: ident.weekday, meal_type: ident.meal_type, is_accompaniment: ident.kind === 'acc' ? 1 : 0 };
}
