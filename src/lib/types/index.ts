export interface Recipe {
	id: number;
	name: string;
	description: string;
	tags: string;
	min_days: number;
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
}

export interface Options {
	default_min_days: number;
	meals_per_day: number;
	dinners_per_day: number;
	side_dishes_per_recipe: number;
	side_dishes_per_slot: number;
}

export interface SlotData {
	weekday: number;
	meal_type: 'comida' | 'cena';
	slot_index: number;
	is_accompaniment: number;
	recipe: Recipe | null;
	member: Member | null;
}

export interface MealConfig {
	recipe_count: number;
	accompaniment_per_recipe: number;
	accompaniment_per_slot: number;
	required_tags: string[][];
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
