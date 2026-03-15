import { g as getDb } from "./index2.js";
function getOptions() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM options").all();
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    default_min_days: parseInt(map.default_min_days ?? "5"),
    meals_per_day: parseInt(map.meals_per_day ?? "1"),
    dinners_per_day: parseInt(map.dinners_per_day ?? "1"),
    side_dishes_per_recipe: parseInt(map.side_dishes_per_recipe ?? "1"),
    side_dishes_per_slot: parseInt(map.side_dishes_per_slot ?? "0")
  };
}
function setOptions(opts) {
  const db = getDb();
  const update = db.prepare("INSERT OR REPLACE INTO options (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(opts)) {
    update.run(key, String(value));
  }
  return getOptions();
}
export {
  getOptions as g,
  setOptions as s
};
