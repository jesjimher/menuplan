import { getDb } from '$lib/db/index.js';
import type { Rule } from '$lib/types/index.js';
import { buildSafeUpdate } from './utils.js';
import { loadPeopleLinks, setPeopleLinks } from './people.js';

type RuleRow = Omit<Rule, 'people'>;

export function getAllRules(): Rule[] {
	const rows = getDb().prepare('SELECT * FROM rules ORDER BY tag ASC').all() as RuleRow[];
	const links = loadPeopleLinks('rule_people');
	return rows.map(r => ({ ...r, people: links.get(r.id) ?? [] }));
}

export function getRuleById(id: number): Rule | undefined {
	const row = getDb().prepare('SELECT * FROM rules WHERE id = ?').get(id) as RuleRow | undefined;
	if (!row) return undefined;
	return { ...row, people: loadPeopleLinks('rule_people', [id]).get(id) ?? [] };
}

export function createRule(data: Omit<Rule, 'id' | 'people'> & { people?: number[] }): Rule {
	const db = getDb();
	const id = db.transaction(() => {
		const newId = db.prepare(
			'INSERT INTO rules (tag, direction, times) VALUES (?, ?, ?)'
		).run(data.tag, data.direction, data.times).lastInsertRowid as number;
		if (data.people) setPeopleLinks('rule_people', newId, data.people);
		return newId;
	})();
	return getRuleById(id)!;
}

export function updateRule(id: number, data: Partial<Omit<Rule, 'id'>>): Rule | undefined {
	const { people, ...cols } = data;
	getDb().transaction(() => {
		buildSafeUpdate('rules', id, cols as Record<string, unknown>, ['tag', 'direction', 'times']);
		if (people) setPeopleLinks('rule_people', id, people);
	})();
	return getRuleById(id);
}

export function deleteRule(id: number): void {
	const db = getDb();
	db.prepare('DELETE FROM rules WHERE id = ?').run(id);
}
