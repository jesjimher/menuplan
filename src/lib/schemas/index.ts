import { z } from 'zod';

export const weekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/, 'weekKey debe tener formato YYYY-Www');
export const weekdaySchema = z.number().int().min(1).max(7);
export const mealTypeSchema = z.enum(['comida', 'cena']);
export const slotIndexSchema = z.number().int().min(0);
export const isAccompanimentSchema = z.union([z.literal(0), z.literal(1)]).default(0);

// Endpoints de semana
export const assignBodySchema = z.object({
	weekKey: weekKeySchema,
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	slot_index: slotIndexSchema,
	is_accompaniment: isAccompanimentSchema,
	recipe_id: z.number().int().positive().nullable(),
	member_id: z.number().int().positive().nullable().default(null),
});

export const removeBodySchema = z.object({
	weekKey: weekKeySchema,
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	slot_index: slotIndexSchema,
	is_accompaniment: isAccompanimentSchema,
	force: z.enum(['only_week', 'full_schedule', 'move']).optional(),
});

export const clearBodySchema = z.object({
	weekKey: weekKeySchema.optional(),
});

export const copyPreviousBodySchema = z.object({
	weekKey: weekKeySchema.optional(),
});

export const calculateBodySchema = z.object({
	weekKey: weekKeySchema.optional(),
});

export const calculateSlotBodySchema = z.object({
	weekKey: weekKeySchema,
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	slot_index: slotIndexSchema,
	is_accompaniment: isAccompanimentSchema,
});

export const configBodySchema = z.union([
	// Actualización de required_tags por slot
	z.object({
		weekKey: weekKeySchema,
		weekday: weekdaySchema,
		meal_type: mealTypeSchema,
		slot_index: slotIndexSchema,
		required_tags: z.array(z.string()),
	}),
	// Actualización de configuración de día/comida
	z.object({
		weekKey: weekKeySchema,
		weekday: weekdaySchema,
		meal_type: mealTypeSchema,
		recipe_count: z.number().int().min(0).optional(),
		accompaniment_per_recipe: z.number().int().min(0).optional(),
		accompaniment_per_slot: z.number().int().min(0).optional(),
		disabled: z.boolean().optional(),
		disabled_comment: z.string().nullable().optional(),
		note: z.string().nullable().optional(),
	}),
]);

// Endpoints de recetas
export const createRecipeBodySchema = z.object({
	name: z.string().min(1).max(500),
	description: z.string().max(10000).default(''),
	tags: z.string().max(1000).default(''),
	min_days: z.number().int().min(-1).default(-1),
	import_text: z.string().optional(),
});

export const updateRecipeBodySchema = z.object({
	name: z.string().min(1).max(500).optional(),
	description: z.string().max(10000).optional(),
	tags: z.string().max(1000).optional(),
	min_days: z.number().int().min(-1).optional(),
});

// Endpoints de miembros
export const memberBodySchema = z.object({
	name: z.string().min(1).max(200),
	cannot_eat: z.string().max(500).default(''),
	likes: z.string().max(500).default(''),
	dislikes: z.string().max(500).default(''),
});

// Endpoints de reglas
export const ruleBodySchema = z.object({
	tag: z.string().min(1).max(200),
	direction: z.enum(['at_least', 'no_more_than']),
	times: z.number().int().min(0),
});

// Endpoints de programaciones
export const scheduleBodySchema = z.object({
	recipe_id: z.number().int().positive(),
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	slot_index: slotIndexSchema.default(0),
	is_accompaniment: isAccompanimentSchema,
	every_n_weeks: z.number().int().min(1),
	anchor_week_key: weekKeySchema,
});

export const exceptionBodySchema = z.object({
	week_key: weekKeySchema,
});

// Endpoint de options
export const optionsBodySchema = z.object({
	default_min_days: z.number().int().min(0).optional(),
	meals_per_day: z.number().int().min(1).optional(),
	dinners_per_day: z.number().int().min(1).optional(),
	side_dishes_per_recipe: z.number().int().min(0).optional(),
	side_dishes_per_slot: z.number().int().min(0).optional(),
	sidebar_collapsed_by_default: z.boolean().optional(),
});

// Endpoint de image URL
export const imageUrlBodySchema = z.object({
	url: z.string().url().max(2000),
});
