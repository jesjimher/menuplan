import { g as getDb } from "./index2.js";
import { g as getAllRules } from "./rules.js";
import { g as getAllMembers } from "./members.js";
import { g as getOptions } from "./options.js";
import { b as assignRecipe } from "./weekplan.js";
function parseTags(tags) {
  return tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}
function getRecentRecipeIds(weekKey, recipeId, minDays) {
  const db = getDb();
  const [year, weekStr] = weekKey.split("-W");
  const weekNum = parseInt(weekStr);
  const recentPlans = db.prepare(`
		SELECT DISTINCT wp.recipe_id, wp.week_key, wp.weekday
		FROM week_plans wp
		WHERE wp.recipe_id = ? AND wp.week_key <= ?
		ORDER BY wp.week_key DESC, wp.weekday DESC
		LIMIT 100
	`).all(recipeId, weekKey);
  if (recentPlans.length === 0) return false;
  for (const plan of recentPlans) {
    if (plan.week_key === weekKey) return true;
    const [py, pw] = plan.week_key.split("-W");
    const weekDiff = parseInt(year) * 52 + weekNum - (parseInt(py) * 52 + parseInt(pw));
    const dayDiff = weekDiff * 7 + 4;
    if (dayDiff < minDays) return true;
    if (dayDiff >= minDays) break;
  }
  return false;
}
function calculatePlan(weekKey, slotsToFill, currentSlots) {
  const db = getDb();
  const rules = getAllRules();
  const members = getAllMembers();
  const options = getOptions();
  const tagCounts = {};
  for (const slot of currentSlots) {
    if (slot.recipe && !slot.is_accompaniment) {
      const tags = parseTags(slot.recipe.tags);
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }
  const allRecipes = db.prepare("SELECT * FROM recipes").all();
  for (const slot of slotsToFill) {
    const member = slot.member_id ? members.find((m) => m.id === slot.member_id) : null;
    let candidates = fillCandidates(slot, allRecipes, member, members, options, rules, tagCounts, weekKey, false);
    if (candidates.length === 0) {
      candidates = fillCandidates(slot, allRecipes, member, members, options, rules, tagCounts, weekKey, true);
    }
    if (candidates.length === 0) continue;
    const atLeastRules = rules.filter((r) => r.direction === "at_least");
    const helping = candidates.filter((r) => {
      const tags2 = parseTags(r.tags);
      return atLeastRules.some((rule) => {
        const count = tagCounts[rule.tag] || 0;
        return count < rule.times && tags2.includes(rule.tag);
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
}
function fillCandidates(slot, allRecipes, member, allMembers, options, rules, tagCounts, weekKey, relaxMinDays) {
  const requiredTag = slot.is_accompaniment ? "acompañamiento" : slot.meal_type;
  return allRecipes.filter((recipe) => {
    const tags = parseTags(recipe.tags);
    if (!tags.includes(requiredTag)) return false;
    const applicableMembers = member ? [member] : allMembers;
    for (const m of applicableMembers) {
      const cannotEat = parseTags(m.cannot_eat);
      if (cannotEat.some((t) => tags.includes(t))) return false;
    }
    const minDays = recipe.min_days === -1 ? options.default_min_days : recipe.min_days;
    const effectiveMinDays = relaxMinDays ? Math.floor(minDays * 0.5) : minDays;
    if (effectiveMinDays > 0 && getRecentRecipeIds(weekKey, recipe.id, effectiveMinDays)) return false;
    const noMoreThanRules = rules.filter((r) => r.direction === "no_more_than");
    for (const rule of noMoreThanRules) {
      if (tags.includes(rule.tag)) {
        const count = tagCounts[rule.tag] || 0;
        if (count >= rule.times) return false;
      }
    }
    return true;
  });
}
export {
  calculatePlan as c
};
