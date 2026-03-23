import { error } from '@sveltejs/kit';
import { getRecipeImageData, setRecipeImage, clearRecipeImage } from '$lib/server/recipes.js';

export async function GET({ params }) {
	const result = getRecipeImageData(parseInt(params.id));
	if (!result) throw error(404, 'No image');
	return new Response(result.data, {
		headers: { 'Content-Type': result.type, 'Cache-Control': 'public, max-age=31536000' }
	});
}

export async function POST({ params, request }) {
	const { url } = await request.json() as { url: string };
	if (!url) throw error(400, 'Missing url');

	const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
	if (!res.ok) throw error(502, 'Failed to fetch image');

	const contentType = res.headers.get('content-type') || 'image/jpeg';
	const mimeType = contentType.split(';')[0].trim();
	if (!mimeType.startsWith('image/')) throw error(400, 'Not an image');

	const buffer = Buffer.from(await res.arrayBuffer());
	setRecipeImage(parseInt(params.id), buffer, mimeType);
	return new Response(null, { status: 204 });
}

export async function DELETE({ params }) {
	clearRecipeImage(parseInt(params.id));
	return new Response(null, { status: 204 });
}
