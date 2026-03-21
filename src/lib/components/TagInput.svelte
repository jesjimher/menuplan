<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let value: string = '';
	export let tags: string[] = [];
	export let placeholder: string = '';
	export let autofocus: boolean = false;
	let cls = '';
	export { cls as class };

	function focusOnMount(node: HTMLInputElement) {
		if (autofocus) node.focus();
	}

	const dispatch = createEventDispatcher<{ change: string }>();

	let open = false;

	$: displayed = tags
		.filter(t => !value || t.toLowerCase().includes(value.toLowerCase()))
		.slice(0, 10);
	$: total = tags.filter(t => !value || t.toLowerCase().includes(value.toLowerCase())).length;

	function select(tag: string) {
		value = tag;
		open = false;
		dispatch('change', tag);
	}

	function handleBlur() {
		setTimeout(() => { open = false; }, 150);
		dispatch('change', value);
	}
</script>

<div class="relative">
	<input
		use:focusOnMount
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
		<ul class="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden text-sm">
			{#each displayed as tag}
				<li>
					<button
						type="button"
						class="w-full text-left px-3 py-1.5 hover:bg-stone-100 text-stone-800 truncate"
						on:mousedown|preventDefault={() => select(tag)}
					>{tag}</button>
				</li>
			{/each}
			{#if total > 10}
				<li class="px-3 py-1.5 text-stone-400 text-xs italic">… y {total - 10} más</li>
			{/if}
		</ul>
	{/if}
</div>
