import { g as getDb } from "./index2.js";
function getAllMembers() {
  const db = getDb();
  return db.prepare("SELECT * FROM members ORDER BY name ASC").all();
}
function getMemberById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM members WHERE id = ?").get(id);
}
function createMember(data) {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO members (name, cannot_eat, likes, dislikes) VALUES (?, ?, ?, ?)"
  ).run(data.name, data.cannot_eat, data.likes, data.dislikes);
  return getMemberById(result.lastInsertRowid);
}
function updateMember(id, data) {
  const db = getDb();
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  const values = [...Object.values(data), id];
  db.prepare(`UPDATE members SET ${fields} WHERE id = ?`).run(...values);
  return getMemberById(id);
}
function deleteMember(id) {
  const db = getDb();
  db.prepare("DELETE FROM members WHERE id = ?").run(id);
}
export {
  getMemberById as a,
  createMember as c,
  deleteMember as d,
  getAllMembers as g,
  updateMember as u
};
