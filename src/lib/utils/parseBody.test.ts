import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseBody } from './parseBody.js';

const schema = z.object({ recipe_id: z.number().int().positive() });
const req = (body: string) => new Request('http://localhost/x', { method: 'POST', body });

describe('parseBody', () => {
	it('devuelve los datos si el body es válido', async () => {
		expect(await parseBody(req('{"recipe_id": 3}'), schema)).toEqual({ recipe_id: 3 });
	});

	it('responde 400 con el campo inválido, no 500', async () => {
		await expect(parseBody(req('{"recipe_id": null}'), schema)).rejects.toMatchObject({
			status: 400,
			body: { message: expect.stringContaining('recipe_id') }
		});
	});

	it('responde 400 si el body no es JSON', async () => {
		await expect(parseBody(req('no json'), schema)).rejects.toMatchObject({ status: 400 });
	});
});
