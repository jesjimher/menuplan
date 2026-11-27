// Migración 19: de «contador de platos + tags por posición» (meal_config) a huecos
// independientes con vigencia (meal_slots), y de week_plans.slot_index a week_plans.slot_id.
//
// Para cada comida (día + tipo) se reconstruye la línea temporal que veía la app: en cada
// semana regía la vigencia de meal_config con effective_from más reciente que la cubría, o
// las opciones globales si ninguna la cubría. Cada posición de esa configuración («plato i»,
// «acompañamiento a del plato i», «acompañamiento a de la comida») se convierte en un hueco;
// mientras la posición siga existiendo entre tramos consecutivos es el mismo hueco, y solo se
// abre una versión nueva si cambian sus tags.
//
// Recetas ocultas (en una posición que la configuración de su semana no pintaba):
//   - si esa configuración empezaba antes de su semana, el contador se bajó antes de llegar a
//     ella y nunca se cocinó: se borra;
//   - si empezaba justo esa semana, es ambiguo: se conserva en un hueco visible solo esa semana.
import type Database from 'better-sqlite3';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '../utils/dates.js';

interface LegacyConfig {
	id: number;
	weekday: number;
	meal_type: string;
	effective_from: string;
	effective_to: string | null;
	recipe_count: number;
	accompaniment_per_recipe: number;
	accompaniment_per_slot: number;
}

interface Capacity {
	recipe_count: number;
	accompaniment_per_recipe: number;
	accompaniment_per_slot: number;
}

interface LegacyPlan {
	id: number;
	week_key: string;
	weekday: number;
	meal_type: string;
	slot_index: number;
	is_accompaniment: number;
}

interface Lane {
	key: string;
	kind: 'main' | 'acc';
	position: number;
	/** Clave del carril del plato padre (acompañamientos «por receta»). */
	parentKey: string | null;
	tags: string;
}

interface ActiveLane {
	slotId: number;
	rowId: number;
	tags: string;
	parentSlotId: number | null;
}

interface Segment {
	fromIdx: number;
	/** Inclusive; null = sin final. */
	toIdx: number | null;
	config: LegacyConfig | null;
	capacity: Capacity;
	/** Carril → slot_id vigente en el tramo. */
	slotByLane: Map<string, number>;
}

const MEALS = ['comida', 'cena'] as const;

function tableExists(db: Database.Database, table: string): boolean {
	return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table);
}

function columnExists(db: Database.Database, table: string, col: string): boolean {
	return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(c => c.name === col);
}

function readDefaults(db: Database.Database): { comida: Capacity; cena: Capacity } {
	const rows = tableExists(db, 'options')
		? db.prepare('SELECT key, value FROM options').all() as { key: string; value: string }[]
		: [];
	const opt = new Map(rows.map(r => [r.key, parseInt(r.value)]));
	const num = (k: string, d: number) => (Number.isFinite(opt.get(k)) ? (opt.get(k) as number) : d);
	const acc = { accompaniment_per_recipe: num('side_dishes_per_recipe', 1), accompaniment_per_slot: num('side_dishes_per_slot', 0) };
	return {
		comida: { recipe_count: num('meals_per_day', 1), ...acc },
		cena: { recipe_count: num('dinners_per_day', 1), ...acc }
	};
}

function lanesFor(cap: Capacity, tags: string[][]): Lane[] {
	const lanes: Lane[] = [];
	for (let i = 0; i < cap.recipe_count; i++) {
		lanes.push({ key: `m:${i}`, kind: 'main', position: i, parentKey: null, tags: (tags[i] ?? []).join(',') });
		for (let a = 0; a < cap.accompaniment_per_recipe; a++) {
			lanes.push({ key: `r:${i}:${a}`, kind: 'acc', position: a, parentKey: `m:${i}`, tags: '' });
		}
	}
	for (let a = 0; a < cap.accompaniment_per_slot; a++) {
		lanes.push({ key: `w:${a}`, kind: 'acc', position: a, parentKey: null, tags: '' });
	}
	return lanes;
}

/** Carril en el que la rejilla antigua pintaba una fila de week_plans (null = oculta). */
function laneForPlan(cap: Capacity, plan: LegacyPlan): string | null {
	const k = plan.slot_index;
	if (!plan.is_accompaniment) return k < cap.recipe_count ? `m:${k}` : null;
	const apr = cap.accompaniment_per_recipe;
	if (apr > 0 && Math.floor(k / apr) < cap.recipe_count) return `r:${Math.floor(k / apr)}:${k % apr}`;
	if (k < cap.accompaniment_per_slot) return `w:${k}`;
	return null;
}

