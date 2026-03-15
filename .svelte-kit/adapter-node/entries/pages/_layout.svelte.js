import { g as getContext, s as store_get, a as attr_class, e as ensure_array_like, b as stringify, c as slot, u as unsubscribe_stores } from "../../chunks/index3.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
import { a as attr, e as escape_html } from "../../chunks/attributes.js";
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let currentPath;
    const navItems = [
      { href: "/week", label: "Semana", icon: "📅" },
      { href: "/recipes", label: "Recetas", icon: "🍳" },
      { href: "/members", label: "Miembros", icon: "👥" },
      { href: "/rules", label: "Reglas", icon: "📋" },
      { href: "/history", label: "Histórico", icon: "📚" },
      { href: "/options", label: "Opciones", icon: "⚙️" }
    ];
    currentPath = store_get($$store_subs ??= {}, "$page", page).url.pathname;
    $$renderer2.push(`<div class="flex h-screen bg-gray-50 overflow-hidden">`);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <aside${attr_class(`fixed inset-y-0 left-0 z-30 w-64 bg-indigo-700 text-white transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${stringify("-translate-x-full")}`)}><div class="flex items-center justify-between h-16 px-4 bg-indigo-800"><span class="text-xl font-bold">MenuPlan</span> <button class="lg:hidden text-white">✕</button></div> <nav class="mt-4 px-2"><!--[-->`);
    const each_array = ensure_array_like(navItems);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<a${attr("href", item.href)}${attr_class(`flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors ${stringify(currentPath.startsWith(item.href) ? "bg-indigo-900 text-white" : "text-indigo-100 hover:bg-indigo-600")}`)}><span>${escape_html(item.icon)}</span> <span>${escape_html(item.label)}</span></a>`);
    }
    $$renderer2.push(`<!--]--></nav></aside> <div class="flex-1 flex flex-col min-w-0 overflow-hidden"><header class="flex items-center h-16 px-4 bg-white border-b border-gray-200 lg:hidden"><button class="text-gray-500 hover:text-gray-700"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button> <span class="ml-3 text-lg font-semibold text-gray-800">MenuPlan</span></header> <main class="flex-1 overflow-auto"><!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--></main></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
