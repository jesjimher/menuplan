export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.json","service-worker.js"]),
	mimeTypes: {".png":"image/png",".json":"application/json"},
	_: {
		client: {start:"_app/immutable/entry/start.BzKYyu4A.js",app:"_app/immutable/entry/app.NJ_sBQOK.js",imports:["_app/immutable/entry/start.BzKYyu4A.js","_app/immutable/chunks/wAqRnE74.js","_app/immutable/chunks/njN3d8NC.js","_app/immutable/chunks/Bi2_sBYq.js","_app/immutable/entry/app.NJ_sBQOK.js","_app/immutable/chunks/njN3d8NC.js","_app/immutable/chunks/mHezzkJO.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/Cv1G_hhs.js","_app/immutable/chunks/BsLo2we-.js","_app/immutable/chunks/Bi2_sBYq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js')),
			__memo(() => import('./nodes/8.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/history",
				pattern: /^\/api\/history\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/history/_server.ts.js'))
			},
			{
				id: "/api/members",
				pattern: /^\/api\/members\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/members/_server.ts.js'))
			},
			{
				id: "/api/members/[id]",
				pattern: /^\/api\/members\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/members/_id_/_server.ts.js'))
			},
			{
				id: "/api/options",
				pattern: /^\/api\/options\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/options/_server.ts.js'))
			},
			{
				id: "/api/recipes",
				pattern: /^\/api\/recipes\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/recipes/_server.ts.js'))
			},
			{
				id: "/api/recipes/[id]",
				pattern: /^\/api\/recipes\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/recipes/_id_/_server.ts.js'))
			},
			{
				id: "/api/rules",
				pattern: /^\/api\/rules\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/rules/_server.ts.js'))
			},
			{
				id: "/api/rules/[id]",
				pattern: /^\/api\/rules\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/rules/_id_/_server.ts.js'))
			},
			{
				id: "/api/week",
				pattern: /^\/api\/week\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/_server.ts.js'))
			},
			{
				id: "/api/week/assign",
				pattern: /^\/api\/week\/assign\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/assign/_server.ts.js'))
			},
			{
				id: "/api/week/calculate-slot",
				pattern: /^\/api\/week\/calculate-slot\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/calculate-slot/_server.ts.js'))
			},
			{
				id: "/api/week/calculate",
				pattern: /^\/api\/week\/calculate\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/calculate/_server.ts.js'))
			},
			{
				id: "/api/week/clear",
				pattern: /^\/api\/week\/clear\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/clear/_server.ts.js'))
			},
			{
				id: "/api/week/config",
				pattern: /^\/api\/week\/config\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/config/_server.ts.js'))
			},
			{
				id: "/api/week/copy-previous",
				pattern: /^\/api\/week\/copy-previous\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/copy-previous/_server.ts.js'))
			},
			{
				id: "/api/week/remove",
				pattern: /^\/api\/week\/remove\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./entries/endpoints/api/week/remove/_server.ts.js'))
			},
			{
				id: "/history",
				pattern: /^\/history\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/members",
				pattern: /^\/members\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/options",
				pattern: /^\/options\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/recipes",
				pattern: /^\/recipes\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/rules",
				pattern: /^\/rules\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/week",
				pattern: /^\/week\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 8 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
