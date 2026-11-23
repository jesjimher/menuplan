<script lang="ts">
	// Selector de para quién es algo: «Todos» (lista vacía) o una o varias personas.
	import type { Person } from '$lib/types/index.js';
	import PersonAvatar from './PersonAvatar.svelte';

	let { people, value, onchange, size = 28, allLabel = 'Todos' }: {
		people: Person[];
		value: number[];
		onchange: (ids: number[]) => void;
		size?: number;
		allLabel?: string;
	} = $props();

	function toggle(id: number) {
		const next = value.includes(id) ? value.filter(v => v !== id) : [...value, id];
		// Mantener el orden de visualización de las personas
		onchange(people.filter(p => next.includes(p.id)).map(p => p.id));
	}
</script>

<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Para quién">
	<button type="button"
		on:click|stopPropagation={() => onchange([])}
		class="chip px-2.5 rounded-full text-xs font-bold transition-colors"
		class:active={value.length === 0}
		style="height: {size}px;"
		aria-pressed={value.length === 0}
	>{allLabel}</button>
	{#each people as person (person.id)}
		{@const active = value.includes(person.id)}
		<button type="button"
			on:click|stopPropagation={() => toggle(person.id)}
			class="chip inline-flex items-center gap-1.5 pl-0.5 pr-2.5 rounded-full text-xs font-bold transition-colors"
			class:active
			style="height: {size}px;"
			aria-pressed={active}
		>
			<span class:dim={!active}><PersonAvatar {person} size={size - 4} ring={false} /></span>
			{person.name}
		</button>
	{/each}
</div>

<style>
	.chip {
		background: var(--surface-container);
		color: var(--text-secondary);
		border: 1.5px solid transparent;
	}
	.chip:hover { background: var(--surface-container-highest); }
	.chip.active {
		background: var(--primary-light);
		color: var(--primary);
		border-color: var(--primary);
	}
	.dim { opacity: 0.55; filter: grayscale(0.6); }
</style>
