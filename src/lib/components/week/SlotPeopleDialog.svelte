<script lang="ts">
	// Diálogo para cambiar para quién es la receta de un hueco. Los cambios se aplican al momento.
	import type { Person } from '$lib/types/index.js';
	import PeopleSelector from '$lib/components/people/PeopleSelector.svelte';

	let { recipeName, people, value, allLabel = 'Todos', hint, onchange, onClose }: {
		recipeName: string;
		people: Person[];
		value: number[];
		allLabel?: string;
		hint?: string;
		onchange: (ids: number[]) => void;
		onClose: () => void;
	} = $props();
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4" style="background: rgba(0,0,0,0.35);"
	on:click={(e) => { if (e.target === e.currentTarget) onClose(); }}>
	<div class="w-full max-w-sm rounded-2xl p-5 space-y-4" role="dialog" aria-modal="true" aria-label="Para quién"
		style="background: var(--surface); box-shadow: 0 12px 40px rgba(0,0,0,0.25);">
		<div>
			<h2 class="text-base font-black" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">¿Para quién?</h2>
			<p class="text-sm truncate" style="color: var(--text-secondary);">{recipeName}</p>
		</div>
		<PeopleSelector {people} {value} {onchange} size={32} {allLabel} />
		{#if hint}<p class="text-xs" style="color: var(--text-muted);">{hint}</p>{/if}
		<div class="flex justify-end">
			<button on:click={onClose} class="px-4 py-2 rounded-xl text-sm font-bold" style="background: var(--primary); color: white;">Listo</button>
		</div>
	</div>
</div>
