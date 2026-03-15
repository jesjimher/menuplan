import { json } from "@sveltejs/kit";
import { s as searchRecipes, g as getTopRecipesForSlot, a as getAllRecipes, i as importPlantoeatRecipes, c as createRecipe } from "../../../../chunks/recipes.js";
async function GET({ url }) {
  const q = url.searchParams.get("q");
  const mealType = url.searchParams.get("mealType");
  const weekday = url.searchParams.get("weekday");
  if (q !== null || mealType) {
    const recipes = searchRecipes(q || "", mealType || void 0);
    const top = weekday ? getTopRecipesForSlot(parseInt(weekday), mealType || "comida") : [];
    return json({ recipes, top });
  }
  return json(getAllRecipes());
}
async function POST({ request }) {
  const body = await request.json();
  if (body.import_text) {
    const imported = importPlantoeatRecipes(body.import_text);
    return json(imported);
  }
  const recipe = createRecipe({
    name: body.name,
    description: body.description || "",
    tags: body.tags || "",
    min_days: body.min_days ?? -1
  });
  return json(recipe, { status: 201 });
}
export {
  GET,
  POST
};
