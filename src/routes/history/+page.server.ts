import { getHistory } from '$lib/server/weekplan.js';

export function load() {
	return {
		history: getHistory()
	};
}
