<script lang="ts">
	// Vista por persona: elige de quién ver la semana (null = de todos).
	import type { Person } from '$lib/types/index.js';
	import PersonAvatar from './PersonAvatar.svelte';

	let { people, value, onchange, size = 28 }: {
		people: Person[];
		value: number | null;
		onchange: (id: number | null) => void;
		size?: number;
	} = $props();
</script>

{#if people.length > 0}
	<div class="flex items-center gap-1" role="group" aria-label="Ver la semana de">
		{#each people as person (person.id)}
			{@const active = value === person.id}
			<button type="button"
				on:click={() => onchange(active ? null : person.id)}
				class="filter-btn rounded-full transition-all"
				class:active
				class:dimmed={value !== null && !active}
				aria-pressed={active}
				title={active ? `Viendo lo de ${person.name} (pulsa para ver todo)` : `Ver solo lo de ${person.name}`}
			><PersonAvatar {person} {size} ring={false} /></button>
		{/each}
	</div>
{/if}

<style>
	.filter-btn {
		padding: 2px;
		border: 2px solid transparent;
	}
	.filter-btn:hover { transform: scale(1.08); }
	.filter-btn.active { border-color: var(--primary); }
	.filter-btn.dimmed { opacity: 0.4; filter: grayscale(0.8); }
</style>
