import { getDb } from '$lib/db/index.js';

export function buildSafeUpdate(
	table: string,
	id: number,
	data: Record<string, unknown>,
	allowedColumns: string[]
): void {
	const entries = Object.entries(data).filter(([k]) => allowedColumns.includes(k));
	if (entries.length === 0) return;

	const db = getDb();
	const fields = entries.map(([k]) => `${k} = ?`).join(', ');
	const values = entries.map(([, v]) => v);
	db.prepare(`UPDATE ${table} SET ${fields} WHERE id = ?`).run(...values, id);
}
