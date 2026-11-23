import type { Rule, SlotData, RuleViolation, Person } from '$lib/types/index.js';
import { parseTags } from './parseTags.js';

// Las reglas se evalúan por persona: cada persona tiene su propio contador de tags, y una
// receta cuenta para una persona si es para ella o para todos (sin personas asignadas).
// Sin personas dadas de alta hay un único contador global (EVERYONE), como antes.
export const EVERYONE = 0;

export type TagCounts = Map<number, Record<string, number>>;

/** ¿Come esta persona la receta del slot? (sin personas asignadas = para todos). */
export function slotIsFor(people: number[], personId: number): boolean {
	return personId === EVERYONE || people.length === 0 || people.includes(personId);
}

/** Contadores a los que suma una receta con esas personas. */
export function bucketsFor(people: number[], buckets: number[]): number[] {
	return buckets.filter(b => slotIsFor(people, b));
}

/** Contadores que existen: uno por persona activa, o uno global si no hay personas. */
export function countBuckets(personIds: number[]): number[] {
	return personIds.length > 0 ? personIds : [EVERYONE];
}

export function addTagCounts(counts: TagCounts, tags: string[], buckets: number[]): void {
	for (const b of buckets) {
		const rec = counts.get(b) ?? {};
		for (const tag of tags) rec[tag] = (rec[tag] || 0) + 1;
		counts.set(b, rec);
	}
}

export function countTagsPerPerson(
	slots: SlotData[],
	personIds: number[],
	{ includeLeftovers = false }: { includeLeftovers?: boolean } = {}
): TagCounts {
	const buckets = countBuckets(personIds);
	const counts: TagCounts = new Map(buckets.map(b => [b, {}]));
	for (const slot of slots) {
		if (!slot.recipe || slot.is_accompaniment) continue;
		if (slot.is_leftover && !includeLeftovers) continue;
		addTagCounts(counts, parseTags(slot.recipe.tags), bucketsFor(slot.people ?? [], buckets));
	}
	return counts;
}

/** Contadores a los que aplica una regla: sus personas (activas) o todas si no tiene. */
export function ruleTargets(rule: Rule, personIds: number[]): number[] {
	const rulePeople = rule.people ?? [];
	if (rulePeople.length === 0) return countBuckets(personIds);
	return rulePeople.filter(p => personIds.includes(p));
}

export function checkRules(slots: SlotData[], rules: Rule[], people: Person[] = []): RuleViolation[] {
	const personIds = people.map(p => p.id);
	const nameOf = new Map(people.map(p => [p.id, p.name]));
	const counts = countTagsPerPerson(slots, personIds);

	const violations: RuleViolation[] = [];

	for (const rule of rules) {
		const targets = ruleTargets(rule, personIds);
		const offenders: { person: number; count: number }[] = [];
		for (const person of targets) {
			const count = counts.get(person)?.[rule.tag] || 0;
			const broken = rule.direction === 'at_least' ? count < rule.times : count > rule.times;
			if (broken) offenders.push({ person, count });
		}
		if (offenders.length === 0) continue;

		const current = rule.direction === 'at_least'
			? Math.min(...offenders.map(o => o.count))
			: Math.max(...offenders.map(o => o.count));
		const base = rule.direction === 'at_least'
			? `"${rule.tag}": al menos ${rule.times} veces`
			: `"${rule.tag}": no más de ${rule.times} veces`;

		// Regla general incumplida igual por todos: el mensaje no necesita nombres
		const sameForAll = (rule.people ?? []).length === 0
			&& offenders.length === targets.length
			&& offenders.every(o => o.count === offenders[0].count);
		const message = sameForAll || offenders.every(o => o.person === EVERYONE)
			? `${base} (actual: ${current})`
			: `${base} (${offenders.map(o => `${nameOf.get(o.person) ?? '?'}: ${o.count}`).join(', ')})`;

		violations.push({
			rule,
			current,
			message,
			people: offenders.map(o => o.person).filter(p => p !== EVERYONE)
		});
	}

	return violations;
}
