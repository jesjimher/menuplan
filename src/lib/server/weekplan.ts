import { getDb } from '$lib/db/index.js';
import type { WeekPlan, WeekMealState, MealConfig, MealSlot, SlotData, DayConfig, WeekData, ScheduleWithRecipe, MealType } from '$lib/types/index.js';
import { getAllRules } from './rules.js';
import { checkRules } from '$lib/utils/ruleChecker.js';
import { getActivePeople, loadPeopleLinks, setPeopleLinks } from './people.js';
import { getActiveSchedulesForWeek } from './schedules.js';
import { getSlotRowsForWeek, getSlotVersion, resolveSlotId } from './mealSlots.js';
import { getConsolidatedThrough, isDayConsolidated } from './consolidationMark.js';
import { parseTags } from '$lib/utils/parseTags.js';

interface WeekPlanRow {
	id: number; week_key: string; weekday: number; meal_type: MealType;
	slot_id: number; is_accompaniment: number; is_leftover: number;
	recipe_id: number; schedule_id: number | null;
	r_id: number | null; name: string | null; description: string | null;
	tags: string | null; min_days: number | null; image_type: string | null; created_at: string | null;
}

/**
 * Orden en que una programación prueba los huecos de su tipo: primero los que tienen tags y la
 * receta los cumple, luego los que no tienen tags y por último los que la receta no cumple.
 */
function rankForSchedule(slots: MealSlot[], recipeTags: string): MealSlot[] {
	const tags = parseTags(recipeTags);
	const tagRank = (s: MealSlot) => s.tags.length === 0 ? 1 : s.tags.every(t => tags.includes(t)) ? 0 : 2;
	return [...slots].sort((a, b) => tagRank(a) - tagRank(b) || a.position - b.position || a.id - b.id);
}

