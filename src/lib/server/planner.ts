import { getDb } from '$lib/db/index.js';
import type { Recipe, Member, SlotData, Options, Rule, MealType } from '$lib/types/index.js';
import { parseTags } from '$lib/utils/parseTags.js';
import { weekKeyToIndex } from '$lib/utils/dates.js';
import { getAllRules } from './rules.js';
import { getAllMembers } from './members.js';
import { getOptions } from './options.js';
import { assignRecipe } from './weekplan.js';

// Heurística: asumimos que la receta fue planificada a mitad de la semana anterior
const MIDWEEK_DAY_OFFSET = 4;
const MIN_DAYS_RELAXATION_FACTOR = 0.5;

interface SlotToFill {
	weekday: number;
	meal_type: MealType;
	slot_index: number;
	is_accompaniment: number;
	member_id: number | null;
	required_tags?: string[];
}

function wasPlannedRecently(
	recipeId: number,
	minDays: number,
	lastWeekByRecipe: Map<number, string>,
	weekKey: string,
	currentWeekIdx: number
): boolean {
	const lw = lastWeekByRecipe.get(recipeId);
	if (!lw) return false;
	if (lw === weekKey) return true;
	const weekDiff = currentWeekIdx - weekKeyToIndex(lw);
	const dayDiff = weekDiff * 7 + MIDWEEK_DAY_OFFSET;
	return dayDiff < minDays;
}

