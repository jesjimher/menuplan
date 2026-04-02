<script lang="ts">
	let {
		value = $bindable(''),
		tags = [],
		placeholder = '',
		autofocus = false,
		class: cls = '',
		onchange,
		onkeydown
	}: {
		value?: string;
		tags?: string[];
		placeholder?: string;
		autofocus?: boolean;
		class?: string;
		onchange?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();

	function focusOnMount(node: HTMLInputElement) {
		if (autofocus) node.focus();
	}

	function smartPosition(node: HTMLElement) {
		node.style.position = 'fixed';
		node.style.width = '';
		node.style.left = '';
		node.style.top = '';

		function reposition() {
			const input = node.closest('.taginput-wrap')?.querySelector('input');
			if (!input) return;
			const rect = input.getBoundingClientRect();
			const listHeight = node.offsetHeight || 200;
			const spaceBelow = window.innerHeight - rect.bottom;

			node.style.width = rect.width + 'px';
			node.style.left = rect.left + 'px';

			if (spaceBelow < listHeight + 8 && rect.top > spaceBelow) {
				node.style.top = (rect.top - listHeight - 2) + 'px';
				node.style.bottom = '';
			} else {
				node.style.top = (rect.bottom + 2) + 'px';
				node.style.bottom = '';
			}
		}
		requestAnimationFrame(reposition);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return {
			destroy() {
				window.removeEventListener('scroll', reposition, true);
				window.removeEventListener('resize', reposition);
			}
		};
	}

	let open = $state(false);

	let displayed = $derived(
		tags.filter(t => !value || t.toLowerCase().includes(value.toLowerCase())).slice(0, 10)
	);
	let total = $derived(
		tags.filter(t => !value || t.toLowerCase().includes(value.toLowerCase())).length
	);

	function select(tag: string) {
		value = tag;
		open = false;
		onchange?.(tag);
	}

	function handleBlur() {
		setTimeout(() => { open = false; }, 150);
		onchange?.(value);
	}
</script>

<div class="taginput-wrap relative">
	<input
		use:focusOnMount
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
		<ul use:smartPosition class="z-[9999] rounded-lg shadow-lg overflow-hidden text-sm"
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
