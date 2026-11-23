import { getAllPeople } from '$lib/server/people.js';

export function load() {
	return { people: getAllPeople() };
}
