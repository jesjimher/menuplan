export interface Recipe {
	id: number;
	name: string;
	description: string;
	tags: string;
	min_days: number;
	image_type: string | null;
	created_at: string;
}

export interface Member {
	id: number;
	name: string;
	cannot_eat: string;
	likes: string;
	dislikes: string;
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
	meal_type: 'comida' | 'cena';
	slot_index: number;
	is_accompaniment: number;
	recipe_id: number | null;
	member_id: number | null;
}

export interface WeekDayConfig {
	id: number;
	week_key: string;
	weekday: number;
	meal_type: 'comida' | 'cena';
	recipe_count: number;
	accompaniment_per_recipe: number;
	accompaniment_per_slot: number;
	required_tag: string | null;
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

export interface Schedule {
	id: number;
	recipe_id: number;
	weekday: number;
	meal_type: 'comida' | 'cena';
	slot_index: number;
	is_accompaniment: number;
	every_n_weeks: number;
	anchor_week_key: string;
	created_at: string;
}

export interface ScheduleWithRecipe extends Schedule {
	recipe: Recipe;
	exceptions: string[];
}

export interface SlotData {
	weekday: number;
	meal_type: 'comida' | 'cena';
	slot_index: number;
	is_accompaniment: number;
	recipe: Recipe | null;
	member: Member | null;
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
