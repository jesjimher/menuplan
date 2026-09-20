import { getDb } from '$lib/db/index.js';
import type { WeekPlan, MealConfigRow, WeekMealState, MealConfig, Options, SlotData, DayConfig, WeekData, ScheduleWithRecipe, MealType } from '$lib/types/index.js';
import { getAllRules } from './rules.js';
import { checkRules } from '$lib/utils/ruleChecker.js';
import { getOptions } from './options.js';
import { getActiveSchedulesForWeek } from './schedules.js';
import { getWeekKey, weekKeyToIndex } from '$lib/utils/dates.js';
import { maxSlots } from '$lib/utils/mealCapacity.js';
import type Database from 'better-sqlite3';

interface WeekPlanRow {
	id: number; week_key: string; weekday: number; meal_type: MealType;
	slot_index: number; is_accompaniment: number; is_leftover: number;
	recipe_id: number;
	r_id: number | null; name: string | null; description: string | null;
	tags: string | null; min_days: number | null; image_type: string | null; created_at: string | null;
}

type MealCapacity = Pick<MealConfigRow, 'recipe_count' | 'accompaniment_per_recipe' | 'accompaniment_per_slot'>;

function defaultCapacity(options: Options, mealType: string): MealCapacity {
	return {
		recipe_count: mealType === 'comida' ? options.meals_per_day : options.dinners_per_day,
		accompaniment_per_recipe: options.side_dishes_per_recipe,
		accompaniment_per_slot: options.side_dishes_per_slot
	};
}

// Vigencia de meal_config que cubre una semana: desde <= semana y (sin límite o hasta >= semana).
// Si hay varias (un override de una semana pasada solapa con una vigencia anterior sin límite),
// gana la de effective_from más reciente.
const COVERS_WEEK = 'c.effective_from <= ? AND (c.effective_to IS NULL OR c.effective_to >= ?)';

// Crea (o devuelve) la vigencia que empieza exactamente en `weekKey` para esa comida, heredando
// capacidad y tags exigidos de la que rige hasta entonces (o de las opciones globales).
// Desde la semana actual en adelante la vigencia no tiene límite (se propaga al futuro); editar
// una semana pasada solo la afecta a ella.
function ensureMealConfig(db: Database.Database, weekKey: string, weekday: number, mealType: string): number {
	const exact = db.prepare(
		'SELECT id FROM meal_config WHERE weekday = ? AND meal_type = ? AND effective_from = ?'
	).get(weekday, mealType, weekKey) as { id: number } | undefined;
	if (exact) return exact.id;

	const inherited = db.prepare(`
		SELECT c.* FROM meal_config c
		WHERE c.weekday = ? AND c.meal_type = ? AND ${COVERS_WEEK}
		ORDER BY c.effective_from DESC LIMIT 1
	`).get(weekday, mealType, weekKey, weekKey) as MealConfigRow | undefined;
	const capacity = inherited ?? defaultCapacity(getOptions(), mealType);

	const isFutureOrNow = weekKeyToIndex(weekKey) >= weekKeyToIndex(getWeekKey());
	const id = db.prepare(`
		INSERT INTO meal_config (weekday, meal_type, effective_from, effective_to, recipe_count, accompaniment_per_recipe, accompaniment_per_slot)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`).run(
		weekday, mealType, weekKey, isFutureOrNow ? null : weekKey,
		capacity.recipe_count, capacity.accompaniment_per_recipe, capacity.accompaniment_per_slot
	).lastInsertRowid as number;

	if (inherited) {
		db.prepare(`
			INSERT INTO meal_config_required_tags (config_id, slot_index, tag)
			SELECT ?, slot_index, tag FROM meal_config_required_tags WHERE config_id = ? ORDER BY rowid
		`).run(id, inherited.id);
	}
	return id;
}

