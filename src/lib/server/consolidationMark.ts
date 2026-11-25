// Marca «consolidado hasta»: último día (YYYY-MM-DD) cuyas programaciones ya se guardaron
// como filas de week_plans. Para los días hasta la marca las programaciones dejan de
// resolverse al vuelo: lo que hay en week_plans es definitivo.
import { getDb } from '$lib/db/index.js';
import { weekdayDateKey } from '$lib/utils/dates.js';

const KEY = 'schedules_consolidated_through';

export function getConsolidatedThrough(): string | null {
	const row = getDb().prepare('SELECT value FROM options WHERE key = ?').get(KEY) as { value: string } | undefined;
	return row?.value ?? null;
}

export function setConsolidatedThrough(dateKey: string | null): void {
	if (dateKey === null) getDb().prepare('DELETE FROM options WHERE key = ?').run(KEY);
	else getDb().prepare('INSERT INTO options (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, dateKey);
}

export function isDayConsolidated(weekKey: string, weekday: number, mark: string | null = getConsolidatedThrough()): boolean {
	return mark !== null && weekdayDateKey(weekKey, weekday) <= mark;
}
