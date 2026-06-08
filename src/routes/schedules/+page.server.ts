import { getAllSchedules } from '$lib/server/schedules.js';
import { getScheduleResolutionsForWeeks } from '$lib/server/weekplan.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

const SIM_N = 9;

export function load() {
	const baseIdx = weekKeyToIndex(getWeekKey());
	const simWeeks = Array.from({ length: SIM_N }, (_, i) => indexToWeekKey(baseIdx + i));

	return {
		schedules: getAllSchedules(),
		resolutions: getScheduleResolutionsForWeeks(simWeeks)
	};
}
