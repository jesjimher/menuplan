import { getDb } from '$lib/db/index.js';
import type { Recipe, Member, SlotData } from '$lib/types/index.js';
import { getAllRules } from './rules.js';
import { getAllMembers } from './members.js';
import { getOptions } from './options.js';
import { assignRecipe } from './weekplan.js';

interface SlotToFill {
	weekday: number;
	meal_type: 'comida' | 'cena';
	slot_index: number;
	is_accompaniment: number;
	member_id: number | null;
}

function parseTags(tags: string): string[] {
	return tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

function getRecentRecipeIds(weekKey: string, recipeId: number, minDays: number): boolean {
	const db = getDb();

	// Parse weekKey to find recent weeks
	const [year, weekStr] = weekKey.split('-W');
	const weekNum = parseInt(weekStr);

	// Get all plans from current week + minDays worth of history
	// We'll check by counting days from the current week
	const recentPlans = db.prepare(`
		SELECT DISTINCT wp.recipe_id, wp.week_key, wp.weekday
		FROM week_plans wp
		WHERE wp.recipe_id = ? AND wp.week_key <= ?
		ORDER BY wp.week_key DESC, wp.weekday DESC
		LIMIT 100
	`).all(recipeId, weekKey) as { recipe_id: number; week_key: string; weekday: number }[];

	if (recentPlans.length === 0) return false;

	// Check if any occurrence is within minDays
	// Approximate: check last few weeks
	for (const plan of recentPlans) {
		if (plan.week_key === weekKey) return true;
		const [py, pw] = plan.week_key.split('-W');
		const weekDiff = parseInt(year) * 52 + weekNum - (parseInt(py) * 52 + parseInt(pw));
		const dayDiff = weekDiff * 7 + 4; // approximate
		if (dayDiff < minDays) return true;
		if (dayDiff >= minDays) break;
	}

	return false;
}

export function calculatePlan(weekKey: string, slotsToFill: SlotToFill[], currentSlots: SlotData[]): void {
	const db = getDb();
	const rules = getAllRules();
	const members = getAllMembers();
	const options = getOptions();

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

	for (const slot of slotsToFill) {
		const member = slot.member_id ? members.find(m => m.id === slot.member_id) : null;

		let candidates = fillCandidates(slot, allRecipes, member, members, options, rules, tagCounts, weekKey, false);

		if (candidates.length === 0) {
			// Relax min_days by 50%
			candidates = fillCandidates(slot, allRecipes, member, members, options, rules, tagCounts, weekKey, true);
		}

		if (candidates.length === 0) continue;

		// Prioritize recipes that help at_least rules
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

		// Update tag counts
		const tags = parseTags(chosen.tags);
		for (const tag of tags) {
			tagCounts[tag] = (tagCounts[tag] || 0) + 1;
		}
	}
}

function fillCandidates(
	slot: SlotToFill,
	allRecipes: Recipe[],
	member: Member | null,
	allMembers: Member[],
	options: any,
	rules: any[],
	tagCounts: Record<string, number>,
	weekKey: string,
	relaxMinDays: boolean
): Recipe[] {
	const requiredTag = slot.is_accompaniment ? 'acompañamiento' : slot.meal_type;

	return allRecipes.filter(recipe => {
		const tags = parseTags(recipe.tags);

		// Must have the right meal type tag
		if (!tags.includes(requiredTag)) return false;

		// Hard dietary restrictions
		const applicableMembers = member ? [member] : allMembers;
		for (const m of applicableMembers) {
			const cannotEat = parseTags(m.cannot_eat);
			if (cannotEat.some(t => tags.includes(t))) return false;
		}

		// min_days filter
		const minDays = recipe.min_days === -1 ? options.default_min_days : recipe.min_days;
		const effectiveMinDays = relaxMinDays ? Math.floor(minDays * 0.5) : minDays;
		if (effectiveMinDays > 0 && getRecentRecipeIds(weekKey, recipe.id, effectiveMinDays)) return false;

		// no_more_than rules
		const noMoreThanRules = rules.filter((r: any) => r.direction === 'no_more_than');
		for (const rule of noMoreThanRules) {
			if (tags.includes(rule.tag)) {
				const count = tagCounts[rule.tag] || 0;
				if (count >= rule.times) return false;
			}
		}

		return true;
	});
}
