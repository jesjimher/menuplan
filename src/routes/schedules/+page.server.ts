import { getAllSchedules } from '$lib/server/schedules.js';

export function load() {
	return {
		schedules: getAllSchedules()
	};
}
