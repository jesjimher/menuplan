import { getDb } from '$lib/db/index.js';
import type { WeekPlan, WeekDayConfig, SlotData, DayConfig, WeekData, ScheduleWithRecipe, MealType } from '$lib/types/index.js';
import { getAllRules } from './rules.js';
import { checkRules } from '$lib/utils/ruleChecker.js';
import { getOptions } from './options.js';
import { applySchedulesToWeek } from './schedules.js';
import { mapRowToRecipe } from './mappers.js';

interface WeekPlanRow {
	id: number; week_key: string; weekday: number; meal_type: MealType;
	slot_index: number; is_accompaniment: number;
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
	const configRows = db.prepare(
		'SELECT * FROM week_day_config WHERE week_key = ?'
	).all(weekKey) as WeekDayConfig[];

	const configs: Record<number, DayConfig> = {};
	for (let d = 1; d <= 7; d++) {
		configs[d] = {
			comida: { recipe_count: options.meals_per_day, accompaniment_per_recipe: options.side_dishes_per_recipe, accompaniment_per_slot: options.side_dishes_per_slot, required_tags: [], disabled: false, disabled_comment: null, note: null },
			cena: { recipe_count: options.dinners_per_day, accompaniment_per_recipe: options.side_dishes_per_recipe, accompaniment_per_slot: options.side_dishes_per_slot, required_tags: [], disabled: false, disabled_comment: null, note: null }
		};
	}

	for (const cfg of configRows) {
		if (!configs[cfg.weekday]) continue;
		const meal = cfg.meal_type as MealType;
		configs[cfg.weekday][meal] = {
			recipe_count: cfg.recipe_count,
			accompaniment_per_recipe: cfg.accompaniment_per_recipe,
			accompaniment_per_slot: cfg.accompaniment_per_slot,
			required_tags: parseRequiredTags(cfg.required_tag),
			disabled: !!cfg.disabled,
			disabled_comment: cfg.disabled_comment ?? null,
			note: cfg.note ?? null
		};
	}

	const rules = getAllRules();
	const violations = checkRules(slots, rules);

	return { week_key: weekKey, slots, configs, violations };
}

export function assignRecipe(weekKey: string, weekday: number, mealType: string, slotIndex: number, isAccompaniment: number, recipeId: number | null, memberId: number | null): void {
	const db = getDb();
	db.prepare(`
		INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id, member_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1))
		DO UPDATE SET recipe_id = excluded.recipe_id, member_id = excluded.member_id
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment, recipeId, memberId);
}

export function removeRecipe(weekKey: string, weekday: number, mealType: string, slotIndex: number, isAccompaniment: number): void {
	const db = getDb();
	db.prepare(`
		UPDATE week_plans SET recipe_id = NULL
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
		db.prepare('DELETE FROM week_day_config WHERE week_key = ?').run(weekKey);

		const plans = db.prepare('SELECT * FROM week_plans WHERE week_key = ?').all(previousWeekKey) as WeekPlan[];
		const insertPlan = db.prepare(`
			INSERT OR IGNORE INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id, member_id)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const plan of plans) {
			insertPlan.run(weekKey, plan.weekday, plan.meal_type, plan.slot_index, plan.is_accompaniment, plan.recipe_id, plan.member_id);
		}

		const configs = db.prepare('SELECT * FROM week_day_config WHERE week_key = ?').all(previousWeekKey) as WeekDayConfig[];
		const insertConfig = db.prepare(`
			INSERT OR IGNORE INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot, required_tag, disabled, disabled_comment, note)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		for (const cfg of configs) {
			insertConfig.run(weekKey, cfg.weekday, cfg.meal_type, cfg.recipe_count, cfg.accompaniment_per_recipe, cfg.accompaniment_per_slot, cfg.required_tag ?? null, cfg.disabled ?? 0, cfg.disabled_comment ?? null, cfg.note ?? null);
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
	const options = getOptions();

	const existing = db.prepare(
		'SELECT * FROM week_day_config WHERE week_key = ? AND weekday = ? AND meal_type = ?'
	).get(weekKey, weekday, mealType) as WeekDayConfig | undefined;

	const allTags = existing ? parseRequiredTags(existing.required_tag) : [];
	while (allTags.length <= slotIndex) allTags.push([]);
	allTags[slotIndex] = tags;
	// Eliminar arrays vacíos del final
	while (allTags.length > 0 && allTags[allTags.length - 1].length === 0) allTags.pop();

	const serialized = allTags.length === 0 ? null : JSON.stringify(allTags);

	if (existing) {
		db.prepare('UPDATE week_day_config SET required_tag = ? WHERE week_key = ? AND weekday = ? AND meal_type = ?')
			.run(serialized, weekKey, weekday, mealType);
	} else {
		const defaultCount = mealType === 'comida' ? options.meals_per_day : options.dinners_per_day;
		db.prepare(`
			INSERT INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot, required_tag)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(weekKey, weekday, mealType, defaultCount, options.side_dishes_per_recipe, options.side_dishes_per_slot, serialized);
	}
}

export function updateDayConfig(weekKey: string, weekday: number, mealType: string, config: Partial<WeekDayConfig>): void {
	const db = getDb();
	const options = getOptions();

	const existing = db.prepare(
		'SELECT * FROM week_day_config WHERE week_key = ? AND weekday = ? AND meal_type = ?'
	).get(weekKey, weekday, mealType) as WeekDayConfig | undefined;

	if (existing) {
		db.prepare(`
			UPDATE week_day_config SET
				recipe_count = ?,
				accompaniment_per_recipe = ?,
				accompaniment_per_slot = ?,
				required_tag = ?,
				disabled = ?,
				disabled_comment = ?,
				note = ?
			WHERE week_key = ? AND weekday = ? AND meal_type = ?
		`).run(
			config.recipe_count ?? existing.recipe_count,
			config.accompaniment_per_recipe ?? existing.accompaniment_per_recipe,
			config.accompaniment_per_slot ?? existing.accompaniment_per_slot,
			'required_tag' in config ? config.required_tag ?? null : existing.required_tag ?? null,
			'disabled' in config ? (config.disabled ? 1 : 0) : existing.disabled,
			'disabled_comment' in config ? config.disabled_comment ?? null : existing.disabled_comment ?? null,
			'note' in config ? config.note ?? null : existing.note ?? null,
			weekKey, weekday, mealType
		);
	} else {
		const defaultRecipeCount = mealType === 'comida' ? options.meals_per_day : options.dinners_per_day;
		db.prepare(`
			INSERT INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot, required_tag, disabled, disabled_comment, note)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			weekKey, weekday, mealType,
			config.recipe_count ?? defaultRecipeCount,
			config.accompaniment_per_recipe ?? options.side_dishes_per_recipe,
			config.accompaniment_per_slot ?? options.side_dishes_per_slot,
			config.required_tag ?? null,
			config.disabled ? 1 : 0,
			config.disabled_comment ?? null,
			config.note ?? null
		);
	}
}
