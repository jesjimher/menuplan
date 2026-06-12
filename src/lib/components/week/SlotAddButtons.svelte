<script lang="ts">
	// Botones "+ plato" / "+ acomp." bajo los slots de una franja.
	let { class: cls = '', onAddPlato, onAddAcomp }: {
		class?: string;
		onAddPlato: () => void;
		onAddAcomp: () => void;
	} = $props();
</script>

<div class="flex gap-1.5 shrink-0 justify-center {cls}">
	<button on:click={onAddPlato} class="add-btn">+ plato</button>
	<button on:click={onAddAcomp} class="add-btn">+ acomp.</button>
</div>

<style>
	.add-btn {
		font-size: 10px;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: 0.5rem;
		border: 1px dashed transparent;
		color: var(--text-secondary);
		background: transparent;
		transition: border-color 0.15s, background 0.15s;
	}
	.add-btn:hover {
		border-color: var(--border);
		background: var(--surface);
	}
</style>
