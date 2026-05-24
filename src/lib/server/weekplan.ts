import { getDb } from '$lib/db/index.js';
import type { WeekPlan, WeekDayConfig, SlotData, DayConfig, WeekData, ScheduleWithRecipe, MealType } from '$lib/types/index.js';
import { getAllRules } from './rules.js';
import { checkRules } from '$lib/utils/ruleChecker.js';
import { getOptions } from './options.js';
import { applySchedulesToWeek } from './schedules.js';
import { mapRowToRecipe } from './mappers.js';
import { getWeekKey, weekKeyToIndex } from '$lib/utils/dates.js';
import type Database from 'better-sqlite3';

interface WeekPlanRow {
	id: number; week_key: string; weekday: number; meal_type: MealType;
	slot_index: number; is_accompaniment: number; is_leftover: number;
	recipe_id: number | null; member_id: number | null;
	r_id: number | null; name: string | null; description: string | null;
	tags: string | null; min_days: number | null; image_type: string | null; created_at: string | null;
	m_id: number | null; m_name: string | null;
	cannot_eat: string | null; likes: string | null; dislikes: string | null;
}

interface ScheduleRow {
	id: number; recipe_id: number; weekday: number; meal_type: MealType;
	slot_index: number; is_accompaniment: number;
	every_n_weeks: number; anchor_week_key: string; created_at: string;
	r_id: number; r_name: string; r_description: string;
	r_tags: string; r_min_days: number; r_image_type: string | null; r_created_at: string;
}

function getEffectiveStickyConfig(db: Database.Database, weekKey: string, weekday: number, mealType: string) {
	const row = db.prepare(`
		SELECT * FROM week_day_config
		WHERE sticky = 1 AND week_key <= ?
		  AND weekday = ? AND meal_type = ?
		ORDER BY week_key DESC LIMIT 1
	`).get(weekKey, weekday, mealType) as WeekDayConfig | undefined;
	if (row) return {
		recipe_count: row.recipe_count,
		accompaniment_per_recipe: row.accompaniment_per_recipe,
		accompaniment_per_slot: row.accompaniment_per_slot,
		required_tag: row.required_tag ?? null
	};
	const options = getOptions();
	return {
		recipe_count: mealType === 'comida' ? options.meals_per_day : options.dinners_per_day,
		accompaniment_per_recipe: options.side_dishes_per_recipe,
		accompaniment_per_slot: options.side_dishes_per_slot,
		required_tag: null as string | null
	};
}

function computeNewSticky(existing: WeekDayConfig | undefined, weekKey: string): number {
	const isFutureOrNow = weekKeyToIndex(weekKey) >= weekKeyToIndex(getWeekKey());
	if (existing) return existing.sticky || (isFutureOrNow ? 1 : 0);
	return isFutureOrNow ? 1 : 0;
}

function parseRequiredTags(raw: string | null): string[][] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map(item => {
				if (Array.isArray(item)) return item.filter((t): t is string => typeof t === 'string' && !!t);
				if (typeof item === 'string' && item) return [item]; // formato antiguo: string por slot
				return [];
			});
		}
		if (typeof parsed === 'string' && parsed) return [[parsed]];
		return [];
	} catch {
		return [[raw]]; // legacy: plain string → primer slot
	}
}

