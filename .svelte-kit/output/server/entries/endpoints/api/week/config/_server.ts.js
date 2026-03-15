import { json } from "@sveltejs/kit";
import { u as updateDayConfig } from "../../../../../chunks/weekplan.js";
async function POST({ request }) {
  const body = await request.json();
  updateDayConfig(body.weekKey, body.weekday, body.meal_type, {
    recipe_count: body.recipe_count,
    accompaniment_per_recipe: body.accompaniment_per_recipe,
    accompaniment_per_slot: body.accompaniment_per_slot
  });
  return json({ ok: true });
}
export {
  POST
};
