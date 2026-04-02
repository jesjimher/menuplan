export function parseTags(tags: string): string[] {
	return tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}
