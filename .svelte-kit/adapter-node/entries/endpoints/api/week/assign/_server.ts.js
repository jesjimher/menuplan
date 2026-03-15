import { json } from "@sveltejs/kit";
import { b as assignRecipe } from "../../../../../chunks/weekplan.js";
async function POST({ request }) {
  const body = await request.json();
  assignRecipe(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment ?? 0, body.recipe_id, body.member_id ?? null);
  return json({ ok: true });
}
export {
  POST
};