export function getWeekData(weekKey: string): WeekData {
	const db = getDb();

	const plans = db.prepare(`
		SELECT wp.*, r.id as r_id, r.name, r.description, r.tags, r.min_days, r.image_type, r.created_at
		FROM week_plans wp
		JOIN recipes r ON r.id = wp.recipe_id
		WHERE wp.week_key = ?
	`).all(weekKey) as WeekPlanRow[];

	const stateRows = db.prepare('SELECT * FROM week_meal_state WHERE week_key = ?').all(weekKey) as WeekMealState[];
	const stateByMeal = new Map<string, WeekMealState>();
	for (const st of stateRows) stateByMeal.set(`${st.weekday}-${st.meal_type}`, st);

	// Huecos vigentes por comida
	const slotRows = getSlotRowsForWeek(weekKey);
	const slotsByMeal = new Map<string, MealSlot[]>();
	for (const r of slotRows) {
		const key = `${r.weekday}-${r.meal_type}`;
		const list = slotsByMeal.get(key) ?? [];
		list.push({
			id: r.slot_id,
			kind: r.kind,
			position: r.position,
			tags: parseTags(r.tags)
		});
		slotsByMeal.set(key, list);
	}

	const configs: Record<number, DayConfig> = {};
	for (let d = 1; d <= 7; d++) {
		const build = (meal: MealType): MealConfig => {
			const key = `${d}-${meal}`;
			const state = stateByMeal.get(key);
			return {
				slots: slotsByMeal.get(key) ?? [],
				disabled: !!state?.disabled,
				disabled_comment: state?.disabled_comment ?? null,
				note: state?.note ?? null
			};
		};
		configs[d] = { comida: build('comida'), cena: build('cena') };
	}

	// Recetas guardadas (manuales o consolidadas) por hueco
	const peopleByPlan = loadPeopleLinks('week_plan_people', plans.map(p => p.id));
	const bySlot = new Map<number, SlotData>();
	for (const p of plans) {
		bySlot.set(p.slot_id, {
			weekday: p.weekday,
			meal_type: p.meal_type,
			slot_id: p.slot_id,
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
			schedule: null as ScheduleWithRecipe | null,
			people: peopleByPlan.get(p.id) ?? [],
			origin_schedule_id: p.schedule_id ?? null
		});
	}
	// Una programación nunca puede sustituir lo que haya en una fila real de week_plans
	const manualIds = new Set(bySlot.keys());

	// Programaciones activas (ya ordenadas por priority DESC, id ASC). Los días consolidados
	// no las resuelven: lo que tengan en week_plans es definitivo.
	const mark = getConsolidatedThrough();
	for (const sched of getActiveSchedulesForWeek(weekKey)) {
		if (isDayConsolidated(weekKey, sched.weekday, mark)) continue;
		const cfg = configs[sched.weekday][sched.meal_type as MealType];
		const kind = sched.is_accompaniment ? 'acc' : 'main';
		const inMeal = (s: SlotData) => s.weekday === sched.weekday && s.meal_type === sched.meal_type && s.is_accompaniment === sched.is_accompaniment;

		// Si la receta ya está en esta comida, solo se marca como programada
		const existing = [...bySlot.values()].find(s => inMeal(s) && s.recipe?.id === sched.recipe_id);
		if (existing) {
			if (!existing.schedule) bySlot.set(existing.slot_id, { ...existing, schedule: sched });
			continue;
		}

		const placed = (slotId: number): SlotData => ({
			weekday: sched.weekday,
			meal_type: sched.meal_type,
			slot_id: slotId,
			is_accompaniment: sched.is_accompaniment,
			is_leftover: 0,
			recipe: sched.recipe,
			schedule: sched,
			people: sched.people,
			origin_schedule_id: null
		});

		const ranked = rankForSchedule(cfg.slots.filter(s => s.kind === kind && !s.virtual), sched.recipe.tags);
		const free = ranked.find(s => !bySlot.has(s.id));
		if (free) {
			bySlot.set(free.id, placed(free.id));
		} else if (sched.on_conflict === 'overwrite') {
			// Solo desplaza a otra programación de menor prioridad, nunca una receta guardada
			const target = ranked.find(s => !manualIds.has(s.id));
			if (target) bySlot.set(target.id, placed(target.id));
		} else if (sched.on_conflict === 'add') {
			// Hueco extra solo esta semana, detrás de los demás de su tipo
			const id = -sched.id;
			const maxPos = cfg.slots.filter(s => s.kind === kind).reduce((m, s) => Math.max(m, s.position), -1);
			cfg.slots = [...cfg.slots, { id, kind, position: maxPos + 1, tags: [], virtual: true }];
			bySlot.set(id, placed(id));
		}
		// on_conflict === 'skip': no hacer nada si la comida está llena
	}

	for (const d of Object.values(configs)) {
		for (const cfg of [d.comida, d.cena]) cfg.slots.sort((a, b) => a.position - b.position || a.id - b.id);
	}

	const order = new Map<number, number>();
	for (const d of Object.values(configs)) for (const cfg of [d.comida, d.cena]) cfg.slots.forEach((s, i) => order.set(s.id, i));
	const slots: SlotData[] = [...bySlot.values()]
		.sort((a, b) => a.weekday - b.weekday || a.meal_type.localeCompare(b.meal_type) || a.is_accompaniment - b.is_accompaniment
			|| (order.get(a.slot_id) ?? 0) - (order.get(b.slot_id) ?? 0));

	const rules = getAllRules();
	const people = getActivePeople();
	const violations = checkRules(slots, rules, people);

	return { week_key: weekKey, slots, configs, violations, people };
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

/**
 * Pone una receta en un hueco y devuelve el slot_id real (un hueco virtual de una programación
 * «add» se materializa como hueco de una sola semana). `people` sustituye para quién es (vacío =
 * para todos); omitido, el hueco conserva las personas que ya tuviera. `scheduleId` anota de qué
 * programación sale la receta (al consolidar); una asignación normal lo deja a null.
 */
export function assignRecipe(weekKey: string, slotId: number, recipeId: number, isLeftover = 0, people?: number[], scheduleId: number | null = null): number {
	const db = getDb();
	return db.transaction(() => {
		const realId = resolveSlotId(weekKey, slotId);
		const slot = getSlotVersion(realId, weekKey);
		if (!slot) throw new Error(`El hueco ${realId} no existe en la semana ${weekKey}`);
		const { id } = db.prepare(`
			INSERT INTO week_plans (week_key, weekday, meal_type, slot_id, is_accompaniment, is_leftover, recipe_id, schedule_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(week_key, slot_id)
			DO UPDATE SET recipe_id = excluded.recipe_id, is_leftover = excluded.is_leftover, schedule_id = excluded.schedule_id
			RETURNING id
		`).get(weekKey, slot.weekday, slot.meal_type, realId, slot.kind === 'acc' ? 1 : 0, isLeftover, recipeId, scheduleId) as { id: number };
		if (people) setPeopleLinks('week_plan_people', id, people);
		return realId;
	})();
}

export function getPlanRow(weekKey: string, slotId: number): WeekPlan | undefined {
	return getDb().prepare('SELECT * FROM week_plans WHERE week_key = ? AND slot_id = ?').get(weekKey, slotId) as WeekPlan | undefined;
}

/**
 * Cambia para quién es la receta de un hueco. Si el hueco no tiene fila propia (la receta
 * viene de una programación), se materializa con esa receta para guardar las personas solo
 * en esta semana. Devuelve el slot_id real.
 */
export function setSlotPeople(weekKey: string, slotId: number, recipeId: number, people: number[]): number {
	const db = getDb();
	const row = slotId >= 0 ? getPlanRow(weekKey, slotId) : undefined;
	if (row) {
		db.transaction(() => setPeopleLinks('week_plan_people', row.id, people))();
		return slotId;
	}
	return assignRecipe(weekKey, slotId, recipeId, 0, people);
}

export function removeRecipe(weekKey: string, slotId: number): void {
	getDb().prepare('DELETE FROM week_plans WHERE week_key = ? AND slot_id = ?').run(weekKey, slotId);
}

export function hasManualEntry(weekKey: string, slotId: number): boolean {
	return !!getPlanRow(weekKey, slotId);
}

export function clearWeek(weekKey: string, scope: 'week' | 'future' = 'week'): void {
	const db = getDb();
	if (scope === 'future') {
		db.prepare('DELETE FROM week_plans WHERE week_key >= ?').run(weekKey);
	} else {
		db.prepare('DELETE FROM week_plans WHERE week_key = ?').run(weekKey);
	}
}

/**
 * Copia las recetas de la semana anterior. Cada una va a su mismo hueco si existe en las dos
 * semanas; si no, al primer hueco libre del mismo tipo en esa comida; si no queda ninguno, se descarta.
 */
export function copyPreviousWeek(weekKey: string, previousWeekKey: string): void {
	const db = getDb();

	db.transaction(() => {
		db.prepare('DELETE FROM week_plans WHERE week_key = ?').run(weekKey);

		const plans = db.prepare('SELECT * FROM week_plans WHERE week_key = ?').all(previousWeekKey) as WeekPlan[];
		const peopleByPlan = loadPeopleLinks('week_plan_people', plans.map(p => p.id));
		const target = getSlotRowsForWeek(weekKey);
		const vigentes = new Set(target.map(s => s.slot_id));
		const used = new Set<number>();
		const destination = new Map<number, number>(); // plan.id → slot_id

		// Primero los que mantienen su hueco, para que ningún sustituto se lo quite
		for (const plan of plans) {
			if (vigentes.has(plan.slot_id)) { destination.set(plan.id, plan.slot_id); used.add(plan.slot_id); }
		}
		for (const plan of plans) {
			if (destination.has(plan.id)) continue;
			const kind = plan.is_accompaniment ? 'acc' : 'main';
			const free = target.find(s => s.weekday === plan.weekday && s.meal_type === plan.meal_type && s.kind === kind && !used.has(s.slot_id));
			if (free) { destination.set(plan.id, free.slot_id); used.add(free.slot_id); }
		}

		const insertPlan = db.prepare(`
			INSERT INTO week_plans (week_key, weekday, meal_type, slot_id, is_accompaniment, is_leftover, recipe_id)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		for (const plan of plans) {
			const slotId = destination.get(plan.id);
			if (slotId === undefined) continue;
			const res = insertPlan.run(weekKey, plan.weekday, plan.meal_type, slotId, plan.is_accompaniment, plan.is_leftover ?? 0, plan.recipe_id);
			const people = peopleByPlan.get(plan.id);
			if (people) setPeopleLinks('week_plan_people', res.lastInsertRowid as number, people);
		}
	})();
}

export function getHistory(): string[] {
	const db = getDb();
	const rows = db.prepare('SELECT DISTINCT week_key FROM week_plans ORDER BY week_key DESC').all() as { week_key: string }[];
	return rows.map(r => r.week_key);
}

export interface DayConfigPatch {
	disabled?: boolean;
	disabled_comment?: string | null;
	note?: string | null;
}

/** Estado puntual de una comida en una semana (sin herencia); la fila desaparece si vuelve a los valores por defecto. */
export function updateDayConfig(weekKey: string, weekday: number, mealType: string, config: DayConfigPatch): void {
	const db = getDb();
	db.transaction(() => {
		if (!('disabled' in config || 'disabled_comment' in config || 'note' in config)) return;
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
	})();
}
