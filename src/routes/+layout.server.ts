import { getOptions } from '$lib/server/options.js';

export function load() {
	return {
		options: getOptions()
	};
}