<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let value: string = '';
	export let tags: string[] = [];
	export let placeholder: string = '';
	let cls = '';
	export { cls as class };

	const dispatch = createEventDispatcher<{ change: string }>();

	let open = false;

	$: lastPart = value.includes(',') ? value.split(',').pop()!.trimStart() : value;
	$: displayed = tags
		.filter(t => !lastPart || t.toLowerCase().includes(lastPart.toLowerCase()))
		.slice(0, 10);
	$: total = tags.filter(t => !lastPart || t.toLowerCase().includes(lastPart.toLowerCase())).length;

	function select(tag: string) {
		const parts = value.split(',');
		parts[parts.length - 1] = tag;
		value = parts.join(',');
		open = false;
		dispatch('change', value);
	}

	function handleBlur() {
		setTimeout(() => { open = false; }, 150);
		dispatch('change', value);
	}
</script>

<div class="relative w-full">
	<input
		bind:value
		type="text"
		{placeholder}
		class={cls}
		on:input={() => open = true}
		on:focus={() => open = true}
		on:blur={handleBlur}
		on:keydown
	/>
	{#if open && displayed.length > 0}
		<ul class="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-lg shadow-lg overflow-hidden text-sm"
			style="background: var(--surface); border: 1px solid var(--border);">
			{#each displayed as tag}
				<li>
					<button
						type="button"
						class="w-full text-left px-3 py-1.5 truncate"
						style="color: var(--text);"
						on:mousedown|preventDefault={() => select(tag)}
						on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
						on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
					>{tag}</button>
				</li>
			{/each}
			{#if total > 10}
				<li class="px-3 py-1.5 text-xs italic" style="color: var(--text-muted);">... y {total - 10} más</li>
			{/if}
		</ul>
	{/if}
</div>
