import type { Rule, SlotData, RuleViolation } from '$lib/types/index.js';
import { parseTags } from './parseTags.js';

export function checkRules(slots: SlotData[], rules: Rule[]): RuleViolation[] {
	const tagCounts: Record<string, number> = {};

	for (const slot of slots) {
		if (slot.recipe && !slot.is_accompaniment) {
			const tags = parseTags(slot.recipe.tags);
			for (const tag of tags) {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		}
	}

	const violations: RuleViolation[] = [];

	for (const rule of rules) {
		const count = tagCounts[rule.tag] || 0;

		if (rule.direction === 'at_least' && count < rule.times) {
			violations.push({
				rule,
				current: count,
				message: `"${rule.tag}": al menos ${rule.times} veces (actual: ${count})`
			});
		} else if (rule.direction === 'no_more_than' && count > rule.times) {
			violations.push({
				rule,
				current: count,
				message: `"${rule.tag}": no más de ${rule.times} veces (actual: ${count})`
			});
		}
	}

	return violations;
}