export function getWeekData(weekKey: string): WeekData {
	const db = getDb();

	const plans = db.prepare(`
		SELECT wp.*, r.id as r_id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at
		FROM week_plans wp
		JOIN recipes r ON r.id = wp.recipe_id
		WHERE wp.week_key = ?
		ORDER BY wp.weekday, wp.meal_type, wp.is_accompaniment, wp.slot_index
	`).all(weekKey) as WeekPlanRow[];

	// Configuración por día/comida (necesaria antes de solapar programaciones, para
	// conocer la capacidad real de cada comida tal y como se pinta en la rejilla)
	const options = getOptions();
	const configRows = db.prepare(`
		SELECT c.* FROM meal_config c WHERE ${COVERS_WEEK} ORDER BY c.effective_from ASC
	`).all(weekKey, weekKey) as MealConfigRow[];
	const tagRows = db.prepare(`
		SELECT t.config_id, t.slot_index, t.tag
		FROM meal_config_required_tags t
		JOIN meal_config c ON c.id = t.config_id
		WHERE ${COVERS_WEEK}
		ORDER BY t.rowid
	`).all(weekKey, weekKey) as { config_id: number; slot_index: number; tag: string }[];
	const stateRows = db.prepare(
		'SELECT * FROM week_meal_state WHERE week_key = ?'
	).all(weekKey) as WeekMealState[];

	// Orden ASC + sobrescritura: la vigencia con effective_from más reciente gana
	const configByMeal = new Map<string, MealConfigRow>();
	for (const c of configRows) configByMeal.set(`${c.weekday}-${c.meal_type}`, c);
	const tagsByConfig = new Map<number, string[][]>();
	for (const t of tagRows) {
		const slots = tagsByConfig.get(t.config_id) ?? [];
		while (slots.length <= t.slot_index) slots.push([]);
		slots[t.slot_index].push(t.tag);
		tagsByConfig.set(t.config_id, slots);
	}
	const stateByMeal = new Map<string, WeekMealState>();
	for (const st of stateRows) stateByMeal.set(`${st.weekday}-${st.meal_type}`, st);

	const configs: Record<number, DayConfig> = {};
	for (let d = 1; d <= 7; d++) {
		const build = (meal: MealType): MealConfig => {
			const key = `${d}-${meal}`;
			const cfg = configByMeal.get(key);
			const state = stateByMeal.get(key);
			const capacity = cfg ?? defaultCapacity(options, meal);
			return {
				recipe_count: capacity.recipe_count,
				accompaniment_per_recipe: capacity.accompaniment_per_recipe,
				accompaniment_per_slot: capacity.accompaniment_per_slot,
				required_tags: cfg ? (tagsByConfig.get(cfg.id) ?? []) : [],
				disabled: !!state?.disabled,
				disabled_comment: state?.disabled_comment ?? null,
				note: state?.note ?? null
			};
		};
		configs[d] = { comida: build('comida'), cena: build('cena') };
	}

	// Programaciones activas para esta semana (ya ordenadas por priority DESC, id ASC)
	const activeSchedules = getActiveSchedulesForWeek(weekKey);

	// Construir slots manuales desde week_plans
	const manualSlots: SlotData[] = plans
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
			schedule: null as ScheduleWithRecipe | null
		}));

	// Agrupar slots manuales por comida: "wd-mt-ia" → SlotData[]
	const mealKey = (wd: number, mt: string, ia: number) => `${wd}-${mt}-${ia}`;
	const mealSlots = new Map<string, SlotData[]>();
	// Huecos genuinamente manuales (fila real en week_plans) por comida: una programación
	// nunca puede sustituir lo que haya aquí, sea cual sea su on_conflict.
	const manualOccupied = new Map<string, Set<number>>();
	for (const slot of manualSlots) {
		const key = mealKey(slot.weekday, slot.meal_type, slot.is_accompaniment);
		const arr = mealSlots.get(key) ?? [];
		arr.push(slot);
		mealSlots.set(key, arr);
		const occ = manualOccupied.get(key) ?? new Set<number>();
		occ.add(slot.slot_index);
		manualOccupied.set(key, occ);
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

		// Calcular capacidad máxima de la comida, igual que la ve la rejilla (MealCell):
		// los acompañamientos comparten espacio de índices entre "por receta" y "por franja".
		const cfg = configs[sched.weekday][sched.meal_type as MealType];
		const capacity = maxSlots(cfg, sched.is_accompaniment === 1);

		// Encontrar el primer slot_index libre (no ocupado por entrada manual)
		const occupied = new Set(mealArr.map(s => s.slot_index));
		let freeSlot = -1;
		for (let i = 0; i < capacity; i++) {
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
				schedule: sched
			};
			mealArr.push(newSlot);
			mealSlots.set(key, mealArr);
		} else if (sched.on_conflict === 'overwrite') {
			// Sobreescribir slot_index 0, salvo que sea una receta puesta a mano: una
			// programación nunca desplaza una elección manual, solo a otra programación
			// de menor prioridad que ya estuviera materializada ahí.
			const idx0 = mealArr.findIndex(s => s.slot_index === 0);
			const isManual = manualOccupied.get(key)?.has(0) ?? false;
			if (idx0 >= 0 && !isManual) {
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
				schedule: sched
			});
		}
		// on_conflict === 'skip': no hacer nada si la comida está llena
	}

	const allManual = [...mealSlots.values()].flat();
	const slots: SlotData[] = [...allManual, ...virtualSlots]
		.sort((a, b) => a.weekday - b.weekday || a.meal_type.localeCompare(b.meal_type) || a.is_accompaniment - b.is_accompaniment || a.slot_index - b.slot_index);

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

