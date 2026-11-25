import type { Handle, HandleServerError } from '@sveltejs/kit';
import { consolidateSchedules } from '$lib/server/scheduleFreeze.js';

export const handle: Handle = async ({ event, resolve }) => {
	// Guardar en week_plans lo programado para los días ya pasados (no hace nada si ya está al día)
	try {
		consolidateSchedules();
	} catch (e) {
		console.error(`[${new Date().toISOString()}] Error al consolidar programaciones:`, e);
	}
	return resolve(event);
};

export const handleError: HandleServerError = ({ error, event }) => {
	const reqId = crypto.randomUUID().slice(0, 8);
	console.error(`[${new Date().toISOString()}] [${reqId}] Error en ${event.request.method} ${event.url.pathname}:`, error);
	return { message: 'Error interno del servidor', status: 500 };
};
