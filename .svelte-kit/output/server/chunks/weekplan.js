import { g as getDb } from "./index2.js";
import { g as getAllRules } from "./rules.js";
import { g as getOptions } from "./options.js";
function parseTags(tags) {
  return tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}
function checkRules(slots, rules) {
  const tagCounts = {};
  for (const slot of slots) {
    if (slot.recipe && !slot.is_accompaniment) {
      const tags = parseTags(slot.recipe.tags);
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }
  const violations = [];
  for (const rule of rules) {
    const count = tagCounts[rule.tag] || 0;
    if (rule.direction === "at_least" && count < rule.times) {
      violations.push({
        rule,
        current: count,
        message: `"${rule.tag}": al menos ${rule.times} veces (actual: ${count})`
      });
    } else if (rule.direction === "no_more_than" && count > rule.times) {
      violations.push({
        rule,
        current: count,
        message: `"${rule.tag}": no más de ${rule.times} veces (actual: ${count})`
      });
    }
  }
  return violations;
}
function getWeekData(weekKey) {
  const db = getDb();
  const plans = db.prepare(`
		SELECT wp.*, r.id as r_id, r.name, r.description, r.tags, r.min_days, r.created_at,
		       m.id as m_id, m.name as m_name, m.cannot_eat, m.likes, m.dislikes
		FROM week_plans wp
		LEFT JOIN recipes r ON r.id = wp.recipe_id
		LEFT JOIN members m ON m.id = wp.member_id
		WHERE wp.week_key = ?
		ORDER BY wp.weekday, wp.meal_type, wp.is_accompaniment, wp.slot_index
	`).all(weekKey);
  const slots = plans.map((p) => ({
    weekday: p.weekday,
    meal_type: p.meal_type,
    slot_index: p.slot_index,
    is_accompaniment: p.is_accompaniment,
    recipe: p.recipe_id ? {
      id: p.r_id,
      name: p.name,
      description: p.description,
      tags: p.tags,
      min_days: p.min_days,
      created_at: p.created_at
    } : null,
    member: p.member_id ? {
      id: p.m_id,
      name: p.m_name,
      cannot_eat: p.cannot_eat,
      likes: p.likes,
      dislikes: p.dislikes
    } : null
  }));
  const options = getOptions();
  const configRows = db.prepare(
    "SELECT * FROM week_day_config WHERE week_key = ?"
  ).all(weekKey);
  const configs = {};
  for (let d = 1; d <= 7; d++) {
    configs[d] = {
      comida: { recipe_count: options.meals_per_day, accompaniment_per_recipe: options.side_dishes_per_recipe, accompaniment_per_slot: options.side_dishes_per_slot },
      cena: { recipe_count: options.dinners_per_day, accompaniment_per_recipe: options.side_dishes_per_recipe, accompaniment_per_slot: options.side_dishes_per_slot }
    };
  }
  for (const cfg of configRows) {
    if (!configs[cfg.weekday]) continue;
    configs[cfg.weekday][cfg.meal_type] = {
      recipe_count: cfg.recipe_count,
      accompaniment_per_recipe: cfg.accompaniment_per_recipe,
      accompaniment_per_slot: cfg.accompaniment_per_slot
    };
  }
  const rules = getAllRules();
  const violations = checkRules(slots, rules);
  return { week_key: weekKey, slots, configs, violations };
}
function assignRecipe(weekKey, weekday, mealType, slotIndex, isAccompaniment, recipeId, memberId) {
  const db = getDb();
  db.prepare(`
		INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id, member_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1))
		DO UPDATE SET recipe_id = excluded.recipe_id, member_id = excluded.member_id
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment, recipeId, memberId);
}
function removeRecipe(weekKey, weekday, mealType, slotIndex, isAccompaniment) {
  const db = getDb();
  db.prepare(`
		UPDATE week_plans SET recipe_id = NULL
		WHERE week_key = ? AND weekday = ? AND meal_type = ? AND slot_index = ? AND is_accompaniment = ?
	`).run(weekKey, weekday, mealType, slotIndex, isAccompaniment);
}
function clearWeek(weekKey) {
  const db = getDb();
  db.prepare("DELETE FROM week_plans WHERE week_key = ?").run(weekKey);
  db.prepare("DELETE FROM week_day_config WHERE week_key = ?").run(weekKey);
}
function copyPreviousWeek(weekKey, previousWeekKey) {
  const db = getDb();
  clearWeek(weekKey);
  const plans = db.prepare("SELECT * FROM week_plans WHERE week_key = ?").all(previousWeekKey);
  const insertPlan = db.prepare(`
		INSERT OR IGNORE INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id, member_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
  for (const plan of plans) {
    insertPlan.run(weekKey, plan.weekday, plan.meal_type, plan.slot_index, plan.is_accompaniment, plan.recipe_id, plan.member_id);
  }
  const configs = db.prepare("SELECT * FROM week_day_config WHERE week_key = ?").all(previousWeekKey);
  const insertConfig = db.prepare(`
		INSERT OR IGNORE INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
  for (const cfg of configs) {
    insertConfig.run(weekKey, cfg.weekday, cfg.meal_type, cfg.recipe_count, cfg.accompaniment_per_recipe, cfg.accompaniment_per_slot);
  }
}
function getHistory() {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT week_key FROM week_plans ORDER BY week_key DESC").all();
  return rows.map((r) => r.week_key);
}
function updateDayConfig(weekKey, weekday, mealType, config) {
  const db = getDb();
  const options = getOptions();
  const existing = db.prepare(
    "SELECT * FROM week_day_config WHERE week_key = ? AND weekday = ? AND meal_type = ?"
  ).get(weekKey, weekday, mealType);
  if (existing) {
    db.prepare(`
			UPDATE week_day_config SET
				recipe_count = ?,
				accompaniment_per_recipe = ?,
				accompaniment_per_slot = ?
			WHERE week_key = ? AND weekday = ? AND meal_type = ?
		`).run(
      config.recipe_count ?? existing.recipe_count,
      config.accompaniment_per_recipe ?? existing.accompaniment_per_recipe,
      config.accompaniment_per_slot ?? existing.accompaniment_per_slot,
      weekKey,
      weekday,
      mealType
    );
  } else {
    const defaultRecipeCount = mealType === "comida" ? options.meals_per_day : options.dinners_per_day;
    db.prepare(`
			INSERT INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(
      weekKey,
      weekday,
      mealType,
      config.recipe_count ?? defaultRecipeCount,
      config.accompaniment_per_recipe ?? options.side_dishes_per_recipe,
      config.accompaniment_per_slot ?? options.side_dishes_per_slot
    );
  }
}
export {
  getWeekData as a,
  assignRecipe as b,
  clearWeek as c,
  copyPreviousWeek as d,
  getHistory as g,
  removeRecipe as r,
  updateDayConfig as u
};
