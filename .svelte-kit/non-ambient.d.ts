
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/history" | "/api/members" | "/api/members/[id]" | "/api/options" | "/api/recipes" | "/api/recipes/[id]" | "/api/rules" | "/api/rules/[id]" | "/api/week" | "/api/week/assign" | "/api/week/calculate-slot" | "/api/week/calculate" | "/api/week/clear" | "/api/week/config" | "/api/week/copy-previous" | "/api/week/remove" | "/history" | "/members" | "/options" | "/recipes" | "/rules" | "/week";
		RouteParams(): {
			"/api/members/[id]": { id: string };
			"/api/recipes/[id]": { id: string };
			"/api/rules/[id]": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string };
			"/api": { id?: string };
			"/api/history": Record<string, never>;
			"/api/members": { id?: string };
			"/api/members/[id]": { id: string };
			"/api/options": Record<string, never>;
			"/api/recipes": { id?: string };
			"/api/recipes/[id]": { id: string };
			"/api/rules": { id?: string };
			"/api/rules/[id]": { id: string };
			"/api/week": Record<string, never>;
			"/api/week/assign": Record<string, never>;
			"/api/week/calculate-slot": Record<string, never>;
			"/api/week/calculate": Record<string, never>;
			"/api/week/clear": Record<string, never>;
			"/api/week/config": Record<string, never>;
			"/api/week/copy-previous": Record<string, never>;
			"/api/week/remove": Record<string, never>;
			"/history": Record<string, never>;
			"/members": Record<string, never>;
			"/options": Record<string, never>;
			"/recipes": Record<string, never>;
			"/rules": Record<string, never>;
			"/week": Record<string, never>
		};
		Pathname(): "/" | "/api/history" | "/api/members" | `/api/members/${string}` & {} | "/api/options" | "/api/recipes" | `/api/recipes/${string}` & {} | "/api/rules" | `/api/rules/${string}` & {} | "/api/week" | "/api/week/assign" | "/api/week/calculate-slot" | "/api/week/calculate" | "/api/week/clear" | "/api/week/config" | "/api/week/copy-previous" | "/api/week/remove" | "/history" | "/members" | "/options" | "/recipes" | "/rules" | "/week";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/icons/icon-192.png" | "/icons/icon-512.png" | "/icons/icon-maskable-512.png" | "/manifest.json" | string & {};
	}
}