export function calculatePlan(weekKey: string, slotsToFill: SlotToFill[], currentSlots: SlotData[]): void {
	const db = getDb();
	const rules = getAllRules();
	const members = getAllMembers();
	const options = getOptions();

	// Batch: última semana planificada por receta (evita N+1)
	const lastWeekRows = db.prepare(`
		SELECT recipe_id, MAX(week_key) AS last_week
		FROM week_plans
		WHERE recipe_id IS NOT NULL AND week_key <= ?
		GROUP BY recipe_id
	`).all(weekKey) as { recipe_id: number; last_week: string }[];
	const lastWeekByRecipe = new Map<number, string>();
	for (const r of lastWeekRows) lastWeekByRecipe.set(r.recipe_id, r.last_week);

	const currentWeekIdx = weekKeyToIndex(weekKey);

	// Count current tag occurrences
	const tagCounts: Record<string, number> = {};
	for (const slot of currentSlots) {
		if (slot.recipe && !slot.is_accompaniment) {
			const tags = parseTags(slot.recipe.tags);
			for (const tag of tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		}
	}

	const allRecipes = db.prepare('SELECT * FROM recipes').all() as Recipe[];

	db.transaction(() => {
		for (const slot of slotsToFill) {
			const member = slot.member_id ? (members.find(m => m.id === slot.member_id) ?? null) : null;

			let candidates = fillCandidates(slot, allRecipes, member, members, options, rules, tagCounts, weekKey, lastWeekByRecipe, currentWeekIdx, false);

			if (candidates.length === 0) {
				candidates = fillCandidates(slot, allRecipes, member, members, options, rules, tagCounts, weekKey, lastWeekByRecipe, currentWeekIdx, true);
			}

			// Filtro de required_tags (AND condition, solo platos principales)
			if (!slot.is_accompaniment && slot.required_tags && slot.required_tags.length > 0) {
				const rts = slot.required_tags.map(t => t.trim().toLowerCase());
				const filtered = candidates.filter(r => {
					const recipeTags = parseTags(r.tags);
					return rts.every(rt => recipeTags.includes(rt));
				});
				if (filtered.length > 0) candidates = filtered;
			}

			if (candidates.length === 0) continue;

			// Priorizar recetas que ayuden a reglas at_least
			const atLeastRules = rules.filter(r => r.direction === 'at_least');
			const helping = candidates.filter(r => {
				const tags = parseTags(r.tags);
				return atLeastRules.some(rule => {
					const count = tagCounts[rule.tag] || 0;
					return count < rule.times && tags.includes(rule.tag);
				});
			});

			const pool = helping.length > 0 ? helping : candidates;
			const chosen = pool[Math.floor(Math.random() * pool.length)];

			assignRecipe(weekKey, slot.weekday, slot.meal_type, slot.slot_index, slot.is_accompaniment, chosen.id, slot.member_id);

			const tags = parseTags(chosen.tags);
			for (const tag of tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		}
	})();
}

export function getDiscardedRecipes(
	weekKey: string,
	_weekday: number,
	mealType: string,
	isAcc: number,
	_slotIndex: number,
	currentSlots: SlotData[],
	slotRequiredTags: string[] = []
): { recipe: Recipe; reason: string }[] {
	const db = getDb();
	const rules = getAllRules();
	const members = getAllMembers();
	const options = getOptions();

	const tagCounts: Record<string, number> = {};
	for (const slot of currentSlots) {
		if (slot.recipe && !slot.is_accompaniment) {
			const tags = parseTags(slot.recipe.tags);
			for (const tag of tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		}
	}

	const requiredTag = isAcc ? 'acompañamiento' : mealType;
	const allRecipes = db.prepare('SELECT * FROM recipes').all() as Recipe[];
	const result: { recipe: Recipe; reason: string }[] = [];

	// Batch: última semana por receta
	const lastWeekRows = db.prepare(`
		SELECT recipe_id, MAX(week_key) as last_week
		FROM week_plans
		WHERE recipe_id IS NOT NULL AND week_key <= ?
		GROUP BY recipe_id
	`).all(weekKey) as { recipe_id: number; last_week: string }[];
	const lastWeekByRecipe = new Map<number, string>();
	for (const r of lastWeekRows) lastWeekByRecipe.set(r.recipe_id, r.last_week);

	const currentWeekIdx = weekKeyToIndex(weekKey);

	function plannedWithin(recipeId: number, minDays: number): boolean {
		return wasPlannedRecently(recipeId, minDays, lastWeekByRecipe, weekKey, currentWeekIdx);
	}

	for (const recipe of allRecipes) {
		const tags = parseTags(recipe.tags);

		if (!tags.includes(requiredTag)) continue;

		let reason: string | null = null;

		if (!reason && slotRequiredTags.length > 0) {
			const missing = slotRequiredTags.find(rt => !tags.includes(rt.trim().toLowerCase()));
			if (missing) reason = `no tiene el tag requerido "${missing}"`;
		}

		if (!reason) {
			for (const m of members) {
				const cannotEat = parseTags(m.cannot_eat);
				const blocked = cannotEat.find(t => tags.includes(t));
				if (blocked) {
					reason = `restricción dietética (${blocked})`;
					break;
				}
			}
		}

		if (!reason) {
			const minDays = recipe.min_days === -1 ? options.default_min_days : recipe.min_days;
			if (minDays > 0 && plannedWithin(recipe.id, minDays)) {
				reason = `planificada recientemente (min. ${minDays} días)`;
			}
		}

		if (!reason) {
			const noMoreThanRules = rules.filter(r => r.direction === 'no_more_than');
			for (const rule of noMoreThanRules) {
				if (tags.includes(rule.tag)) {
					const count = tagCounts[rule.tag] || 0;
					if (count >= rule.times) {
						reason = `regla no_more_than: ${rule.tag} (${count}/${rule.times})`;
						break;
					}
				}
			}
		}

		if (reason) {
			result.push({ recipe, reason });
		}
	}

	return result;
}

function fillCandidates(
	slot: SlotToFill,
	allRecipes: Recipe[],
	member: Member | null,
	allMembers: Member[],
	options: Options,
	rules: Rule[],
	tagCounts: Record<string, number>,
	weekKey: string,
	lastWeekByRecipe: Map<number, string>,
	currentWeekIdx: number,
	relaxMinDays: boolean
): Recipe[] {
	const requiredTag = slot.is_accompaniment ? 'acompañamiento' : slot.meal_type;

	return allRecipes.filter(recipe => {
		const tags = parseTags(recipe.tags);

		if (!tags.includes(requiredTag)) return false;

		const applicableMembers = member ? [member] : allMembers;
		for (const m of applicableMembers) {
			const cannotEat = parseTags(m.cannot_eat);
			if (cannotEat.some(t => tags.includes(t))) return false;
		}

		const minDays = recipe.min_days === -1 ? options.default_min_days : recipe.min_days;
		const effectiveMinDays = relaxMinDays ? Math.floor(minDays * MIN_DAYS_RELAXATION_FACTOR) : minDays;
		if (effectiveMinDays > 0 && wasPlannedRecently(recipe.id, effectiveMinDays, lastWeekByRecipe, weekKey, currentWeekIdx)) return false;

		const noMoreThanRules = rules.filter(r => r.direction === 'no_more_than');
		for (const rule of noMoreThanRules) {
			if (tags.includes(rule.tag)) {
				const count = tagCounts[rule.tag] || 0;
				if (count >= rule.times) return false;
			}
		}

		return true;
	});
}
