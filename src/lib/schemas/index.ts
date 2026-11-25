import { z } from 'zod';

export const weekKeySchema = z.string().regex(/^\d{4}-W\d{2}$/, 'weekKey debe tener formato YYYY-Www');
export const weekdaySchema = z.number().int().min(1).max(7);
export const mealTypeSchema = z.enum(['comida', 'cena']);
export const isAccompanimentSchema = z.union([z.literal(0), z.literal(1)]).default(0);
// Hueco: slot_id de meal_slots; negativo = hueco virtual de una programación «add» (-schedule_id)
export const slotIdSchema = z.number().int();
// Para quién es una receta/regla; vacío = para todos
export const peopleSchema = z.array(z.number().int().positive()).max(100);

// Endpoints de semana
export const assignBodySchema = z.object({
	weekKey: weekKeySchema,
	slot_id: slotIdSchema,
	is_leftover: z.union([z.literal(0), z.literal(1)]).default(0),
	recipe_id: z.number().int().positive(),
	// Omitido = conservar las personas que ya tuviera el hueco
	people: peopleSchema.optional(),
});

export const slotPeopleBodySchema = z.object({
	weekKey: weekKeySchema,
	slot_id: slotIdSchema,
	// Receta visible en el hueco: si viene de una programación, se materializa con ella
	recipe_id: z.number().int().positive(),
	people: peopleSchema,
});

export const removeBodySchema = z.object({
	weekKey: weekKeySchema,
	slot_id: slotIdSchema,
	recipe_id: z.number().int().positive().optional(),
	force: z.enum(['only_week', 'full_schedule', 'shift_rotation', 'move']).optional(),
});

export const clearBodySchema = z.object({
	weekKey: weekKeySchema.optional(),
	scope: z.enum(['week', 'future']).default('week'),
});

export const copyPreviousBodySchema = z.object({
	weekKey: weekKeySchema.optional(),
});

export const calculateBodySchema = z.object({
	weekKey: weekKeySchema.optional(),
});

export const calculateSlotBodySchema = z.object({
	weekKey: weekKeySchema,
	slot_id: slotIdSchema,
});

// Estado puntual de una comida en una semana
export const configBodySchema = z.object({
	weekKey: weekKeySchema,
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	disabled: z.boolean().optional(),
	disabled_comment: z.string().nullable().optional(),
	note: z.string().nullable().optional(),
});

// Huecos de una comida
export const addSlotBodySchema = z.object({
	weekKey: weekKeySchema,
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	kind: z.enum(['main', 'acc']),
	// Plato del que cuelga un acompañamiento; omitido/null = de toda la comida
	parent_id: z.number().int().positive().nullable().optional(),
	tags: z.array(z.string()).optional(),
});

export const removeSlotBodySchema = z.object({
	weekKey: weekKeySchema,
	slot_id: z.number().int().positive(),
});

export const slotTagsBodySchema = z.object({
	weekKey: weekKeySchema,
	slot_id: z.number().int().positive(),
	tags: z.array(z.string()),
});

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

// Endpoints de reglas
export const ruleBodySchema = z.object({
	tag: z.string().min(1).max(200),
	direction: z.enum(['at_least', 'no_more_than']),
	times: z.number().int().min(0),
	people: peopleSchema.default([]),
});

// Endpoints de programaciones
export const scheduleBodySchema = z.object({
	recipe_id: z.number().int().positive(),
	weekday: weekdaySchema,
	meal_type: mealTypeSchema,
	is_accompaniment: isAccompanimentSchema,
	every_n_weeks: z.number().int().min(1),
	anchor_week_key: weekKeySchema,
	on_conflict: z.enum(['skip', 'overwrite', 'add']).default('skip'),
	priority: z.number().int().min(1).max(10).default(5),
	people: peopleSchema.optional(),
});

export const scheduleMoveBodySchema = z.object({
	weekday: weekdaySchema,
	anchor_week_key: weekKeySchema.optional(),
});

export const exceptionBodySchema = z.object({
	week_key: weekKeySchema,
});

// Endpoints de personas
export const createPersonBodySchema = z.object({
	name: z.string().trim().min(1).max(100),
});

export const updatePersonBodySchema = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	archived: z.boolean().optional(),
});

export const reorderPeopleBodySchema = z.object({
	ids: z.array(z.number().int().positive()),
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
