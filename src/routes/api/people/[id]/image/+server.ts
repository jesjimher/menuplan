import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { getPersonById, getPersonImageData, setPersonImage, clearPersonImage } from '$lib/server/people.js';
import { parsePersonId } from '../parseId.js';
import type { RequestHandler } from './$types.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
// La foto solo se muestra como avatar: un cuadrado pequeño basta
const AVATAR_SIZE = 256;
const WEBP_QUALITY = 82;

export const GET: RequestHandler = async ({ params, request }) => {
	const result = getPersonImageData(parsePersonId(params.id));
	if (!result) throw error(404, 'No image');
	const etag = `"${createHash('sha1').update(result.data).digest('base64url')}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { ETag: etag } });
	}
	const body = new Uint8Array(result.data.buffer as ArrayBuffer, result.data.byteOffset, result.data.byteLength);
	// Revalidación con ETag en cada uso (304 barato): así un cambio de foto se ve al momento
	return new Response(body, {
		headers: { 'Content-Type': result.type, 'Cache-Control': 'no-cache', ETag: etag }
	});
};

// Recibe el recorte de la cara (multipart, campo "file") hecho en el cliente con PhotoCropper,
// que además lo reduce: adapter-node limita el cuerpo a 512 KB por defecto.
export const POST: RequestHandler = async ({ params, request }) => {
	const id = parsePersonId(params.id);
	if (!getPersonById(id)) throw error(404, 'Persona no encontrada');

	let file: FormDataEntryValue | null;
	try {
		file = (await request.formData()).get('file');
	} catch {
		throw error(400, 'Se esperaba un formulario con el campo "file"');
	}
	if (!(file instanceof File)) throw error(400, 'Falta el fichero');
	if (file.size > MAX_IMAGE_BYTES) throw error(413, 'Imagen demasiado grande (máx. 10 MB)');

	let processed: Buffer;
	try {
		processed = await sharp(Buffer.from(await file.arrayBuffer()))
			.rotate() // respeta la orientación EXIF
			// El cliente ya envía el recorte de la cara; esto solo garantiza el cuadrado
			.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
			.webp({ quality: WEBP_QUALITY })
			.toBuffer();
	} catch {
		throw error(400, 'El fichero no es una imagen válida');
	}

	setPersonImage(id, processed, 'image/webp');
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params }) => {
	clearPersonImage(parsePersonId(params.id));
	return new Response(null, { status: 204 });
};
