import { getDb } from '$lib/db/index.js';
import type { Recipe } from '$lib/types/index.js';
import { buildSafeUpdate } from './utils.js';
import { getWeekKey, getWeekDates, MS_PER_DAY } from '$lib/utils/dates.js';
import { parseTags } from '$lib/utils/parseTags.js';
import { getWeekData } from './weekplan.js';

const RECIPE_COLS = 'id, name, description, tags, min_days, image_type, created_at';
const DEFAULT_TOP_FOR_SLOT_LIMIT = 3;
const DEFAULT_TOP_OVERALL_LIMIT = 20;
const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_SEARCH_LIMIT = 50;

export function getAllRecipes(): Recipe[] {
	const db = getDb();
	return db.prepare(`SELECT ${RECIPE_COLS} FROM recipes ORDER BY name ASC`).all() as Recipe[];
}

export function getRecipeById(id: number): Recipe | undefined {
	const db = getDb();
	return db.prepare(`SELECT ${RECIPE_COLS} FROM recipes WHERE id = ?`).get(id) as Recipe | undefined;
}

export function getRecipeImageData(id: number): { data: Buffer; type: string } | null {
	const db = getDb();
	const row = db.prepare('SELECT image_data, image_type FROM recipes WHERE id = ?').get(id) as { image_data: Buffer | null; image_type: string | null } | undefined;
	if (!row?.image_data || !row.image_type) return null;
	return { data: row.image_data, type: row.image_type };
}

export function setRecipeImage(id: number, data: Buffer, type: string): void {
	const db = getDb();
	db.prepare('UPDATE recipes SET image_data = ?, image_type = ? WHERE id = ?').run(data, type, id);
}

export function clearRecipeImage(id: number): void {
	const db = getDb();
	db.prepare('UPDATE recipes SET image_data = NULL, image_type = NULL WHERE id = ?').run(id);
}

export function createRecipe(data: Omit<Recipe, 'id' | 'created_at' | 'image_type'>): Recipe {
	const db = getDb();
	const result = db.prepare(
		'INSERT INTO recipes (name, description, tags, min_days) VALUES (?, ?, ?, ?)'
	).run(data.name, data.description, data.tags, data.min_days);
	return getRecipeById(result.lastInsertRowid as number)!;
}

export function updateRecipe(id: number, data: Partial<Omit<Recipe, 'id' | 'created_at'>>): Recipe | undefined {
	buildSafeUpdate('recipes', id, data as Record<string, unknown>, ['name', 'description', 'tags', 'min_days']);
	return getRecipeById(id);
}

export function deleteRecipe(id: number): void {
	const db = getDb();
	db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
}

export function searchRecipes(q: string, mealType?: string): Recipe[] {
	const db = getDb();
	let query = `SELECT ${RECIPE_COLS} FROM recipes WHERE 1=1`;
	const params: string[] = [];

	if (q) {
		query += ' AND (name LIKE ? OR tags LIKE ?)';
		const like = `%${q}%`;
		params.push(like, like);
	}

	if (mealType) {
		query += " AND (',' || REPLACE(LOWER(tags), ', ', ',') || ',' LIKE '%,' || LOWER(?) || ',%')";
		params.push(mealType);
	}

	query += ` ORDER BY name ASC LIMIT ${DEFAULT_SEARCH_LIMIT}`;
	return db.prepare(query).all(...params) as Recipe[];
}

export function getAllTags(): string[] {
	const db = getDb();
	const rows = db.prepare("SELECT tags FROM recipes WHERE tags != ''").all() as { tags: string }[];
	const tagSet = new Set<string>();
	for (const row of rows) {
		parseTags(row.tags).forEach(t => tagSet.add(t));
	}
	return Array.from(tagSet).sort();
}

export function getTopRecipesForSlot(weekday: number, mealType: string, limit = DEFAULT_TOP_FOR_SLOT_LIMIT): Recipe[] {
	const db = getDb();
	return db.prepare(`
		SELECT r.id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at, COUNT(*) as freq
		FROM week_plans wp
		JOIN recipes r ON r.id = wp.recipe_id
		WHERE wp.weekday = ? AND wp.meal_type = ? AND wp.is_accompaniment = 0
		GROUP BY r.id
		ORDER BY freq DESC
		LIMIT ?
	`).all(weekday, mealType, limit) as Recipe[];
}

