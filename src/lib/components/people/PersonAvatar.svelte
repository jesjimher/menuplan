<script lang="ts">
	// Mini foto redonda de una persona; sin foto, silueta genérica.
	import type { Person } from '$lib/types/index.js';

	let { person, size = 20, ring = true, title }: {
		person: Person;
		size?: number;
		ring?: boolean;
		title?: string;
	} = $props();

	let failed = $state(false);
	// image_type cambia de null a valor al subir la primera foto; el resto de cambios los
	// recoge la revalidación por ETag del endpoint (Cache-Control: no-cache)
	let src = $derived(person.image_type ? `/api/people/${person.id}/image` : null);
</script>

<span class="avatar inline-flex items-center justify-center rounded-full overflow-hidden shrink-0"
	class:ring
	style="width: {size}px; height: {size}px;"
	title={title ?? person.name}>
	{#if src && !failed}
		<img {src} alt={person.name} class="w-full h-full object-cover" loading="lazy" decoding="async"
			on:error={() => failed = true} />
	{:else}
		<svg viewBox="0 0 24 24" class="w-full h-full" aria-label={person.name} role="img">
			<rect width="24" height="24" fill="var(--surface-container-highest)" />
			<circle cx="12" cy="9.5" r="4" fill="var(--text-muted)" />
			<path d="M4 22c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z" fill="var(--text-muted)" />
		</svg>
	{/if}
</span>

<style>
	.avatar { background: var(--surface); }
	.ring { box-shadow: 0 0 0 1.5px white, 0 1px 3px rgba(0,0,0,0.35); }
</style>
