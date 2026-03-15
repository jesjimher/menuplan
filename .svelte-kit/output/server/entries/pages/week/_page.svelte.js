import { e as escape_html, a as attr } from "../../../chunks/attributes.js";
import { g as getWeekKey, b as getWeekDates } from "../../../chunks/dates.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let weekKey = getWeekKey();
    let calculating = false;
    getWeekDates(weekKey);
    $$renderer2.push(`<div class="p-4 max-w-full"><div class="flex flex-wrap items-center gap-3 mb-4"><button class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">← Anterior</button> <h1 class="text-xl font-bold text-gray-800">${escape_html(weekKey)}</h1> <button class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Siguiente →</button> <div class="ml-auto flex gap-2 flex-wrap"><button${attr("disabled", calculating, true)} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-50">${escape_html("Calcular plan")}</button> <button class="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm">Limpiar</button> <button class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm">Copiar anterior</button></div></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="text-center py-12 text-gray-500">Cargando...</div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
