<script lang="ts">
	let {
		value = $bindable(''),
		tags = [],
		placeholder = '',
		multiple = true,
		onchange
	}: {
		value?: string;
		tags?: string[];
		placeholder?: string;
		multiple?: boolean;
		onchange?: (value: string) => void;
	} = $props();

	let inputText = $state('');
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | undefined>(undefined);

	let selectedTags = $derived(
		value ? value.split(',').map(t => t.trim()).filter(Boolean) : []
	);

	let filtered = $derived(
		tags.filter(t =>
			!selectedTags.includes(t) &&
			(!inputText || t.toLowerCase().includes(inputText.toLowerCase()))
		)
	);
	let suggestions = $derived(filtered.slice(0, 10));
	let total = $derived(filtered.length);

	let canAdd = $derived(multiple || selectedTags.length === 0);

	function addTag(raw: string) {
		const tag = raw.trim().toLowerCase();
		if (!tag) return;
		let next: string[];
		if (!multiple) {
			next = [tag];
		} else if (selectedTags.includes(tag)) {
			inputText = '';
			open = false;
			return;
		} else {
			next = [...selectedTags, tag];
		}
		value = next.join(',');
		inputText = '';
		open = false;
		onchange?.(value);
	}

	function removeTag(tag: string) {
		const next = selectedTags.filter(t => t !== tag);
		value = next.join(',');
		onchange?.(value);
		setTimeout(() => inputEl?.focus(), 0);
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ',') && inputText.trim()) {
			e.preventDefault();
			addTag(inputText);
		} else if (e.key === 'Backspace' && !inputText && selectedTags.length > 0) {
			removeTag(selectedTags[selectedTags.length - 1]);
		}
	}

	function handleBlur() {
		setTimeout(() => {
			if (inputText.trim()) addTag(inputText);
			open = false;
		}, 150);
	}
</script>

<div class="relative">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="flex flex-wrap items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-text min-h-[42px]"
		style="border: 1px solid var(--border); background: var(--surface);"
		onclick={() => { if (canAdd) inputEl?.focus(); }}
		role="none"
	>
		{#each selectedTags as tag}
			<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
				style="background: var(--surface-warm); color: var(--text); border: 1px solid var(--border);">
				{tag}
				<button type="button" onclick={(e) => { e.stopPropagation(); removeTag(tag); }}
					class="rounded-full transition-opacity hover:opacity-60 leading-none text-sm"
					style="color: var(--text-secondary);">×</button>
			</span>
		{/each}
		{#if canAdd}
			<input
				bind:this={inputEl}
				bind:value={inputText}
				type="text"
				placeholder={selectedTags.length === 0 ? placeholder : ''}
				class="flex-1 min-w-[80px] bg-transparent text-sm outline-none py-0.5"
				style="color: var(--text);"
				role="combobox"
				aria-expanded={open && suggestions.length > 0}
				aria-autocomplete="list"
				oninput={() => open = true}
				onfocus={() => open = true}
				onblur={handleBlur}
				onkeydown={handleKeydown}
			/>
		{/if}
	</div>

	{#if open && suggestions.length > 0}
		<ul class="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-lg shadow-lg overflow-hidden text-sm"
			style="background: var(--surface); border: 1px solid var(--border);"
			role="listbox">
			{#each suggestions as tag}
				<li role="option">
					<button type="button"
						class="suggestion-item w-full text-left px-3 py-1.5 truncate"
						style="color: var(--text);"
						onmousedown={(e) => { e.preventDefault(); addTag(tag); }}
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
