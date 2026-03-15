import { g as getDb } from "./index2.js";
function getAllRules() {
  const db = getDb();
  return db.prepare("SELECT * FROM rules ORDER BY tag ASC").all();
}
function getRuleById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM rules WHERE id = ?").get(id);
}
function createRule(data) {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO rules (tag, direction, times) VALUES (?, ?, ?)"
  ).run(data.tag, data.direction, data.times);
  return getRuleById(result.lastInsertRowid);
}
function updateRule(id, data) {
  const db = getDb();
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  const values = [...Object.values(data), id];
  db.prepare(`UPDATE rules SET ${fields} WHERE id = ?`).run(...values);
  return getRuleById(id);
}
function deleteRule(id) {
  const db = getDb();
  db.prepare("DELETE FROM rules WHERE id = ?").run(id);
}
export {
  createRule as c,
  deleteRule as d,
  getAllRules as g,
  updateRule as u
};
