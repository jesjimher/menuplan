export function getWeekKey(date: Date = new Date()): string {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function indexToWeekKey(idx: number): string {
	const monday = new Date(idx * 7 * 24 * 60 * 60 * 1000);
	return getWeekKey(monday);
}

export function getPreviousWeekKey(weekKey: string): string {
	return indexToWeekKey(weekKeyToIndex(weekKey) - 1);
}

export function getWeekDates(weekKey: string): Date[] {
	const [year, weekStr] = weekKey.split('-W');
	const weekNum = parseInt(weekStr);
	const yearNum = parseInt(year);

	// Get the Monday of week weekNum
	const jan4 = new Date(Date.UTC(yearNum, 0, 4));
	const startOfYear = new Date(jan4);
	startOfYear.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));

	const monday = new Date(startOfYear);
	monday.setUTCDate(startOfYear.getUTCDate() + (weekNum - 1) * 7);

	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(monday);
		d.setUTCDate(monday.getUTCDate() + i);
		return d;
	});
}

export const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const SHORT_MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function weekdayDateFromWeekKey(weekKey: string, weekday: number): Date {
	return getWeekDates(weekKey)[weekday - 1];
}

export function formatShortDate(date: Date): string {
	const day = date.getUTCDate();
	const month = SHORT_MONTH_NAMES[date.getUTCMonth()];
	const year = date.getUTCFullYear();
	const thisYear = new Date().getUTCFullYear();
	return year === thisYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

export function computeNextOccurrenceWeekKey(
	anchorWeekKey: string,
	everyNWeeks: number,
	exceptions: string[]
): string | null {
	const anchorIdx = weekKeyToIndex(anchorWeekKey);
	const todayIdx = weekKeyToIndex(getWeekKey());
	const diff = todayIdx - anchorIdx;
	const n = Math.max(0, Math.ceil((diff + 1) / everyNWeeks));
	for (let i = 0; i < 200; i++) {
		const wk = indexToWeekKey(anchorIdx + (n + i) * everyNWeeks);
		if (!exceptions.includes(wk)) return wk;
	}
	return null;
}

export function weekKeyToIndex(weekKey: string): number {
	const [year, weekStr] = weekKey.split('-W');
	const weekNum = parseInt(weekStr);
	const yearNum = parseInt(year);
	const jan4 = new Date(Date.UTC(yearNum, 0, 4));
	const startOfYear = new Date(jan4);
	startOfYear.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1));
	const monday = new Date(startOfYear);
	monday.setUTCDate(startOfYear.getUTCDate() + (weekNum - 1) * 7);
	return Math.round(monday.getTime() / (7 * 24 * 60 * 60 * 1000));
}