export function getWeekData(weekKey: string): WeekData {
	applySchedulesToWeek(weekKey);

	const db = getDb();

	const plans = db.prepare(`
		SELECT wp.*, r.id as r_id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at,
		       m.id as m_id, m.name as m_name, m.cannot_eat, m.likes, m.dislikes
		FROM week_plans wp
		LEFT JOIN recipes r ON r.id = wp.recipe_id
		LEFT JOIN members m ON m.id = wp.member_id
		WHERE wp.week_key = ?
		ORDER BY wp.weekday, wp.meal_type, wp.is_accompaniment, wp.slot_index
	`).all(weekKey) as WeekPlanRow[];

	// Cargar schedules — excepciones en una sola query (evita N+1)
	const schedRows = db.prepare(`
		SELECT s.*,
		       r.id as r_id, r.name as r_name, r.description as r_description,
		       r.tags as r_tags, r.min_days as r_min_days, r.image_type as r_image_type,
		       r.created_at as r_created_at
		FROM schedules s
		JOIN recipes r ON r.id = s.recipe_id
	`).all() as ScheduleRow[];

	const exceptionRows = db.prepare(
		'SELECT schedule_id, week_key FROM schedule_exceptions'
	).all() as { schedule_id: number; week_key: string }[];
	const exceptionsMap = new Map<number, string[]>();
	for (const e of exceptionRows) {
		const list = exceptionsMap.get(e.schedule_id) ?? [];
		list.push(e.week_key);
		exceptionsMap.set(e.schedule_id, list);
	}

	const schedMap = new Map<string, ScheduleWithRecipe>();
	for (const s of schedRows) {
		const key = `${s.weekday}-${s.meal_type}-${s.slot_index}-${s.is_accompaniment}`;
		schedMap.set(key, {
			id: s.id,
			recipe_id: s.recipe_id,
			weekday: s.weekday,
			meal_type: s.meal_type,
			slot_index: s.slot_index,
			is_accompaniment: s.is_accompaniment,
			every_n_weeks: s.every_n_weeks,
			anchor_week_key: s.anchor_week_key,
			created_at: s.created_at,
			recipe: {
				id: s.r_id,
				name: s.r_name,
				description: s.r_description,
				tags: s.r_tags,
				min_days: s.r_min_days,
				image_type: s.r_image_type ?? null,
				created_at: s.r_created_at
			},
			exceptions: exceptionsMap.get(s.id) ?? []
		});
	}

	const slots: SlotData[] = plans.map(p => ({
		weekday: p.weekday,
		meal_type: p.meal_type,
		slot_index: p.slot_index,
		is_accompaniment: p.is_accompaniment,
		is_leftover: p.is_leftover ?? 0,
		recipe: p.recipe_id ? {
			id: p.r_id as number,
			name: p.name as string,
			description: p.description as string,
			tags: p.tags as string,
			min_days: p.min_days as number,
			image_type: (p.image_type as string | null) ?? null,
			created_at: p.created_at as string
		} : null,
		member: p.member_id ? {
			id: p.m_id as number,
			name: p.m_name as string,
			cannot_eat: p.cannot_eat as string,
			likes: p.likes as string,
			dislikes: p.dislikes as string
		} : null,
		schedule: schedMap.get(`${p.weekday}-${p.meal_type}-${p.slot_index}-${p.is_accompaniment}`) ?? null
	}));

	const options = getOptions();
	const exactRows = db.prepare(
		'SELECT * FROM week_day_config WHERE week_key = ?'
	).all(weekKey) as WeekDayConfig[];

	const stickyRows = db.prepare(`
		SELECT c.*
		FROM week_day_config c
		WHERE c.sticky = 1 AND c.week_key <= ?
		  AND c.week_key = (
		    SELECT MAX(c2.week_key) FROM week_day_config c2
		    WHERE c2.sticky = 1 AND c2.week_key <= ?
		      AND c2.weekday = c.weekday AND c2.meal_type = c.meal_type
		  )
	`).all(weekKey, weekKey) as WeekDayConfig[];

	const configs: Record<number, DayConfig> = {};
	for (let d = 1; d <= 7; d++) {
		configs[d] = {
			comida: { recipe_count: options.meals_per_day, accompaniment_per_recipe: options.side_dishes_per_recipe, accompaniment_per_slot: options.side_dishes_per_slot, required_tags: [], disabled: false, disabled_comment: null, note: null },
			cena: { recipe_count: options.dinners_per_day, accompaniment_per_recipe: options.side_dishes_per_recipe, accompaniment_per_slot: options.side_dishes_per_slot, required_tags: [], disabled: false, disabled_comment: null, note: null }
		};
	}

	const stickyMap = new Map<string, WeekDayConfig>();
	for (const s of stickyRows) stickyMap.set(`${s.weekday}-${s.meal_type}`, s);
	const exactMap = new Map<string, WeekDayConfig>();
	for (const e of exactRows) exactMap.set(`${e.weekday}-${e.meal_type}`, e);

	for (let d = 1; d <= 7; d++) {
		for (const meal of ['comida', 'cena'] as MealType[]) {
			const key = `${d}-${meal}`;
			const src = exactMap.get(key) ?? stickyMap.get(key);
			if (src) {
				configs[d][meal].recipe_count = src.recipe_count;
				configs[d][meal].accompaniment_per_recipe = src.accompaniment_per_recipe;
				configs[d][meal].accompaniment_per_slot = src.accompaniment_per_slot;
				configs[d][meal].required_tags = parseRequiredTags(src.required_tag);
			}
			const exact = exactMap.get(key);
			if (exact) {
				configs[d][meal].disabled = !!exact.disabled;
				configs[d][meal].disabled_comment = exact.disabled_comment ?? null;
				configs[d][meal].note = exact.note ?? null;
			}
		}
	}

	const rules = getAllRules();
	const violations = checkRules(slots, rules);

	return { week_key: weekKey, slots, configs, violations };
}

export function assignRecipe(weekKey: string, weekday: number, mealType: string, slotIndex: number, isAccompaniment: number, recipeId: number | null, memberId: number | null, isLeftover = 0): void {
	const db = getDb();
	db.prepare(`
		INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id, member_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1))
		DO UPDATE SET recipe_id = excluded.recipe_id, member_id = excluded.member_id, is_leftover = excluded.is_leftover
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment, isLeftover, recipeId, memberId);
}

export function removeRecipe(weekKey: string, weekday: number, mealType: string, slotIndex: number, isAccompaniment: number): void {
	const db = getDb();
	db.prepare(`
		UPDATE week_plans SET recipe_id = NULL, is_leftover = 0
		WHERE week_key = ? AND weekday = ? AND meal_type = ? AND slot_index = ? AND is_accompaniment = ?
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment);
}

