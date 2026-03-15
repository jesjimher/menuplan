import { e as ensure_array_like, a as attr_class, b as stringify } from "../../../chunks/index3.js";
import { e as escape_html } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let history = [];
    let selectedWeek = null;
    $$renderer2.push(`<div class="p-4 max-w-5xl mx-auto"><h1 class="text-2xl font-bold text-gray-800 mb-4">Histórico</h1> <div class="flex gap-4"><div class="w-48 shrink-0">`);
    if (history.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="text-sm text-gray-400">No hay semanas planificadas.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="space-y-1"><!--[-->`);
      const each_array = ensure_array_like(history);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let wk = each_array[$$index];
        $$renderer2.push(`<button${attr_class(`w-full text-left px-3 py-2 rounded text-sm ${stringify(selectedWeek === wk ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:border-indigo-300")}`)}>${escape_html(wk)}</button>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-1">`);
    {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="text-gray-400 text-center py-12">Selecciona una semana para ver el detalle.</div>`);
    }
    $$renderer2.push(`<!--]--></div></div></div>`);
  });
}
export {
  _page as default
};
