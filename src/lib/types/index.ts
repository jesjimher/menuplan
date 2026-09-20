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

export interface Rule {
	id: number;
	tag: string;
	direction: 'at_least' | 'no_more_than';
	times: number;
}

export interface WeekPlan {
	id: number;
	week_key: string;
	weekday: number;
	meal_type: MealType;
	slot_index: number;
	is_accompaniment: number;
	is_leftover: number;
	recipe_id: number;
}

// Capacidad de una comida (día+tipo) a partir de `effective_from`. `effective_to` NULL = sin
// límite; igual a `effective_from` = override de una sola semana (edición de una semana pasada).
// Si varias vigencias cubren una semana, gana la de `effective_from` más reciente.
export interface MealConfigRow {
	id: number;
	weekday: number;
	meal_type: MealType;
	effective_from: string;
	effective_to: string | null;
	recipe_count: number;
	accompaniment_per_recipe: number;
	accompaniment_per_slot: number;
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
}

export interface ScheduleWithRecipe extends Schedule {
	recipe: Recipe;
	exceptions: string[];
}

export interface SlotData {
	weekday: number;
	meal_type: MealType;
	slot_index: number;
	is_accompaniment: number;
	is_leftover: 0 | 1;
	recipe: Recipe | null;
	schedule: ScheduleWithRecipe | null;
}

export interface MealConfig {
	recipe_count: number;
	accompaniment_per_recipe: number;
	accompaniment_per_slot: number;
	required_tags: string[][];
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
}

export interface RuleViolation {
	rule: Rule;
	current: number;
	message: string;
}
