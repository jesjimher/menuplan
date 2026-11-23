import { getDb } from '$lib/db/index.js';
import type { Person } from '$lib/types/index.js';

// Columnas sin el BLOB de la foto, para no cargarlo en consultas normales
const PERSON_COLS = 'id, name, sort_order, archived, image_type, created_at';

export function getAllPeople(): Person[] {
	return getDb().prepare(`SELECT ${PERSON_COLS} FROM people ORDER BY archived ASC, sort_order ASC, id ASC`).all() as Person[];
}

export function getActivePeople(): Person[] {
	return getDb().prepare(`SELECT ${PERSON_COLS} FROM people WHERE archived = 0 ORDER BY sort_order ASC, id ASC`).all() as Person[];
}

export function getPersonById(id: number): Person | undefined {
	return getDb().prepare(`SELECT ${PERSON_COLS} FROM people WHERE id = ?`).get(id) as Person | undefined;
}

export function createPerson(name: string): Person {
	const db = getDb();
	const { next } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM people').get() as { next: number };
	const id = db.prepare('INSERT INTO people (name, sort_order) VALUES (?, ?)').run(name, next).lastInsertRowid as number;
	return getPersonById(id)!;
}

export function updatePerson(id: number, data: { name?: string; archived?: boolean }): Person | undefined {
	const db = getDb();
	if (data.name !== undefined) db.prepare('UPDATE people SET name = ? WHERE id = ?').run(data.name, id);
	if (data.archived !== undefined) db.prepare('UPDATE people SET archived = ? WHERE id = ?').run(data.archived ? 1 : 0, id);
	return getPersonById(id);
}

/** Reordena las personas según el orden de ids recibido. */
export function reorderPeople(ids: number[]): void {
	const db = getDb();
	const update = db.prepare('UPDATE people SET sort_order = ? WHERE id = ?');
	db.transaction(() => { ids.forEach((id, i) => update.run(i, id)); })();
}

/** Borra la persona; las comidas, programaciones y reglas que eran solo suyas pasan a ser para todos. */
export function deletePerson(id: number): void {
	getDb().prepare('DELETE FROM people WHERE id = ?').run(id);
}

export function getPersonImageData(id: number): { data: Buffer; type: string } | null {
	const row = getDb().prepare('SELECT image_data, image_type FROM people WHERE id = ?').get(id) as { image_data: Buffer | null; image_type: string | null } | undefined;
	if (!row?.image_data || !row.image_type) return null;
	return { data: row.image_data, type: row.image_type };
}

export function setPersonImage(id: number, data: Buffer, type: string): void {
	getDb().prepare('UPDATE people SET image_data = ?, image_type = ? WHERE id = ?').run(data, type, id);
}

export function clearPersonImage(id: number): void {
	getDb().prepare('UPDATE people SET image_data = NULL, image_type = NULL WHERE id = ?').run(id);
}

// --- Tablas de unión (persona ↔ comida / programación / regla) ---

type PeopleLink = 'week_plan_people' | 'schedule_people' | 'rule_people';
const LINK_FK: Record<PeopleLink, string> = {
	week_plan_people: 'week_plan_id',
	schedule_people: 'schedule_id',
	rule_people: 'rule_id'
};

/** Mapa id → personas para una tabla de unión (opcionalmente limitado a ciertos ids). */
export function loadPeopleLinks(table: PeopleLink, ids?: number[]): Map<number, number[]> {
	const fk = LINK_FK[table];
	const db = getDb();
	const rows = (ids
		? (ids.length === 0 ? [] : db.prepare(
			`SELECT ${fk} AS owner, person_id FROM ${table} WHERE ${fk} IN (${ids.map(() => '?').join(',')}) ORDER BY person_id`
		).all(...ids))
		: db.prepare(`SELECT ${fk} AS owner, person_id FROM ${table} ORDER BY person_id`).all()
	) as { owner: number; person_id: number }[];
	const map = new Map<number, number[]>();
	for (const r of rows) {
		const list = map.get(r.owner) ?? [];
		list.push(r.person_id);
		map.set(r.owner, list);
	}
	return map;
}

/** Sustituye las personas de una fila (lista vacía = para todos). */
export function setPeopleLinks(table: PeopleLink, ownerId: number, people: number[]): void {
	const fk = LINK_FK[table];
	const db = getDb();
	db.prepare(`DELETE FROM ${table} WHERE ${fk} = ?`).run(ownerId);
	const insert = db.prepare(`INSERT OR IGNORE INTO ${table} (${fk}, person_id) SELECT ?, id FROM people WHERE id = ?`);
	for (const p of new Set(people)) insert.run(ownerId, p);
}
