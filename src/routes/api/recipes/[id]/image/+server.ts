import { error } from '@sveltejs/kit';
import { getRecipeImageData, setRecipeImage, clearRecipeImage } from '$lib/server/recipes.js';
import { validateImageUrl } from '$lib/utils/validateImageUrl.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 10_000;

export async function GET({ params }) {
	const result = getRecipeImageData(parseInt(params.id));
	if (!result) throw error(404, 'No image');
	return new Response(result.data, {
		headers: { 'Content-Type': result.type, 'Cache-Control': 'public, max-age=31536000' }
	});
}

export async function POST({ params, request }) {
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

	setRecipeImage(parseInt(params.id), buffer, mimeType);
	return new Response(null, { status: 204 });
}

export async function DELETE({ params }) {
	clearRecipeImage(parseInt(params.id));
	return new Response(null, { status: 204 });
}
