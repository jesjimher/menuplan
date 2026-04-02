<script lang="ts">
	let {
		value = $bindable(''),
		tags = [],
		placeholder = '',
		class: cls = '',
		onchange,
		onkeydown
	}: {
		value?: string;
		tags?: string[];
		placeholder?: string;
		class?: string;
		onchange?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();

	let open = $state(false);

	let lastPart = $derived(
		value.includes(',') ? value.split(',').pop()!.trimStart() : value
	);
	let displayed = $derived(
		tags.filter(t => !lastPart || t.toLowerCase().includes(lastPart.toLowerCase())).slice(0, 10)
	);
	let total = $derived(
		tags.filter(t => !lastPart || t.toLowerCase().includes(lastPart.toLowerCase())).length
	);

	function select(tag: string) {
		const parts = value.split(',');
		parts[parts.length - 1] = tag;
		value = parts.join(',');
		open = false;
		onchange?.(value);
	}

	function handleBlur() {
		setTimeout(() => { open = false; }, 150);
		onchange?.(value);
	}
</script>

<div class="relative w-full">
	<input
		bind:value
		type="text"
		{placeholder}
		class={cls}
		role="combobox"
		aria-expanded={open && displayed.length > 0}
		aria-autocomplete="list"
		oninput={() => open = true}
		onfocus={() => open = true}
		onblur={handleBlur}
		onkeydown={onkeydown}
	/>
	{#if open && displayed.length > 0}
		<ul class="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-lg shadow-lg overflow-hidden text-sm"
			style="background: var(--surface); border: 1px solid var(--border);"
			role="listbox">
			{#each displayed as tag}
				<li role="option">
					<button
						type="button"
						class="suggestion-item w-full text-left px-3 py-1.5 truncate"
						style="color: var(--text);"
						onmousedown={(e) => { e.preventDefault(); select(tag); }}
					>{tag}</button>
				</li>
			{/each}
			{#if total > 10}
				<li class="px-3 py-1.5 text-xs italic" style="color: var(--text-muted);">... y {total - 10} más</li>
			{/if}
		</ul>
	{/if}
</div>

<style>
	.suggestion-item:hover {
		background: var(--surface-warm);
	}
</style>
