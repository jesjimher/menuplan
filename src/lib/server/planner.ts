import { getDb } from '$lib/db/index.js';
import type { Recipe, SlotData, Options, Rule, MealType } from '$lib/types/index.js';
import { parseTags } from '$lib/utils/parseTags.js';
import { weekKeyToIndex } from '$lib/utils/dates.js';
import { getAllRules } from './rules.js';
import { getAllRecipes } from './recipes.js';
import { getOptions } from './options.js';
import { assignRecipe } from './weekplan.js';
import { getActivePeople } from './people.js';
import { countTagsPerPerson, countBuckets, addTagCounts, ruleTargets, type TagCounts } from '$lib/utils/ruleChecker.js';

// Heurística: asumimos que la receta fue planificada a mitad de la semana anterior
const MIDWEEK_DAY_OFFSET = 4;
const MIN_DAYS_RELAXATION_FACTOR = 0.5;

export interface SlotToFill {
	weekday: number;
	meal_type: MealType;
	slot_id: number;
	is_accompaniment: number;
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

	// Contadores de tags por persona. El planificador deja sus recetas para todos, así que
	// cada receta nueva suma a todos los contadores.
	const personIds = getActivePeople().map(p => p.id);
	const allBuckets = countBuckets(personIds);
	const tagCounts = countTagsPerPerson(currentSlots, personIds, { includeLeftovers: true });

	const allRecipes = getAllRecipes();

	db.transaction(() => {
		for (const slot of slotsToFill) {
			let candidates = fillCandidates(slot, allRecipes, options, rules, tagCounts, personIds, weekKey, lastWeekByRecipe, currentWeekIdx, false);

			if (candidates.length === 0) {
				candidates = fillCandidates(slot, allRecipes, options, rules, tagCounts, personIds, weekKey, lastWeekByRecipe, currentWeekIdx, true);
			}

			// Filtro de required_tags (AND condition)
			if (slot.required_tags && slot.required_tags.length > 0) {
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
				return atLeastRules.some(rule =>
					tags.includes(rule.tag) &&
					ruleTargets(rule, personIds).some(p => (tagCounts.get(p)?.[rule.tag] || 0) < rule.times)
				);
			});

			const pool = helping.length > 0 ? helping : candidates;
			const chosen = pool[Math.floor(Math.random() * pool.length)];

			assignRecipe(weekKey, slot.slot_id, chosen.id);

			if (!slot.is_accompaniment) addTagCounts(tagCounts, parseTags(chosen.tags), allBuckets);
		}
	})();
}

export function getDiscardedRecipes(
	weekKey: string,
	_weekday: number,
	mealType: string,
	isAcc: number,
	currentSlots: SlotData[],
	slotRequiredTags: string[] = []
): { recipe: Recipe; reason: string }[] {
	const db = getDb();
	const rules = getAllRules();
	const options = getOptions();

	const personIds = getActivePeople().map(p => p.id);
	const tagCounts = countTagsPerPerson(currentSlots, personIds, { includeLeftovers: true });

	const requiredTag = isAcc ? 'acompañamiento' : mealType;
	const allRecipes = getAllRecipes();
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
			const minDays = recipe.min_days === -1 ? options.default_min_days : recipe.min_days;
			if (minDays > 0 && plannedWithin(recipe.id, minDays)) {
				reason = `planificada recientemente (min. ${minDays} días)`;
			}
		}

		if (!reason) {
			const noMoreThanRules = rules.filter(r => r.direction === 'no_more_than');
			for (const rule of noMoreThanRules) {
				if (!tags.includes(rule.tag)) continue;
				const count = maxRuleCount(rule, tagCounts, personIds);
				if (count >= rule.times) {
					reason = `regla no_more_than: ${rule.tag} (${count}/${rule.times})`;
					break;
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
	options: Options,
	rules: Rule[],
	tagCounts: TagCounts,
	personIds: number[],
	weekKey: string,
	lastWeekByRecipe: Map<number, string>,
	currentWeekIdx: number,
	relaxMinDays: boolean
): Recipe[] {
	const requiredTag = slot.is_accompaniment ? 'acompañamiento' : slot.meal_type;

	return allRecipes.filter(recipe => {
		const tags = parseTags(recipe.tags);

		if (!tags.includes(requiredTag)) return false;

		const minDays = recipe.min_days === -1 ? options.default_min_days : recipe.min_days;
		const effectiveMinDays = relaxMinDays ? Math.floor(minDays * MIN_DAYS_RELAXATION_FACTOR) : minDays;
		if (effectiveMinDays > 0 && wasPlannedRecently(recipe.id, effectiveMinDays, lastWeekByRecipe, weekKey, currentWeekIdx)) return false;

		const noMoreThanRules = rules.filter(r => r.direction === 'no_more_than');
		for (const rule of noMoreThanRules) {
			if (tags.includes(rule.tag) && maxRuleCount(rule, tagCounts, personIds) >= rule.times) return false;
		}

		return true;
	});
}

/** Mayor contador del tag de la regla entre las personas a las que aplica (-1 si a ninguna). */
function maxRuleCount(rule: Rule, tagCounts: TagCounts, personIds: number[]): number {
	const targets = ruleTargets(rule, personIds);
	if (targets.length === 0) return -1;
	return Math.max(...targets.map(p => tagCounts.get(p)?.[rule.tag] || 0));
}
