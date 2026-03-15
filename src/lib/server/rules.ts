import { getDb } from '$lib/db/index.js';
import type { Rule } from '$lib/types/index.js';

export function getAllRules(): Rule[] {
	const db = getDb();
	return db.prepare('SELECT * FROM rules ORDER BY tag ASC').all() as Rule[];
}

export function getRuleById(id: number): Rule | undefined {
	const db = getDb();
	return db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as Rule | undefined;
}

export function createRule(data: Omit<Rule, 'id'>): Rule {
	const db = getDb();
	const result = db.prepare(
		'INSERT INTO rules (tag, direction, times) VALUES (?, ?, ?)'
	).run(data.tag, data.direction, data.times);
	return getRuleById(result.lastInsertRowid as number)!;
}

export function updateRule(id: number, data: Partial<Omit<Rule, 'id'>>): Rule | undefined {
	const db = getDb();
	const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
	const values = [...Object.values(data), id];
	db.prepare(`UPDATE rules SET ${fields} WHERE id = ?`).run(...values);
	return getRuleById(id);
}

export function deleteRule(id: number): void {
	const db = getDb();
	db.prepare('DELETE FROM rules WHERE id = ?').run(id);
}