export function assignRecipe(weekKey: string, weekday: number, mealType: string, slotIndex: number, isAccompaniment: number, recipeId: number, isLeftover = 0): void {
	const db = getDb();
	db.prepare(`
		INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(week_key, weekday, meal_type, is_accompaniment, slot_index)
		DO UPDATE SET recipe_id = excluded.recipe_id, is_leftover = excluded.is_leftover
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment, isLeftover, recipeId);
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
			INSERT OR IGNORE INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const plan of plans) {
			insertPlan.run(weekKey, plan.weekday, plan.meal_type, plan.slot_index, plan.is_accompaniment, plan.is_leftover ?? 0, plan.recipe_id);
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
	db.transaction(() => {
		const configId = ensureMealConfig(db, weekKey, weekday, mealType);
		db.prepare('DELETE FROM meal_config_required_tags WHERE config_id = ? AND slot_index = ?').run(configId, slotIndex);
		const insert = db.prepare('INSERT OR IGNORE INTO meal_config_required_tags (config_id, slot_index, tag) VALUES (?, ?, ?)');
		for (const tag of tags) if (tag) insert.run(configId, slotIndex, tag);
	})();
}

export interface DayConfigPatch {
	recipe_count?: number;
	accompaniment_per_recipe?: number;
	accompaniment_per_slot?: number;
	disabled?: boolean;
	disabled_comment?: string | null;
	note?: string | null;
}

export function updateDayConfig(weekKey: string, weekday: number, mealType: string, config: DayConfigPatch): void {
	const db = getDb();
	db.transaction(() => {
		// Capacidad: vigencia que se propaga hacia el futuro (ver ensureMealConfig)
		if (config.recipe_count !== undefined || config.accompaniment_per_recipe !== undefined || config.accompaniment_per_slot !== undefined) {
			const configId = ensureMealConfig(db, weekKey, weekday, mealType);
			db.prepare(`
				UPDATE meal_config SET
					recipe_count = COALESCE(?, recipe_count),
					accompaniment_per_recipe = COALESCE(?, accompaniment_per_recipe),
					accompaniment_per_slot = COALESCE(?, accompaniment_per_slot)
				WHERE id = ?
			`).run(config.recipe_count ?? null, config.accompaniment_per_recipe ?? null, config.accompaniment_per_slot ?? null, configId);
		}

		// Estado puntual de esta semana (sin herencia); la fila se elimina si vuelve a los valores por defecto
		if ('disabled' in config || 'disabled_comment' in config || 'note' in config) {
			const existing = db.prepare(
				'SELECT * FROM week_meal_state WHERE week_key = ? AND weekday = ? AND meal_type = ?'
			).get(weekKey, weekday, mealType) as WeekMealState | undefined;
			const disabled = 'disabled' in config ? (config.disabled ? 1 : 0) : (existing?.disabled ?? 0);
			const comment = 'disabled_comment' in config ? config.disabled_comment ?? null : existing?.disabled_comment ?? null;
			const note = 'note' in config ? config.note ?? null : existing?.note ?? null;

			if (!disabled && comment === null && note === null) {
				db.prepare('DELETE FROM week_meal_state WHERE week_key = ? AND weekday = ? AND meal_type = ?').run(weekKey, weekday, mealType);
			} else {
				db.prepare(`
					INSERT INTO week_meal_state (week_key, weekday, meal_type, disabled, disabled_comment, note)
					VALUES (?, ?, ?, ?, ?, ?)
					ON CONFLICT(week_key, weekday, meal_type)
					DO UPDATE SET disabled = excluded.disabled, disabled_comment = excluded.disabled_comment, note = excluded.note
				`).run(weekKey, weekday, mealType, disabled, comment, note);
			}
		}
	})();
}
