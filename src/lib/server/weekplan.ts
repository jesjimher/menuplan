import { getDb } from '$lib/db/index.js';
import type { WeekPlan, WeekDayConfig, SlotData, DayConfig, WeekData, ScheduleWithRecipe, MealType } from '$lib/types/index.js';
import { getAllRules } from './rules.js';
import { checkRules } from '$lib/utils/ruleChecker.js';
import { getOptions } from './options.js';
import { getActiveSchedulesForWeek } from './schedules.js';
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

	// Programaciones activas para esta semana (ya ordenadas por priority DESC, id ASC)
	const activeSchedules = getActiveSchedulesForWeek(weekKey);

	// Construir slots manuales desde week_plans
	const manualSlots: SlotData[] = plans
		.filter(p => p.recipe_id !== null)
		.map(p => ({
			weekday: p.weekday,
			meal_type: p.meal_type,
			slot_index: p.slot_index,
			is_accompaniment: p.is_accompaniment,
			is_leftover: (p.is_leftover ?? 0) as 0 | 1,
			recipe: {
				id: p.r_id as number,
				name: p.name as string,
				description: p.description as string,
				tags: p.tags as string,
				min_days: p.min_days as number,
				image_type: (p.image_type as string | null) ?? null,
				created_at: p.created_at as string
			},
			member: p.member_id ? {
				id: p.m_id as number,
				name: p.m_name as string,
				cannot_eat: p.cannot_eat as string,
				likes: p.likes as string,
				dislikes: p.dislikes as string
			} : null,
			schedule: null as ScheduleWithRecipe | null
		}));

	// Agrupar slots manuales por comida: "wd-mt-ia" → SlotData[]
	const mealKey = (wd: number, mt: string, ia: number) => `${wd}-${mt}-${ia}`;
	const mealSlots = new Map<string, SlotData[]>();
	for (const slot of manualSlots) {
		const key = mealKey(slot.weekday, slot.meal_type, slot.is_accompaniment);
		const arr = mealSlots.get(key) ?? [];
		arr.push(slot);
		mealSlots.set(key, arr);
	}

	// Slots virtuales añadidos por programaciones con on_conflict='add'
	const virtualSlots: SlotData[] = [];

	// Aplicar programaciones a nivel de comida
	for (const sched of activeSchedules) {
		const key = mealKey(sched.weekday, sched.meal_type, sched.is_accompaniment);
		const mealArr = mealSlots.get(key) ?? [];

		// Si la receta ya está en un slot manual de esta comida, adjuntar referencia
		const existingIdx = mealArr.findIndex(s => s.recipe?.id === sched.recipe_id);
		if (existingIdx >= 0) {
			if (!mealArr[existingIdx].schedule) {
				mealArr[existingIdx] = { ...mealArr[existingIdx], schedule: sched };
				mealSlots.set(key, mealArr);
			}
			continue;
		}

		// Calcular capacidad máxima de la comida
		const cfg = getEffectiveStickyConfig(db, weekKey, sched.weekday, sched.meal_type);
		const maxSlots = sched.is_accompaniment === 0 ? cfg.recipe_count : cfg.accompaniment_per_slot;

		// Encontrar el primer slot_index libre (no ocupado por entrada manual)
		const occupied = new Set(mealArr.map(s => s.slot_index));
		let freeSlot = -1;
		for (let i = 0; i < maxSlots; i++) {
			if (!occupied.has(i)) { freeSlot = i; break; }
		}

		if (freeSlot >= 0) {
			// Colocar la programación en el hueco libre
			const newSlot: SlotData = {
				weekday: sched.weekday,
				meal_type: sched.meal_type,
				slot_index: freeSlot,
				is_accompaniment: sched.is_accompaniment,
				is_leftover: 0,
				recipe: sched.recipe,
				member: null,
				schedule: sched
			};
			mealArr.push(newSlot);
			mealSlots.set(key, mealArr);
		} else if (sched.on_conflict === 'overwrite') {
			// Sobreescribir slot_index 0
			const idx0 = mealArr.findIndex(s => s.slot_index === 0);
			if (idx0 >= 0) {
				mealArr[idx0] = { ...mealArr[idx0], recipe: sched.recipe, is_leftover: 0, schedule: sched };
				mealSlots.set(key, mealArr);
			}
		} else if (sched.on_conflict === 'add') {
			// Añadir slot virtual adicional más allá de los existentes
			const allInMeal = [...mealArr, ...virtualSlots.filter(s => s.weekday === sched.weekday && s.meal_type === sched.meal_type && s.is_accompaniment === sched.is_accompaniment)];
			const maxIdx = allInMeal.reduce((m, s) => Math.max(m, s.slot_index), -1);
			virtualSlots.push({
				weekday: sched.weekday,
				meal_type: sched.meal_type,
				slot_index: maxIdx + 1,
				is_accompaniment: sched.is_accompaniment,
				is_leftover: 0,
				recipe: sched.recipe,
				member: null,
				schedule: sched
			});
		}
		// on_conflict === 'skip': no hacer nada si la comida está llena
	}

	const allManual = [...mealSlots.values()].flat();
	const slots: SlotData[] = [...allManual, ...virtualSlots]
		.sort((a, b) => a.weekday - b.weekday || a.meal_type.localeCompare(b.meal_type) || a.is_accompaniment - b.is_accompaniment || a.slot_index - b.slot_index);

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

export interface ScheduleSlotResolution {
	week_key: string;
	weekday: number;
	meal_type: MealType;
	schedule_id: number;
}

// Para cada semana indicada, qué programaciones acaban realmente colocadas en un slot
// (las que no aparecen aquí pero sí estaban activas esa semana han sido desactivadas por un conflicto).
export function getScheduleResolutionsForWeeks(weekKeys: string[]): ScheduleSlotResolution[] {
	const out: ScheduleSlotResolution[] = [];
	for (const weekKey of weekKeys) {
		for (const slot of getWeekData(weekKey).slots) {
			if (slot.schedule) {
				out.push({ week_key: weekKey, weekday: slot.weekday, meal_type: slot.meal_type, schedule_id: slot.schedule.id });
			}
		}
	}
	return out;
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
	getDb().prepare(`
		DELETE FROM week_plans
		WHERE week_key = ? AND weekday = ? AND meal_type = ? AND slot_index = ? AND is_accompaniment = ?
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment);
}

export function hasManualEntry(weekKey: string, weekday: number, mealType: string, slotIndex: number, isAccompaniment: number): boolean {
	const row = getDb().prepare(`
		SELECT 1 FROM week_plans
		WHERE week_key = ? AND weekday = ? AND meal_type = ? AND slot_index = ? AND is_accompaniment = ?
		  AND recipe_id IS NOT NULL
	`).get(weekKey, weekday, mealType, slotIndex, isAccompaniment);
	return !!row;
}

export function clearWeek(weekKey: string, scope: 'week' | 'future' = 'week'): void {
	const db = getDb();
	if (scope === 'future') {
		db.prepare('DELETE FROM week_plans WHERE week_key >= ?').run(weekKey);
	} else {
		db.prepare('DELETE FROM week_plans WHERE week_key = ?').run(weekKey);
	}
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
