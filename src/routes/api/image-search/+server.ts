import { json, error } from '@sveltejs/kit';

const SEARCH_TIMEOUT_MS = 8_000;
const VQD_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Caché en memoria del token vqd por query
const vqdCache = new Map<string, { vqd: string; expires: number }>();

function getCachedVqd(q: string): string | null {
	const entry = vqdCache.get(q);
	if (!entry || Date.now() > entry.expires) {
		vqdCache.delete(q);
		return null;
	}
	return entry.vqd;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (e: unknown) {
		if (e instanceof Error && e.name === 'AbortError') throw error(504, 'Timeout en búsqueda de imágenes');
		throw e;
	} finally {
		clearTimeout(timeout);
	}
}

export async function GET({ url }) {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q || q.length > 200) return json([]);

	const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

	let vqd = getCachedVqd(q);

	if (!vqd) {
		const homeRes = await fetchWithTimeout(
			`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
			{ headers: { 'User-Agent': ua } },
			SEARCH_TIMEOUT_MS
		);
		const html = await homeRes.text();
		const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
		if (!vqdMatch) throw error(502, 'No se pudo obtener el token de búsqueda');
		vqd = vqdMatch[1];
		vqdCache.set(q, { vqd, expires: Date.now() + VQD_TTL_MS });
	}

	const imgRes = await fetchWithTimeout(
		`https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&vqd=${encodeURIComponent(vqd)}&o=json&p=1&s=0&f=,,,,,`,
		{ headers: { 'User-Agent': ua, 'Referer': 'https://duckduckgo.com/' } },
		SEARCH_TIMEOUT_MS
	);

	if (!imgRes.ok) {
		// Token expirado — limpiar caché y notificar
		vqdCache.delete(q);
		throw error(502, 'Búsqueda de imágenes fallida');
	}

	const data = await imgRes.json() as { results?: { image: string; thumbnail: string; title: string }[] };
	return json(
		(data.results ?? []).slice(0, 30).map(r => ({ url: r.image, thumbnail: r.thumbnail, title: r.title }))
	);
}
