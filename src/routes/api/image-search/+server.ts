import { json, error } from '@sveltejs/kit';

export async function GET({ url }) {
	const q = url.searchParams.get('q') || '';
	if (!q.trim()) return json([]);

	// Step 1: get vqd token from DuckDuckGo
	const homeRes = await fetch(
		`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
		{ headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }
	);
	const html = await homeRes.text();
	const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
	if (!vqdMatch) throw error(502, 'Could not get search token');
	const vqd = vqdMatch[1];

	// Step 2: get image results
	const imgRes = await fetch(
		`https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&vqd=${encodeURIComponent(vqd)}&o=json&p=1&s=0&f=,,,,,`,
		{
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Referer': 'https://duckduckgo.com/'
			}
		}
	);

	if (!imgRes.ok) throw error(502, 'Image search failed');

	const data = await imgRes.json() as { results?: { image: string; thumbnail: string; title: string; width: number; height: number }[] };
	const results = (data.results || []).slice(0, 30).map(r => ({
		url: r.image,
		thumbnail: r.thumbnail,
		title: r.title,
	}));

	return json(results);
}
