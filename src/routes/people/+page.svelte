<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Person } from '$lib/types/index.js';
	import PersonAvatar from '$lib/components/people/PersonAvatar.svelte';
	import PhotoCropper from '$lib/components/people/PhotoCropper.svelte';
	import { sidebarOpen } from '$lib/stores/ui.js';

	let { data } = $props();
	let people = $derived(data.people as Person[]);
	let active = $derived(people.filter(p => !p.archived));
	let archived = $derived(people.filter(p => p.archived));

	let newName = $state('');
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let uploadingId = $state<number | null>(null);
	let errorMsg = $state<string | null>(null);
	// Fuerza la recarga de la foto en esta página tras cambiarla (misma URL)
	let imageVersion = $state<Record<number, number>>({});

	async function api(url: string, init: RequestInit = {}, failMsg = 'Error al guardar'): Promise<boolean> {
		errorMsg = null;
		try {
			const res = await fetch(url, {
				...init,
				headers: init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined
			});
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? failMsg);
			return true;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : failMsg;
			return false;
		}
	}

	async function addPerson() {
		const name = newName.trim();
		if (!name) return;
		if (await api('/api/people', { method: 'POST', body: JSON.stringify({ name }) })) {
			newName = '';
			await invalidateAll();
		}
	}

	function startEdit(p: Person) {
		editingId = p.id;
		editName = p.name;
	}

	async function saveName(p: Person) {
		const name = editName.trim();
		editingId = null;
		if (!name || name === p.name) return;
		if (await api(`/api/people/${p.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })) await invalidateAll();
	}

	async function setArchived(p: Person, value: boolean) {
		if (await api(`/api/people/${p.id}`, { method: 'PATCH', body: JSON.stringify({ archived: value }) })) await invalidateAll();
	}

	async function remove(p: Person) {
		if (!confirm(`¿Borrar a ${p.name}? Las comidas, programaciones y reglas que eran solo para ${p.name} pasarán a ser para todos.\n\nSi solo quieres que deje de aparecer, usa «Archivar».`)) return;
		if (await api(`/api/people/${p.id}`, { method: 'DELETE' })) await invalidateAll();
	}

	async function move(p: Person, delta: -1 | 1) {
		const ids = active.map(x => x.id);
		const i = ids.indexOf(p.id);
		const j = i + delta;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		if (await api('/api/people/reorder', { method: 'POST', body: JSON.stringify({ ids: [...ids, ...archived.map(x => x.id)] }) })) await invalidateAll();
	}

	// Al elegir una foto se abre el recortador; se sube solo el círculo elegido (ya reducido)
	let cropping = $state<{ person: Person; file: File } | null>(null);

	function pickPhoto(p: Person, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) cropping = { person: p, file };
	}

	async function uploadCropped(blob: Blob) {
		if (!cropping) return;
		const p = cropping.person;
		cropping = null;
		uploadingId = p.id;
		try {
			const fd = new FormData();
			fd.append('file', blob, 'photo.jpg');
			if (await api(`/api/people/${p.id}/image`, { method: 'POST', body: fd }, 'Error al subir la foto')) {
				imageVersion = { ...imageVersion, [p.id]: Date.now() };
				await invalidateAll();
			}
		} finally {
			uploadingId = null;
		}
	}

	async function removePhoto(p: Person) {
		if (await api(`/api/people/${p.id}/image`, { method: 'DELETE' })) {
			imageVersion = { ...imageVersion, [p.id]: Date.now() };
			await invalidateAll();
		}
	}
</script>

<div class="min-h-full" style="background: var(--bg);">
	<header class="sticky top-0 z-10 px-4 sm:px-6 py-3 shrink-0" style="background: rgba(255,248,243,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-container-highest);">
		<div class="max-w-2xl mx-auto flex items-center gap-3">
			<button class="lg:hidden p-1.5 rounded-lg transition-colors shrink-0"
				style="color: var(--primary);"
				aria-label="Abrir menú lateral"
				on:click={() => $sidebarOpen = true}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="flex-1 min-w-0">
				<h1 class="text-xl sm:text-2xl font-black tracking-tight leading-none" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">Personas</h1>
				<p class="text-xs mt-0.5" style="color: var(--text-secondary);">Una receta sin personas asignadas es para todos</p>
			</div>
		</div>
	</header>

	<div class="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
		{#if errorMsg}
			<div class="px-4 py-2 rounded-xl text-sm font-medium flex justify-between" style="background: var(--error-bg); color: var(--error);">
				<span>{errorMsg}</span>
				<button on:click={() => errorMsg = null} class="font-bold" aria-label="Cerrar">&times;</button>
			</div>
		{/if}

		<form class="flex gap-2" on:submit|preventDefault={addPerson}>
			<input type="text" bind:value={newName} placeholder="Nombre de la persona..." maxlength="100"
				class="flex-1 px-4 py-2.5 rounded-xl text-sm"
				style="background: var(--surface); border: 1px solid var(--border); color: var(--text);" />
			<button type="submit" disabled={!newName.trim()}
				class="px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
				style="background: var(--primary); color: white;">Añadir</button>
		</form>

		{#if active.length === 0}
			<p class="text-sm text-center py-8" style="color: var(--text-muted);">Aún no hay personas. Mientras no haya ninguna, todo se planifica para todos.</p>
		{:else}
			<ul class="space-y-2">
				{#each active as p, i (p.id)}
					{@render personRow(p, i)}
				{/each}
			</ul>
		{/if}

		{#if archived.length > 0}
			<div>
				<h2 class="text-xs font-black uppercase tracking-widest mb-2" style="color: var(--text-muted);">Archivadas</h2>
				<p class="text-xs mb-2" style="color: var(--text-muted);">No aparecen al planificar ni cuentan para las reglas, pero se conservan en el histórico.</p>
				<ul class="space-y-2 opacity-70">
					{#each archived as p, i (p.id)}
						{@render personRow(p, i)}
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>

{#if cropping}
	<PhotoCropper file={cropping.file} onconfirm={uploadCropped} oncancel={() => cropping = null} />
{/if}

{#snippet personRow(p: Person, i: number)}
	<li class="flex items-center gap-3 px-3 py-2.5 rounded-2xl" style="background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
		<label class="relative cursor-pointer group shrink-0" title="Cambiar foto">
			{#key imageVersion[p.id]}
				<PersonAvatar person={p} size={52} ring={false} />
			{/key}
			<span class="absolute inset-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
				style="background: rgba(0,0,0,0.45);">
				{uploadingId === p.id ? '...' : 'Foto'}
			</span>
			<input type="file" accept="image/*" class="hidden" on:change={(e) => pickPhoto(p, e)} disabled={uploadingId !== null} />
		</label>

		<div class="flex-1 min-w-0">
			{#if editingId === p.id}
				<!-- svelte-ignore a11y_autofocus -->
				<input type="text" bind:value={editName} maxlength="100" autofocus
					class="w-full px-2 py-1 rounded-lg text-sm font-bold"
					style="background: var(--surface-container-low); border: 1px solid var(--border); color: var(--text);"
					on:blur={() => saveName(p)}
					on:keydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') editingId = null; }} />
			{:else}
				<button class="text-left text-sm font-bold truncate max-w-full hover:underline" style="color: var(--text);"
					on:click={() => startEdit(p)} title="Renombrar">{p.name}</button>
			{/if}
			{#if p.image_type}
				<button class="block text-[11px] hover:underline" style="color: var(--text-muted);" on:click={() => removePhoto(p)}>Quitar foto</button>
			{/if}
		</div>

		<div class="flex items-center gap-1 shrink-0">
			{#if !p.archived}
				<button class="icon-btn" on:click={() => move(p, -1)} disabled={i === 0} aria-label="Subir" title="Subir">
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
				</button>
				<button class="icon-btn" on:click={() => move(p, 1)} disabled={i === active.length - 1} aria-label="Bajar" title="Bajar">
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
				</button>
				<button class="text-btn" on:click={() => setArchived(p, true)}>Archivar</button>
			{:else}
				<button class="text-btn" on:click={() => setArchived(p, false)}>Recuperar</button>
			{/if}
			<button class="icon-btn" style="color: var(--error);" on:click={() => remove(p)} aria-label="Borrar" title="Borrar">
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
			</button>
		</div>
	</li>
{/snippet}

<style>
	.icon-btn {
		padding: 0.4rem;
		border-radius: 0.5rem;
		color: var(--text-secondary);
	}
	.icon-btn:hover:not(:disabled) { background: var(--surface-container); }
	.icon-btn:disabled { opacity: 0.25; }
	.text-btn {
		padding: 0.3rem 0.6rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-secondary);
	}
	.text-btn:hover { background: var(--surface-container); }
</style>
