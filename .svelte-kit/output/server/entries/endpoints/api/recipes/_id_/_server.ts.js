import { json, error } from "@sveltejs/kit";
import { d as deleteRecipe, b as getRecipeById, u as updateRecipe } from "../../../../../chunks/recipes.js";
async function GET({ params }) {
  const recipe = getRecipeById(parseInt(params.id));
  if (!recipe) throw error(404, "Recipe not found");
  return json(recipe);
}
async function PUT({ params, request }) {
  const body = await request.json();
  const recipe = updateRecipe(parseInt(params.id), body);
  if (!recipe) throw error(404, "Recipe not found");
  return json(recipe);
}
async function DELETE({ params }) {
  deleteRecipe(parseInt(params.id));
  return json({ ok: true });
}
export {
  DELETE,
  GET,
  PUT
};
