<script lang="ts">
	// Botones "+ plato" / "+ acomp." bajo los slots de una franja.
	let { class: cls = '', onAddPlato, onAddAcomp }: {
		class?: string;
		onAddPlato: () => void;
		onAddAcomp: () => void;
	} = $props();
</script>

<div class="flex gap-1.5 shrink-0 justify-center {cls}">
	<button
		on:click={onAddPlato}
		class="text-[10px] font-semibold py-1.5 px-3 rounded-lg transition-all hover:opacity-80"
		style="border: 1px dashed var(--border); color: var(--text-muted); background: transparent;"
	>+ plato</button>
	<button
		on:click={onAddAcomp}
		class="text-[10px] font-semibold py-1.5 px-3 rounded-lg transition-all hover:opacity-80"
		style="border: 1px dashed var(--border); color: var(--text-muted); background: transparent;"
	>+ acomp.</button>
</div>
