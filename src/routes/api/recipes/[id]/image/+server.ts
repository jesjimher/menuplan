import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { getRecipeImageData, setRecipeImage, clearRecipeImage } from '$lib/server/recipes.js';
import { validateImageUrl } from '$lib/utils/validateImageUrl.js';
import type { RequestHandler } from './$types.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_DIMENSION = 800;
const WEBP_QUALITY = 80;

function parseRecipeId(raw: string): number {
	const id = parseInt(raw);
	if (!Number.isInteger(id) || id < 1) throw error(400, 'id de receta inválido');
	return id;
}

export const GET: RequestHandler = async ({ params, request }) => {
	const result = getRecipeImageData(parseRecipeId(params.id));
	if (!result) throw error(404, 'No image');
	const etag = `"${createHash('sha1').update(result.data).digest('base64url')}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { ETag: etag } });
	}
	const body = new Uint8Array(result.data.buffer as ArrayBuffer, result.data.byteOffset, result.data.byteLength);
	return new Response(body, {
		headers: { 'Content-Type': result.type, 'Cache-Control': 'public, max-age=31536000', ETag: etag }
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { url } = await request.json() as { url: string };
	if (!url) throw error(400, 'Falta el campo url');

	validateImageUrl(url); // lanza 400 si la URL es inválida o apunta a red privada

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	let res: Response;
	try {
		res = await fetch(url, {
			signal: controller.signal,
			headers: { 'User-Agent': 'Mozilla/5.0' }
		});
	} catch (e: unknown) {
		if (e instanceof Error && e.name === 'AbortError') throw error(504, 'Timeout al descargar imagen');
		throw error(502, 'Error al descargar imagen');
	} finally {
		clearTimeout(timeout);
	}

	if (!res.ok) throw error(502, 'Error al descargar imagen');

	const contentType = res.headers.get('content-type') || 'image/jpeg';
	const mimeType = contentType.split(';')[0].trim();
	if (!mimeType.startsWith('image/')) throw error(400, 'La URL no apunta a una imagen');

	// Leer con límite de tamaño
	const reader = res.body?.getReader();
	if (!reader) throw error(502, 'Respuesta sin cuerpo');
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.length;
			if (total > MAX_IMAGE_BYTES) {
				reader.cancel();
				throw error(413, 'Imagen demasiado grande (máx. 10 MB)');
			}
			chunks.push(value);
		}
	}
	const buffer = Buffer.concat(chunks);

	// Redimensionar y recomprimir: las recetas se muestran como miniaturas,
	// no tiene sentido guardar el original completo en la BD.
	let processed: Buffer;
	try {
		processed = await sharp(buffer)
			.rotate() // respeta la orientación EXIF
			.resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: WEBP_QUALITY })
			.toBuffer();
	} catch {
		throw error(400, 'La imagen descargada no es válida');
	}

	setRecipeImage(parseRecipeId(params.id), processed, 'image/webp');
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params }) => {
	clearRecipeImage(parseRecipeId(params.id));
	return new Response(null, { status: 204 });
};
