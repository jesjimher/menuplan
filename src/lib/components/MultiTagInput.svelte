<script lang="ts">
	let {
		value = $bindable(''),
		tags = [],
		placeholder = '',
		class: cls = '',
		onchange,
		onkeydown: onKeydownProp
	}: {
		value?: string;
		tags?: string[];
		placeholder?: string;
		class?: string;
		onchange?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();

	let open = $state(false);
	let activeIndex = $state(-1);
	let listEl: HTMLUListElement | null = null;

	let lastPart = $derived(
		value.includes(',') ? value.split(',').pop()!.trimStart() : value
	);
	let displayed = $derived(
		tags.filter(t => !lastPart || t.toLowerCase().includes(lastPart.toLowerCase()))
	);

	$effect(() => {
		const idx = activeIndex;
		if (idx < 0 || !listEl) return;
		(listEl.querySelectorAll('li')[idx] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
	});

	function select(tag: string) {
		const parts = value.split(',');
		parts[parts.length - 1] = tag;
		value = parts.join(',');
		open = false;
		activeIndex = -1;
		onchange?.(value);
	}

	function handleBlur() {
		setTimeout(() => { open = false; activeIndex = -1; }, 150);
		onchange?.(value);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			open = true;
			activeIndex = Math.min(activeIndex + 1, displayed.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, -1);
		} else if (e.key === 'Enter' && activeIndex >= 0) {
			e.preventDefault();
			select(displayed[activeIndex]);
			return;
		} else {
			onKeydownProp?.(e);
			return;
		}
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
		oninput={() => { open = true; activeIndex = -1; }}
		onfocus={() => open = true}
		onblur={handleBlur}
		onkeydown={handleKeydown}
	/>
	{#if open && displayed.length > 0}
		<ul bind:this={listEl}
			class="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-lg shadow-lg overflow-y-auto text-sm"
			style="background: var(--surface); border: 1px solid var(--border); max-height: 15rem;"
			role="listbox">
			{#each displayed as tag, i}
				<li role="option" aria-selected={activeIndex === i}>
					<button
						type="button"
						class="suggestion-item w-full text-left px-3 py-1.5 truncate"
						style="color: var(--text); {activeIndex === i ? 'background: var(--surface-container);' : ''}"
						onmousedown={(e) => { e.preventDefault(); select(tag); }}
					>{tag}</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.suggestion-item:hover {
		background: var(--surface-container);
	}
</style>
