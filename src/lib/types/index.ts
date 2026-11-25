export type MealType = 'comida' | 'cena';
export const MEAL_TYPES: readonly MealType[] = ['comida', 'cena'] as const;

export interface Recipe {
	id: number;
	name: string;
	description: string;
	tags: string;
	min_days: number;
	image_type: string | null;
	created_at: string;
}

export interface Person {
	id: number;
	name: string;
	sort_order: number;
	archived: number;
	image_type: string | null;
	created_at: string;
}

export interface Rule {
	id: number;
	tag: string;
	direction: 'at_least' | 'no_more_than';
	times: number;
	/** Personas a las que se limita la regla; vacío = se aplica a cada persona por separado. */
	people: number[];
}

export interface WeekPlan {
	id: number;
	week_key: string;
	weekday: number;
	meal_type: MealType;
	slot_id: number;
	is_accompaniment: number;
	is_leftover: number;
	recipe_id: number;
	/** Programación de la que viene la receta (al consolidar un día pasado), o null. */
	schedule_id: number | null;
}

export type MealSlotKind = 'main' | 'acc';

// Versión de un hueco (meal_slots): `slot_id` es la identidad del hueco, común a todas sus
// versiones; cada fila cubre [effective_from, effective_to] (NULL = sin final).
export interface MealSlotRow {
	id: number;
	slot_id: number;
	weekday: number;
	meal_type: MealType;
	kind: MealSlotKind;
	parent_slot_id: number | null;
	effective_from: string;
	effective_to: string | null;
	position: number;
	tags: string;
}

// Hueco tal y como rige en una semana concreta.
export interface MealSlot {
	/** slot_id (identidad del hueco). Negativo = hueco virtual de una programación «add». */
	id: number;
	kind: MealSlotKind;
	/** Plato del que cuelga un acompañamiento; null = acompañamiento de toda la comida. */
	parent_id: number | null;
	position: number;
	tags: string[];
	/** Hueco que solo existe esta semana porque lo añade una programación (on_conflict='add'). */
	virtual?: boolean;
}

// Estado puntual de una comida en una semana concreta (sin herencia).
export interface WeekMealState {
	week_key: string;
	weekday: number;
	meal_type: MealType;
	disabled: number;
	disabled_comment: string | null;
	note: string | null;
}

export interface Options {
	default_min_days: number;
	meals_per_day: number;
	dinners_per_day: number;
	side_dishes_per_recipe: number;
	side_dishes_per_slot: number;
	sidebar_collapsed_by_default: boolean;
}

export type ScheduleConflictMode = 'skip' | 'overwrite' | 'add';

export interface Schedule {
	id: number;
	recipe_id: number;
	weekday: number;
	meal_type: MealType;
	is_accompaniment: number;
	every_n_weeks: number;
	anchor_week_key: string;
	on_conflict: ScheduleConflictMode;
	priority: number;
	created_at: string;
	/** Para quién es la receta programada; vacío = para todos. */
	people: number[];
}

export interface ScheduleWithRecipe extends Schedule {
	recipe: Recipe;
	exceptions: string[];
}

export interface SlotData {
	weekday: number;
	meal_type: MealType;
	slot_id: number;
	is_accompaniment: number;
	is_leftover: 0 | 1;
	recipe: Recipe | null;
	schedule: ScheduleWithRecipe | null;
	/** Para quién es esta receta; vacío = para todos. */
	people: number[];
	/** Programación de la que salió una receta ya consolidada (día pasado), o null. */
	origin_schedule_id?: number | null;
}

export interface MealConfig {
	/** Huecos vigentes esa semana: platos y acompañamientos, ordenados por posición. */
	slots: MealSlot[];
	disabled: boolean;
	disabled_comment: string | null;
	note: string | null;
}

export interface DayConfig {
	comida: MealConfig;
	cena: MealConfig;
}

export interface WeekData {
	week_key: string;
	slots: SlotData[];
	configs: Record<number, DayConfig>;
	violations: RuleViolation[];
	/** Personas activas (no archivadas), en orden de visualización. */
	people: Person[];
}

export interface RuleViolation {
	rule: Rule;
	current: number;
	message: string;
	/** Personas que incumplen la regla; vacío = sin personas dadas de alta (cuenta global). */
	people: number[];
}
