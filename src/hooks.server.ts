import type { Handle, HandleServerError } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	const reqId = crypto.randomUUID().slice(0, 8);
	console.error(`[${new Date().toISOString()}] [${reqId}] Error en ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Error interno del servidor', status: 500 };
};
