import { json } from "@sveltejs/kit";
import { r as removeRecipe } from "../../../../../chunks/weekplan.js";
async function POST({ request }) {
  const body = await request.json();
  removeRecipe(body.weekKey, body.weekday, body.meal_type, body.slot_index, body.is_accompaniment ?? 0);
  return json({ ok: true });
}
export {
  POST
};
