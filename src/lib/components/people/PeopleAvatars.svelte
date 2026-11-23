<script lang="ts">
	// Pila de mini fotos de las personas de una receta (solapadas). Sin personas = para todos:
	// icono de grupo (o nada si `showEveryone` es false o no hay personas dadas de alta).
	import type { Person } from '$lib/types/index.js';
	import PersonAvatar from './PersonAvatar.svelte';

	let { people, ids, size = 20, max = 4, showEveryone = true }: {
		people: Person[];
		ids: number[];
		size?: number;
		max?: number;
		showEveryone?: boolean;
	} = $props();

	let shown = $derived(people.filter(p => ids.includes(p.id)));
	let names = $derived(shown.map(p => p.name).join(', '));
</script>

{#if shown.length > 0}
	<span class="inline-flex items-center" title="Para: {names}" aria-label="Para: {names}">
		{#each shown.slice(0, max) as person, i}
			<span style="margin-left: {i === 0 ? 0 : -size * 0.3}px; z-index: {max - i};" class="relative inline-flex">
				<PersonAvatar {person} {size} title={names} />
			</span>
		{/each}
		{#if shown.length > max}
			<span class="relative inline-flex items-center justify-center rounded-full text-[9px] font-black"
				style="margin-left: {-size * 0.3}px; width: {size}px; height: {size}px; background: var(--surface-container-highest); color: var(--text-secondary); box-shadow: 0 0 0 1.5px white;">
				+{shown.length - max}
			</span>
		{/if}
	</span>
{:else if showEveryone && people.length > 0}
	<span class="everyone inline-flex items-center justify-center rounded-full shrink-0"
		style="width: {size}px; height: {size}px;"
		title="Para todos" aria-label="Para todos">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
			style="width: {size * 0.62}px; height: {size * 0.62}px;">
			<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
		</svg>
	</span>
{/if}

<style>
	.everyone {
		background: var(--surface-container-highest);
		color: var(--text-secondary);
		box-shadow: 0 0 0 1.5px white, 0 1px 3px rgba(0, 0, 0, 0.25);
	}
</style>
