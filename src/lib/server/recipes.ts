import { getDb } from '$lib/db/index.js';
import type { Recipe } from '$lib/types/index.js';

export function getAllRecipes(): Recipe[] {
	const db = getDb();
	return db.prepare('SELECT * FROM recipes ORDER BY name ASC').all() as Recipe[];
}

export function getRecipeById(id: number): Recipe | undefined {
	const db = getDb();
	return db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Recipe | undefined;
}

export function createRecipe(data: Omit<Recipe, 'id' | 'created_at'>): Recipe {
	const db = getDb();
	const result = db.prepare(
		'INSERT INTO recipes (name, description, tags, min_days) VALUES (?, ?, ?, ?)'
	).run(data.name, data.description, data.tags, data.min_days);
	return getRecipeById(result.lastInsertRowid as number)!;
}

export function updateRecipe(id: number, data: Partial<Omit<Recipe, 'id' | 'created_at'>>): Recipe | undefined {
	const db = getDb();
	const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
	const values = [...Object.values(data), id];
	db.prepare(`UPDATE recipes SET ${fields} WHERE id = ?`).run(...values);
	return getRecipeById(id);
}

export function deleteRecipe(id: number): void {
	const db = getDb();
	db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
}

export function searchRecipes(q: string, mealType?: string): Recipe[] {
	const db = getDb();
	let query = 'SELECT * FROM recipes WHERE 1=1';
	const params: string[] = [];

	if (q) {
		query += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
		const like = `%${q}%`;
		params.push(like, like, like);
	}

	if (mealType) {
		query += ' AND (tags LIKE ? OR tags LIKE ? OR tags LIKE ?)';
		params.push(mealType, `${mealType},%`, `%,${mealType}`);
	}

	query += ' ORDER BY name ASC LIMIT 50';
	return db.prepare(query).all(...params) as Recipe[];
}

export function getAllTags(): string[] {
	const db = getDb();
	const rows = db.prepare("SELECT tags FROM recipes WHERE tags != ''").all() as { tags: string }[];
	const tagSet = new Set<string>();
	for (const row of rows) {
		row.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).forEach(t => tagSet.add(t));
	}
	return Array.from(tagSet).sort();
}

export function getTopRecipesForSlot(weekday: number, mealType: string, limit = 3): Recipe[] {
	const db = getDb();
	return db.prepare(`
		SELECT r.*, COUNT(*) as freq
		FROM week_plans wp
		JOIN recipes r ON r.id = wp.recipe_id
		WHERE wp.weekday = ? AND wp.meal_type = ? AND wp.is_accompaniment = 0
		GROUP BY r.id
		ORDER BY freq DESC
		LIMIT ?
	`).all(weekday, mealType, limit) as Recipe[];
}

export function importPlantoeatRecipes(text: string): Recipe[] {
	const blocks = text.split(/\n-{5,}\n/).filter(b => b.trim());
	const created: Recipe[] = [];

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		const data: Record<string, string> = {};
		let currentKey = '';

		for (const line of lines) {
			const match = line.match(/^([A-Za-z ]+):\s*(.*)$/);
			if (match) {
				currentKey = match[1].toLowerCase().replace(/ /g, '_');
				data[currentKey] = match[2].trim();
			} else if (currentKey) {
				data[currentKey] = (data[currentKey] || '') + '\n' + line;
			}
		}

		if (!data.title) continue;

		const tags: string[] = [];
		if (data.course) tags.push(data.course.toLowerCase().trim());
		if (data.tags) {
			// Plantoeat uses " ^ " as tag separator, also support comma
			const sep = data.tags.includes('^') ? /\s*\^\s*/ : /,/;
			tags.push(...data.tags.split(sep).map(t => t.trim().toLowerCase()).filter(Boolean));
		}

		const recipe = createRecipe({
			name: data.title,
			description: (data.directions || data.description || '').trim(),
			tags: tags.join(','),
			min_days: -1
		});
		created.push(recipe);
	}

	return created;
}
