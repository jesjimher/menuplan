<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Member } from '$lib/types/index.js';
	import TagBadgeInput from '$lib/components/TagBadgeInput.svelte';
	import { sidebarOpen } from '$lib/stores/ui.js';

	let { data } = $props();
	let members = $derived(data.members);
	let allTags = $derived(data.allTags);

	let showForm = $state(false);
	let editingMember: Member | null = $state(null);
	let form = $state({ name: '', cannot_eat: '', likes: '', dislikes: '' });

	function startEdit(m: Member) {
		editingMember = m;
		form = { name: m.name, cannot_eat: m.cannot_eat, likes: m.likes, dislikes: m.dislikes };
		showForm = true;
	}

	function startNew() {
		editingMember = null;
		form = { name: '', cannot_eat: '', likes: '', dislikes: '' };
		showForm = true;
	}

	function parseTags(str: string): string[] {
		return str.split(',').map(t => t.trim()).filter(Boolean);
	}
</script>

<div class="min-h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<header class="sticky top-0 z-10 px-4 sm:px-6 py-3 shrink-0" style="background: rgba(255,248,243,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-container-highest);">
		<div class="max-w-2xl mx-auto flex items-center gap-3">
			<button class="lg:hidden p-1.5 rounded-lg transition-colors shrink-0"
				style="color: var(--primary);"
				on:click={() => $sidebarOpen = true}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="flex-1 min-w-0">
				<h1 class="text-xl sm:text-2xl font-black tracking-tight leading-none" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">Miembros</h1>
				<p class="text-xs mt-0.5" style="color: var(--text-secondary);">{members.length} miembro{members.length !== 1 ? 's' : ''} en tu familia</p>
			</div>
			<button on:click={startNew}
				class="p-2 sm:px-4 sm:py-2 rounded-lg transition-colors shrink-0"
				style="background: var(--primary); color: white;"
				on:mouseenter={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
				on:mouseleave={(e) => e.currentTarget.style.background = 'var(--primary)'}
				title="Nuevo miembro">
				<svg class="sm:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14" />
				</svg>
				<span class="hidden sm:inline text-sm font-medium">+ Nuevo miembro</span>
			</button>
		</div>
	</header>

	<div class="max-w-2xl mx-auto px-6 py-6">

		<!-- Formulario -->
		{#if showForm}
			<form method="POST" action={editingMember ? '?/update' : '?/create'}
				use:enhance={() => {
					return async ({ update }) => {
						showForm = false;
						await update();
					};
				}}
				class="mb-6 p-5 rounded-2xl shadow-sm" style="background: var(--surface); border: 1px solid var(--border);">
				{#if editingMember}
					<input type="hidden" name="id" value={editingMember.id} />
				{/if}
				<input type="hidden" name="cannot_eat" value={form.cannot_eat} />
				<input type="hidden" name="likes" value={form.likes} />
				<input type="hidden" name="dislikes" value={form.dislikes} />
				<h3 class="text-lg font-semibold mb-4" style="font-family: 'Epilogue', sans-serif; color: var(--text);">{editingMember ? 'Editar miembro' : 'Nuevo miembro'}</h3>
				<div class="grid gap-3">
					<input type="text" name="name" placeholder="Nombre *" bind:value={form.name}
						class="px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">No puede comer</label>
						<TagBadgeInput bind:value={form.cannot_eat} tags={allTags} placeholder="ej: gluten,lactosa,marisco" />
					</div>
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">Le gusta</label>
						<TagBadgeInput bind:value={form.likes} tags={allTags} placeholder="ej: pasta,pollo" />
					</div>
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">No le gusta</label>
						<TagBadgeInput bind:value={form.dislikes} tags={allTags} placeholder="ej: verduras,pescado" />
					</div>
				</div>
				<div class="flex gap-2 mt-4">
					<button type="submit" disabled={!form.name}
						class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
						style="background: var(--primary); color: white;">
						Guardar
					</button>
					<button type="button" on:click={() => showForm = false}
						class="px-4 py-2 rounded-lg text-sm transition-colors"
						style="background: var(--surface-container); color: var(--text);">
						Cancelar
					</button>
				</div>
			</form>
		{/if}

		<!-- Lista de miembros -->
		<div class="space-y-3">
			{#each members as member}
				<div class="group p-5 rounded-2xl transition-all duration-150"
					style="background: var(--surface); border: 1px solid var(--border);">
					<div class="flex items-start justify-between gap-3">
						<h3 class="font-semibold text-lg leading-snug" style="font-family: 'Epilogue', sans-serif; color: var(--text);">{member.name}</h3>
						<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
							<button on:click={() => startEdit(member)}
								class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
								style="color: var(--text-secondary);"
								on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
								on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
								Editar
							</button>
							<form method="POST" action="?/delete"
								use:enhance={({ cancel }) => {
									if (!confirm('¿Eliminar este miembro?')) { cancel(); return; }
									return async ({ update }) => { await update(); };
								}}
								class="contents">
								<input type="hidden" name="id" value={member.id} />
								<button type="submit"
									class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
									style="color: var(--error);">
									Borrar
								</button>
							</form>
						</div>
					</div>

					{#if member.cannot_eat}
						<div class="mt-3">
							<p class="text-xs font-medium uppercase tracking-wide mb-1.5" style="color: var(--text-secondary);">No puede comer</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.cannot_eat) as tag}
									<span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: var(--error-bg); color: var(--error);">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if member.likes}
						<div class="mt-3">
							<p class="text-xs font-medium uppercase tracking-wide mb-1.5" style="color: var(--text-secondary);">Le gusta</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.likes) as tag}
									<span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: var(--success-bg); color: var(--success);">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if member.dislikes}
						<div class="mt-3">
							<p class="text-xs font-medium uppercase tracking-wide mb-1.5" style="color: var(--text-secondary);">No le gusta</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.dislikes) as tag}
									<span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background: var(--comida-header); color: var(--text);">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if !member.cannot_eat && !member.likes && !member.dislikes}
						<p class="mt-2 text-sm" style="color: var(--text-muted);">Sin restricciones ni preferencias</p>
					{/if}
				</div>
			{:else}
				<div class="text-center py-16" style="color: var(--text-muted);">
					<p class="text-sm">No hay miembros. Añade los miembros de tu familia.</p>
				</div>
			{/each}
		</div>
	</div>
</div>
