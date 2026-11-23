import { getHistory } from '$lib/server/weekplan.js';
import { getAllPeople } from '$lib/server/people.js';

export function load() {
	return {
		history: getHistory(),
		// Incluye archivadas: en semanas pasadas pueden aparecer personas que ya no están activas
		people: getAllPeople()
	};
}
