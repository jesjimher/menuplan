import { error } from '@sveltejs/kit';
import { z } from 'zod';

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Body JSON inválido');
	}
	const result = schema.safeParse(raw);
	if (!result.success) {
		const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
		throw error(400, msg);
	}
	return result.data;
}