export function clearWeek(weekKey: string): void {
	const db = getDb();
	db.prepare('DELETE FROM week_plans WHERE week_key = ?').run(weekKey);
}

export function copyPreviousWeek(weekKey: string, previousWeekKey: string): void {
	const db = getDb();

	db.transaction(() => {
		db.prepare('DELETE FROM week_plans WHERE week_key = ?').run(weekKey);

		const plans = db.prepare('SELECT * FROM week_plans WHERE week_key = ?').all(previousWeekKey) as WeekPlan[];
		const insertPlan = db.prepare(`
			INSERT OR IGNORE INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id, member_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const plan of plans) {
			insertPlan.run(weekKey, plan.weekday, plan.meal_type, plan.slot_index, plan.is_accompaniment, plan.is_leftover ?? 0, plan.recipe_id, plan.member_id);
		}
	})();
}

export function getHistory(): string[] {
	const db = getDb();
	const rows = db.prepare('SELECT DISTINCT week_key FROM week_plans ORDER BY week_key DESC').all() as { week_key: string }[];
	return rows.map(r => r.week_key);
}

export function updateSlotRequiredTag(weekKey: string, weekday: number, mealType: string, slotIndex: number, tags: string[]): void {
	const db = getDb();

	const existing = db.prepare(
		'SELECT * FROM week_day_config WHERE week_key = ? AND weekday = ? AND meal_type = ?'
	).get(weekKey, weekday, mealType) as WeekDayConfig | undefined;

	const allTags = existing ? parseRequiredTags(existing.required_tag) : parseRequiredTags(getEffectiveStickyConfig(db, weekKey, weekday, mealType).required_tag);
	while (allTags.length <= slotIndex) allTags.push([]);
	allTags[slotIndex] = tags;
	// Eliminar arrays vacíos del final
	while (allTags.length > 0 && allTags[allTags.length - 1].length === 0) allTags.pop();

	const serialized = allTags.length === 0 ? null : JSON.stringify(allTags);
	const newSticky = computeNewSticky(existing, weekKey);

	if (existing) {
		db.prepare('UPDATE week_day_config SET required_tag = ?, sticky = ? WHERE week_key = ? AND weekday = ? AND meal_type = ?')
			.run(serialized, newSticky, weekKey, weekday, mealType);
	} else {
		const inherited = getEffectiveStickyConfig(db, weekKey, weekday, mealType);
		db.prepare(`
			INSERT INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot, required_tag, sticky)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(weekKey, weekday, mealType, inherited.recipe_count, inherited.accompaniment_per_recipe, inherited.accompaniment_per_slot, serialized, newSticky);
	}
}

export function updateDayConfig(weekKey: string, weekday: number, mealType: string, config: Partial<WeekDayConfig>): void {
	const db = getDb();

	const existing = db.prepare(
		'SELECT * FROM week_day_config WHERE week_key = ? AND weekday = ? AND meal_type = ?'
	).get(weekKey, weekday, mealType) as WeekDayConfig | undefined;

	const newSticky = computeNewSticky(existing, weekKey);

	if (existing) {
		db.prepare(`
			UPDATE week_day_config SET
				recipe_count = ?,
				accompaniment_per_recipe = ?,
				accompaniment_per_slot = ?,
				required_tag = ?,
				disabled = ?,
				disabled_comment = ?,
				note = ?,
				sticky = ?
			WHERE week_key = ? AND weekday = ? AND meal_type = ?
		`).run(
			config.recipe_count ?? existing.recipe_count,
			config.accompaniment_per_recipe ?? existing.accompaniment_per_recipe,
			config.accompaniment_per_slot ?? existing.accompaniment_per_slot,
			'required_tag' in config ? config.required_tag ?? null : existing.required_tag ?? null,
			'disabled' in config ? (config.disabled ? 1 : 0) : existing.disabled,
			'disabled_comment' in config ? config.disabled_comment ?? null : existing.disabled_comment ?? null,
			'note' in config ? config.note ?? null : existing.note ?? null,
			newSticky,
			weekKey, weekday, mealType
		);
	} else {
		const inherited = getEffectiveStickyConfig(db, weekKey, weekday, mealType);
		db.prepare(`
			INSERT INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot, required_tag, disabled, disabled_comment, note, sticky)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			weekKey, weekday, mealType,
			config.recipe_count ?? inherited.recipe_count,
			config.accompaniment_per_recipe ?? inherited.accompaniment_per_recipe,
			config.accompaniment_per_slot ?? inherited.accompaniment_per_slot,
			'required_tag' in config ? config.required_tag ?? null : inherited.required_tag,
			config.disabled ? 1 : 0,
			config.disabled_comment ?? null,
			config.note ?? null,
			newSticky
		);
	}
}
