export function getWeekKey(date: Date = new Date()): string {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function getPreviousWeekKey(weekKey: string): string {
	const [year, weekStr] = weekKey.split('-W');
	let weekNum = parseInt(weekStr) - 1;
	let yearNum = parseInt(year);

	if (weekNum < 1) {
		yearNum--;
		weekNum = 52; // approximate
	}

	return `${yearNum}-W${String(weekNum).padStart(2, '0')}`;
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
