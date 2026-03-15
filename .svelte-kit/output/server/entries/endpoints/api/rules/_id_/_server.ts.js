import { json, error } from "@sveltejs/kit";
import { d as deleteRule, u as updateRule } from "../../../../../chunks/rules.js";
async function PUT({ params, request }) {
  const body = await request.json();
  const rule = updateRule(parseInt(params.id), body);
  if (!rule) throw error(404, "Rule not found");
  return json(rule);
}
async function DELETE({ params }) {
  deleteRule(parseInt(params.id));
  return json({ ok: true });
}
export {
  DELETE,
  PUT
};