export function getTopRecipesOverall(mealType: string, limit = DEFAULT_TOP_OVERALL_LIMIT): (Recipe & { freq: number })[] {
	const db = getDb();
	return db.prepare(`
		SELECT r.id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at, COUNT(*) as freq
		FROM week_plans wp
		JOIN recipes r ON r.id = wp.recipe_id
		WHERE wp.meal_type = ? AND wp.is_accompaniment = 0
		GROUP BY r.id
		ORDER BY freq DESC
		LIMIT ?
	`).all(mealType, limit) as (Recipe & { freq: number })[];
}

export function getRecentRecipesForSlot(weekday: number, mealType: string, limit = DEFAULT_RECENT_LIMIT): (Recipe & { last_week: string | null })[] {
	const db = getDb();
	return db.prepare(`
		SELECT r.id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at,
		       MAX(wp.week_key) as last_week
		FROM recipes r
		LEFT JOIN week_plans wp ON wp.recipe_id = r.id
		                       AND wp.weekday = ?
		                       AND wp.meal_type = ?
		                       AND wp.is_accompaniment = 0
		WHERE (',' || REPLACE(LOWER(r.tags), ', ', ',') || ',' LIKE '%,' || LOWER(?) || ',%')
		GROUP BY r.id
		HAVING last_week IS NOT NULL
		ORDER BY last_week DESC
		LIMIT ?
	`).all(weekday, mealType, mealType, limit) as (Recipe & { last_week: string | null })[];
}

export function getOldestPlannedRecipes(mealType: string, limit = DEFAULT_RECENT_LIMIT): (Recipe & { last_week: string | null })[] {
	const db = getDb();
	return db.prepare(`
		SELECT r.id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at, MAX(wp.week_key) as last_week
		FROM recipes r
		LEFT JOIN week_plans wp ON wp.recipe_id = r.id AND wp.meal_type = ? AND wp.is_accompaniment = 0
		WHERE (',' || REPLACE(LOWER(r.tags), ', ', ',') || ',' LIKE '%,' || LOWER(?) || ',%')
		GROUP BY r.id
		ORDER BY last_week ASC NULLS FIRST
		LIMIT ?
	`).all(mealType, mealType, limit) as (Recipe & { last_week: string | null })[];
}

export function getRecipesPlannedNearDate(targetDate: Date, daysBack = 7): Recipe[] {
	const startDate = new Date(targetDate.getTime() - daysBack * MS_PER_DAY);

	const weekKeys = new Set<string>();
	const cur = new Date(startDate);
	while (cur.getTime() < targetDate.getTime()) {
		weekKeys.add(getWeekKey(cur));
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	if (weekKeys.size === 0) return [];

	const targetTime = targetDate.getTime();
	const startTime = startDate.getTime();

	// Usamos getWeekData (en vez de consultar week_plans directamente) porque también
	// incluye las recetas colocadas por programaciones (schedules), que son slots
	// virtuales que nunca se escriben en week_plans.
	const seen = new Map<number, { recipe: Recipe; date: number }>();
	for (const weekKey of weekKeys) {
		const dates = getWeekDates(weekKey);
		for (const slot of getWeekData(weekKey).slots) {
			if (!slot.recipe || slot.is_accompaniment !== 0 || slot.is_leftover !== 0) continue;
			const rowDate = dates[slot.weekday - 1];
			if (!rowDate) continue;
			const rowTime = rowDate.getTime();
			if (rowTime >= startTime && rowTime < targetTime) {
				const existing = seen.get(slot.recipe.id);
				if (!existing || rowTime > existing.date) {
					seen.set(slot.recipe.id, { recipe: slot.recipe, date: rowTime });
				}
			}
		}
	}

	return Array.from(seen.values())
		.sort((a, b) => b.date - a.date)
		.map(v => v.recipe);
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
