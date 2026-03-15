import { getDb } from '$lib/db/index.js';
import type { Member } from '$lib/types/index.js';

export function getAllMembers(): Member[] {
	const db = getDb();
	return db.prepare('SELECT * FROM members ORDER BY name ASC').all() as Member[];
}

export function getMemberById(id: number): Member | undefined {
	const db = getDb();
	return db.prepare('SELECT * FROM members WHERE id = ?').get(id) as Member | undefined;
}

export function createMember(data: Omit<Member, 'id'>): Member {
	const db = getDb();
	const result = db.prepare(
		'INSERT INTO members (name, cannot_eat, likes, dislikes) VALUES (?, ?, ?, ?)'
	).run(data.name, data.cannot_eat, data.likes, data.dislikes);
	return getMemberById(result.lastInsertRowid as number)!;
}

export function updateMember(id: number, data: Partial<Omit<Member, 'id'>>): Member | undefined {
	const db = getDb();
	const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
	const values = [...Object.values(data), id];
	db.prepare(`UPDATE members SET ${fields} WHERE id = ?`).run(...values);
	return getMemberById(id);
}

export function deleteMember(id: number): void {
	const db = getDb();
	db.prepare('DELETE FROM members WHERE id = ?').run(id);
}
