import { e as ensure_array_like } from "../../../chunks/index3.js";
import { e as escape_html } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let rules = [];
    function ruleText(r) {
      return r.direction === "at_least" ? `Al menos ${r.times} vez${r.times > 1 ? "ces" : ""} "${r.tag}" por semana` : `No más de ${r.times} vez${r.times > 1 ? "ces" : ""} "${r.tag}" por semana`;
    }
    $$renderer2.push(`<div class="p-4 max-w-2xl mx-auto"><div class="flex items-center justify-between mb-4"><h1 class="text-2xl font-bold text-gray-800">Reglas</h1> <button class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">+ Nueva regla</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="space-y-2">`);
    const each_array = ensure_array_like(rules);
    if (each_array.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let rule = each_array[$$index];
        $$renderer2.push(`<div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"><div class="flex items-center gap-3"><span class="text-2xl">${escape_html(rule.direction === "at_least" ? "✅" : "🚫")}</span> <p class="text-sm font-medium text-gray-800">${escape_html(ruleText(rule))}</p></div> <div class="flex gap-1"><button class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Editar</button> <button class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded">Borrar</button></div></div>`);
      }
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="text-center py-12 text-gray-400">No hay reglas definidas. Las reglas ayudan a equilibrar el plan semanal.</div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
