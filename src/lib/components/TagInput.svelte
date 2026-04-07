<script lang="ts">
	let {
		value = $bindable(''),
		tags = [],
		placeholder = '',
		autofocus = false,
		class: cls = '',
		onchange,
		onkeydown: onKeydownProp
	}: {
		value?: string;
		tags?: string[];
		placeholder?: string;
		autofocus?: boolean;
		class?: string;
		onkeydown?: (e: KeyboardEvent) => void;
		onchange?: (value: string) => void;
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
	let activeIndex = $state(-1);
	let listEl: HTMLUListElement | null = null;

	let displayed = $derived(
		tags.filter(t => !value || t.toLowerCase().includes(value.toLowerCase()))
	);

	$effect(() => {
		const idx = activeIndex;
		if (idx < 0 || !listEl) return;
		(listEl.querySelectorAll('li')[idx] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
	});

	function select(tag: string) {
		value = tag;
		open = false;
		activeIndex = -1;
		onchange?.(tag);
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
		oninput={() => { open = true; activeIndex = -1; }}
		onfocus={() => open = true}
		onblur={handleBlur}
		onkeydown={handleKeydown}
	/>
	{#if open && displayed.length > 0}
		<ul bind:this={listEl} use:smartPosition
			class="z-[9999] rounded-lg shadow-lg overflow-y-auto text-sm"
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
