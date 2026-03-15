import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.BEFOV9iL.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/BYkA5FM4.js","_app/immutable/chunks/njN3d8NC.js","_app/immutable/chunks/wAqRnE74.js","_app/immutable/chunks/Bi2_sBYq.js"];
export const stylesheets = [];
export const fonts = [];