export function migrateToMealSlots(db: Database.Database): void {
	// Autosuficiente: en BD existente el SCHEMA base ya la crea, pero no en los tests de migraciones
	db.exec(`
		CREATE TABLE IF NOT EXISTS meal_slots (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			slot_id        INTEGER NOT NULL,
			weekday        INTEGER NOT NULL,
			meal_type      TEXT    NOT NULL,
			kind           TEXT    NOT NULL CHECK(kind IN ('main','acc')),
			parent_slot_id INTEGER DEFAULT NULL,
			effective_from TEXT    NOT NULL,
			effective_to   TEXT    DEFAULT NULL,
			position       INTEGER NOT NULL DEFAULT 0,
			tags           TEXT    NOT NULL DEFAULT ''
		);
	`);
	// La migración 20 borra parent_slot_id y el SCHEMA base ya no la crea; esta migración aún la usa
	if (!columnExists(db, 'meal_slots', 'parent_slot_id')) {
		db.exec('ALTER TABLE meal_slots ADD COLUMN parent_slot_id INTEGER DEFAULT NULL');
	}
	const hasPlansTable = tableExists(db, 'week_plans');
	const legacyPlans = columnExists(db, 'week_plans', 'slot_index');
	const hasSlots = (db.prepare('SELECT COUNT(*) AS n FROM meal_slots').get() as { n: number }).n > 0;
	if (!legacyPlans && hasSlots) {
		if (hasPlansTable) db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_week_plans_slot ON week_plans(week_key, slot_id)');
		return;
	}

	const defaults = readDefaults(db);
	const configs: LegacyConfig[] = tableExists(db, 'meal_config')
		? db.prepare('SELECT * FROM meal_config ORDER BY effective_from').all() as LegacyConfig[]
		: [];
	const tagsByConfig = new Map<number, string[][]>();
	if (tableExists(db, 'meal_config_required_tags')) {
		const rows = db.prepare('SELECT config_id, slot_index, tag FROM meal_config_required_tags ORDER BY rowid').all() as { config_id: number; slot_index: number; tag: string }[];
		for (const t of rows) {
			const list = tagsByConfig.get(t.config_id) ?? [];
			while (list.length <= t.slot_index) list.push([]);
			list[t.slot_index].push(t.tag);
			tagsByConfig.set(t.config_id, list);
		}
	}
	const plans: LegacyPlan[] = legacyPlans
		? db.prepare('SELECT id, week_key, weekday, meal_type, slot_index, is_accompaniment FROM week_plans').all() as LegacyPlan[]
		: [];
	const minAnchor = tableExists(db, 'schedules')
		? (db.prepare('SELECT MIN(anchor_week_key) AS w FROM schedules').get() as { w: string | null }).w
		: null;

	// Primera semana que hay que cubrir: la más antigua con datos (o la actual)
	const candidates = [weekKeyToIndex(getWeekKey())];
	for (const p of plans) candidates.push(weekKeyToIndex(p.week_key));
	for (const c of configs) candidates.push(weekKeyToIndex(c.effective_from));
	if (minAnchor) candidates.push(weekKeyToIndex(minAnchor));
	const startIdx = Math.min(...candidates);

	const insertSlot = db.prepare(`
		INSERT INTO meal_slots (slot_id, weekday, meal_type, kind, parent_slot_id, effective_from, effective_to, position, tags)
		VALUES (0, ?, ?, ?, ?, ?, NULL, ?, ?)
	`);
	const setSlotId = db.prepare('UPDATE meal_slots SET slot_id = ? WHERE id = ?');
	const insertVersion = db.prepare(`
		INSERT INTO meal_slots (slot_id, weekday, meal_type, kind, parent_slot_id, effective_from, effective_to, position, tags)
		VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
	`);
	const closeRow = db.prepare('UPDATE meal_slots SET effective_to = ? WHERE id = ?');
	const insertSingleWeek = db.prepare(`
		INSERT INTO meal_slots (slot_id, weekday, meal_type, kind, parent_slot_id, effective_from, effective_to, position, tags)
		VALUES (0, ?, ?, ?, NULL, ?, ?, ?, '')
	`);

	const segmentsByMeal = new Map<string, Segment[]>();

	for (let weekday = 1; weekday <= 7; weekday++) {
		for (const meal of MEALS) {
			const cfgs = configs.filter(c => c.weekday === weekday && c.meal_type === meal);
			const covering = (idx: number): LegacyConfig | null => {
				let best: LegacyConfig | null = null;
				for (const c of cfgs) {
					const from = weekKeyToIndex(c.effective_from);
					const to = c.effective_to === null ? Infinity : weekKeyToIndex(c.effective_to);
					if (from <= idx && idx <= to && (!best || c.effective_from > best.effective_from)) best = c;
				}
				return best;
			};

			// Puntos donde puede cambiar la configuración vigente
			const points = new Set<number>([startIdx]);
			for (const c of cfgs) {
				points.add(weekKeyToIndex(c.effective_from));
				if (c.effective_to !== null) points.add(weekKeyToIndex(c.effective_to) + 1);
			}
			const sorted = [...points].filter(p => p >= startIdx).sort((a, b) => a - b);

			// Tramos consecutivos con la misma configuración se fusionan
			const segments: Segment[] = [];
			for (let i = 0; i < sorted.length; i++) {
				const fromIdx = sorted[i];
				const toIdx = i + 1 < sorted.length ? sorted[i + 1] - 1 : null;
				const config = covering(fromIdx);
				const last = segments[segments.length - 1];
				if (last && (last.config?.id ?? null) === (config?.id ?? null)) {
					last.toIdx = toIdx;
					continue;
				}
				segments.push({ fromIdx, toIdx, config, capacity: config ?? defaults[meal], slotByLane: new Map() });
			}

			// Recorrer los tramos abriendo, continuando o cerrando huecos
			const active = new Map<string, ActiveLane>();
			for (const seg of segments) {
				const fromKey = indexToWeekKey(seg.fromIdx);
				const prevKey = indexToWeekKey(seg.fromIdx - 1);
				const lanes = lanesFor(seg.capacity, seg.config ? (tagsByConfig.get(seg.config.id) ?? []) : []);
				const present = new Set(lanes.map(l => l.key));

				for (const [key, a] of active) {
					if (!present.has(key)) { closeRow.run(prevKey, a.rowId); active.delete(key); }
				}
				// Los platos van antes que sus acompañamientos (lanesFor ya los ordena así)
				for (const lane of lanes) {
					const parentSlotId = lane.parentKey ? seg.slotByLane.get(lane.parentKey) ?? null : null;
					const cur = active.get(lane.key);
					if (cur && cur.parentSlotId === parentSlotId) {
						if (cur.tags !== lane.tags) {
							closeRow.run(prevKey, cur.rowId);
							const rowId = insertVersion.run(cur.slotId, weekday, meal, lane.kind, parentSlotId, fromKey, lane.position, lane.tags).lastInsertRowid as number;
							active.set(lane.key, { ...cur, rowId, tags: lane.tags });
						}
						seg.slotByLane.set(lane.key, cur.slotId);
						continue;
					}
					if (cur) closeRow.run(prevKey, cur.rowId);
					const rowId = insertSlot.run(weekday, meal, lane.kind, parentSlotId, fromKey, lane.position, lane.tags).lastInsertRowid as number;
					setSlotId.run(rowId, rowId);
					active.set(lane.key, { slotId: rowId, rowId, tags: lane.tags, parentSlotId });
					seg.slotByLane.set(lane.key, rowId);
				}
			}
			segmentsByMeal.set(`${weekday}-${meal}`, segments);
		}
	}

	if (legacyPlans) {
		if (!columnExists(db, 'week_plans', 'slot_id')) db.exec('ALTER TABLE week_plans ADD COLUMN slot_id INTEGER NOT NULL DEFAULT 0');
		if (!columnExists(db, 'week_plans', 'schedule_id')) db.exec('ALTER TABLE week_plans ADD COLUMN schedule_id INTEGER DEFAULT NULL');

		const setPlanSlot = db.prepare('UPDATE week_plans SET slot_id = ? WHERE id = ?');
		const deletePlan = db.prepare('DELETE FROM week_plans WHERE id = ?');
		let mapped = 0, kept = 0, removed = 0;
		// Posición de los huecos de una sola semana creados para recetas ocultas: tras los demás
		let extraPosition = 1000;

		for (const plan of plans) {
			const idx = weekKeyToIndex(plan.week_key);
			const seg = (segmentsByMeal.get(`${plan.weekday}-${plan.meal_type}`) ?? [])
				.find(s => s.fromIdx <= idx && (s.toIdx === null || idx <= s.toIdx));
			const lane = seg ? laneForPlan(seg.capacity, plan) : null;
			const slotId = lane ? seg!.slotByLane.get(lane) : undefined;
			if (slotId !== undefined) {
				setPlanSlot.run(slotId, plan.id);
				mapped++;
			} else if (seg?.config && seg.config.effective_from === plan.week_key) {
				const rowId = insertSingleWeek.run(
					plan.weekday, plan.meal_type, plan.is_accompaniment ? 'acc' : 'main',
					plan.week_key, plan.week_key, extraPosition++
				).lastInsertRowid as number;
				setSlotId.run(rowId, rowId);
				setPlanSlot.run(rowId, plan.id);
				kept++;
			} else {
				deletePlan.run(plan.id);
				removed++;
			}
		}

		db.exec(`
			DROP INDEX IF EXISTS idx_week_plans_unique;
			ALTER TABLE week_plans DROP COLUMN slot_index;
		`);
		if (kept || removed) {
			console.log(`[migración 19] recetas ocultas: ${kept} conservadas en un hueco de una sola semana, ${removed} borradas (de ${plans.length}; ${mapped} asignadas a su hueco)`);
		}
	}

	if (hasPlansTable) db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_week_plans_slot ON week_plans(week_key, slot_id)');
	db.exec(`
		DROP TABLE IF EXISTS meal_config_required_tags;
		DROP TABLE IF EXISTS meal_config;
	`);
}
