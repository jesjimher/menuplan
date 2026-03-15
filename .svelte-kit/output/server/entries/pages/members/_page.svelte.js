import { e as ensure_array_like } from "../../../chunks/index3.js";
import { e as escape_html } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let members = [];
    $$renderer2.push(`<div class="p-4 max-w-2xl mx-auto"><div class="flex items-center justify-between mb-4"><h1 class="text-2xl font-bold text-gray-800">Miembros de la familia</h1> <button class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">+ Nuevo miembro</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="space-y-3">`);
    const each_array = ensure_array_like(members);
    if (each_array.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let member = each_array[$$index];
        $$renderer2.push(`<div class="p-4 bg-white border border-gray-200 rounded-lg"><div class="flex items-start justify-between"><h3 class="font-semibold text-gray-800">${escape_html(member.name)}</h3> <div class="flex gap-1"><button class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Editar</button> <button class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded">Borrar</button></div></div> `);
        if (member.cannot_eat) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-sm text-red-600 mt-1">🚫 No puede comer: <span class="font-medium">${escape_html(member.cannot_eat)}</span></p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (member.likes) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-sm text-green-600 mt-1">👍 Le gusta: <span class="font-medium">${escape_html(member.likes)}</span></p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (member.dislikes) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-sm text-orange-500 mt-1">👎 No le gusta: <span class="font-medium">${escape_html(member.dislikes)}</span></p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="text-center py-12 text-gray-400">No hay miembros. Añade los miembros de tu familia.</div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
