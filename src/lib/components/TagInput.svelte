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

<div class="taginput-wrap relative">
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
		<ul use:smartPosition class="z-[9999] rounded-lg shadow-lg overflow-hidden text-sm"
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
