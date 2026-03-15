import { e as ensure_array_like } from "../../../chunks/index3.js";
import { e as escape_html, a as attr } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let filteredRecipes;
    let recipes = [];
    let searchQ = "";
    filteredRecipes = recipes.filter((r) => !searchQ);
    $$renderer2.push(`<div class="p-4 max-w-4xl mx-auto"><div class="flex items-center justify-between mb-4"><h1 class="text-2xl font-bold text-gray-800">Recetas (${escape_html(recipes.length)})</h1> <div class="flex gap-2"><button class="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-sm">Importar</button> <button class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">+ Nueva receta</button></div></div> <input type="text" placeholder="Buscar recetas..."${attr("value", searchQ)} class="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-400"/> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="space-y-2">`);
    const each_array = ensure_array_like(filteredRecipes);
    if (each_array.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
        let recipe = each_array[$$index_1];
        $$renderer2.push(`<div class="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"><div class="flex-1 min-w-0"><p class="font-medium text-gray-800">${escape_html(recipe.name)}</p> `);
        if (recipe.description) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-sm text-gray-500 mt-0.5 line-clamp-2">${escape_html(recipe.description)}</p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (recipe.tags) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="flex flex-wrap gap-1 mt-1"><!--[-->`);
          const each_array_1 = ensure_array_like(recipe.tags.split(","));
          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
            let tag = each_array_1[$$index];
            $$renderer2.push(`<span class="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">${escape_html(tag.trim())}</span>`);
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (recipe.min_days !== -1) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-xs text-gray-400 mt-1">Mín. ${escape_html(recipe.min_days)} días entre ocurrencias</p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="flex gap-1 shrink-0"><button class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Editar</button> <button class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded">Borrar</button></div></div>`);
      }
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="text-center py-12 text-gray-400">${escape_html("No hay recetas. Añade una nueva o importa desde Plantoeat.")}</div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
