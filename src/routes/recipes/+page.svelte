<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { Recipe } from '$lib/types/index.js';
	import TagInput from '$lib/components/TagInput.svelte';
	import TagBadgeInput from '$lib/components/TagBadgeInput.svelte';
	import { sidebarOpen } from '$lib/stores/ui.js';

	let { data } = $props();
	let recipes = $derived(data.recipes);
	let allTags = $derived(data.allTags);

	let showForm = $state(false);
	let showImport = $state(false);
	let editingRecipe: Recipe | null = $state(null);
	let importText = $state('');
	let importing = $state(false);
	let searchQ = $state('');
	let selectedTags: string[] = $state([]);

	let form = $state({ name: '', description: '', tags: '', min_days: -1 });

	// Image picker state
	let showImageSearch = $state(false);
	let imageSearchQ = $state('');
	let imageResults: { url: string; thumbnail: string; title: string }[] = $state([]);
	let imageSearching = $state(false);
	let pendingImageUrl: string | null = $state(null);

	async function openImageSearch() {
		showImageSearch = true;
		imageSearchQ = form.name;
		if (imageSearchQ) await doImageSearch();
	}

	async function doImageSearch() {
		if (!imageSearchQ.trim()) return;
		imageSearching = true;
		try {
			const res = await fetch(`/api/image-search?q=${encodeURIComponent(imageSearchQ)}`);
			imageResults = await res.json();
		} finally {
			imageSearching = false;
		}
	}

	function pickImage(url: string) {
		pendingImageUrl = url;
		showImageSearch = false;
	}

	let checkedIds: Set<number> = $state(new Set());
	let bulkTag = $state('');
	let bulkAdding = $state(false);

	let filteredRecipes = $derived(recipes.filter(r => {
		const matchesText = !searchQ ||
			r.name.toLowerCase().includes(searchQ.toLowerCase()) ||
			r.tags.toLowerCase().includes(searchQ.toLowerCase());

		const recipeTags = r.tags.split(',').map(t => t.trim().toLowerCase());
		const matchesTags = selectedTags.every(t => recipeTags.includes(t));
		return matchesText && matchesTags;
	}));

	let allVisibleSelected = $derived(filteredRecipes.length > 0 && filteredRecipes.every(r => checkedIds.has(r.id)));

	function toggleSelectAll() {
		if (allVisibleSelected) {
			filteredRecipes.forEach(r => checkedIds.delete(r.id));
		} else {
			filteredRecipes.forEach(r => checkedIds.add(r.id));
		}
		checkedIds = checkedIds;
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const editId = params.get('edit');
		if (editId) {
			const r = recipes.find(r => r.id === parseInt(editId));
			if (r) startEdit(r);
		}
	});

	function toggleTag(tag: string) {
		const t = tag.trim().toLowerCase();
		if (selectedTags.includes(t)) {
			selectedTags = selectedTags.filter(x => x !== t);
		} else {
			selectedTags = [...selectedTags, t];
		}
	}

	function startEdit(r: Recipe) {
		editingRecipe = r;
		form = { name: r.name, description: r.description, tags: r.tags, min_days: r.min_days };
		pendingImageUrl = null;
		showImageSearch = false;
		showForm = true;
		document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function startNew() {
		editingRecipe = null;
		form = { name: '', description: '', tags: '', min_days: -1 };
		pendingImageUrl = null;
		showImageSearch = false;
		showForm = true;
	}

	async function handleRecipeSubmit({ result, update }: { result: any; update: () => Promise<void> }) {
		if (result.type === 'success') {
			const savedId = result.data?.createdId ?? result.data?.updatedId ?? editingRecipe?.id;
			if (pendingImageUrl && savedId) {
				await fetch(`/api/recipes/${savedId}/image`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url: pendingImageUrl })
				});
			}
			showForm = false;
			pendingImageUrl = null;
		}
		await update();
	}

	async function removeImage(id: number) {
		await fetch(`/api/recipes/${id}/image`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<div class="min-h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<header class="sticky top-0 z-10 px-4 sm:px-6 py-3 shrink-0" style="background: rgba(255,248,243,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-container-highest);">
		<div class="max-w-4xl mx-auto flex items-center gap-3">
			<button class="lg:hidden p-1.5 rounded-lg transition-colors shrink-0"
				style="color: var(--primary);"
				on:click={() => $sidebarOpen = true}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="flex-1 min-w-0">
				<h1 class="text-xl sm:text-2xl font-black tracking-tight leading-none" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">Recetas</h1>
				<p class="text-xs mt-0.5" style="color: var(--text-secondary);">{recipes.length} recetas en tu colección</p>
			</div>
			<div class="flex gap-2 shrink-0">
				<button on:click={() => showImport = !showImport}
					class="p-2 sm:px-4 sm:py-2 rounded-lg transition-colors"
					style="color: var(--text); border: 1px solid var(--surface-container-highest);"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
					title="Importar">
					<svg class="sm:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v4m16 8l-7 7-7-7m7 7V9" />
					</svg>
					<span class="hidden sm:inline text-sm font-medium">Importar</span>
				</button>
				<button on:click={startNew}
					class="p-2 sm:px-4 sm:py-2 rounded-lg transition-colors"
					style="background: var(--primary); color: white;"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'var(--primary)'}
					title="Nueva receta">
					<svg class="sm:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14" />
					</svg>
					<span class="hidden sm:inline text-sm font-medium">+ Nueva receta</span>
				</button>
			</div>
		</div>
	</header>

	<div class="max-w-4xl mx-auto px-6 py-6">

		<!-- Buscador -->
		<div class="relative mb-4">
			<svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<input type="text" placeholder="Buscar por nombre, descripción o tag..."
				bind:value={searchQ}
				class="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm shadow-sm focus:outline-none transition-all"
				style="background: var(--surface); border: 1px solid var(--border); color: var(--text);" />
		</div>

		<!-- Tags activos -->
		{#if selectedTags.length > 0}
			<div class="flex flex-wrap gap-1.5 mb-4">
				{#each selectedTags as tag}
					<button on:click={() => toggleTag(tag)}
						class="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-medium transition-colors"
						style="background: var(--nav-active); color: white;">
						{tag}
						<span class="opacity-70">&times;</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Barra de acción masiva -->
		{#if checkedIds.size > 0}
			<div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 px-4 py-3 rounded-xl shadow-sm"
				style="background: var(--surface); border: 1px solid var(--border);">
				<span class="text-sm font-medium shrink-0" style="color: var(--text);">
					{checkedIds.size} sel.
				</span>
				<form method="POST" action="?/bulkTag"
					use:enhance={() => {
						bulkAdding = true;
						return async ({ update }) => {
							bulkTag = '';
							checkedIds = new Set();
							bulkAdding = false;
							await update();
						};
					}}
					class="contents">
					<input type="hidden" name="ids" value={[...checkedIds].join(',')} />
					<input type="hidden" name="tag" value={bulkTag} />
					<div class="relative flex-1 min-w-[120px]">
						<TagInput
							bind:value={bulkTag}
							tags={allTags}
							placeholder="Tag..."
							class="w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none"
						/>
					</div>
					<button type="submit" disabled={!bulkTag.trim() || bulkAdding}
						class="p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0 transition-colors"
						title="Añadir tag"
						style="background: var(--primary); color: white;">
						{bulkAdding ? 'Añadiendo...' : 'Añadir tag'}
					</button>
				</form>
				<button on:click={() => { checkedIds = new Set(); }}
					class="text-sm shrink-0 transition-colors"
					style="color: var(--text-secondary);">
					Cancelar
				</button>
			</div>
		{/if}

		<!-- Panel de importación -->
		{#if showImport}
			<form method="POST" action="?/import"
				use:enhance={() => {
					importing = true;
					return async ({ update }) => {
						importText = '';
						showImport = false;
						importing = false;
						await update();
					};
				}}
				class="mb-6 p-5 rounded-2xl shadow-sm" style="background: var(--surface); border: 1px solid var(--border);">
				<h3 class="text-lg font-semibold mb-3" style="font-family: 'Epilogue', sans-serif; color: var(--text);">Importar desde Plantoeat</h3>
				<textarea name="import_text" bind:value={importText}
					placeholder="Pega aquí el texto exportado de Plantoeat..."
					class="w-full h-40 px-3 py-2.5 rounded-lg text-sm font-mono resize-none focus:outline-none transition-all"
					style="border: 1px solid var(--border); color: var(--text);"></textarea>
				<div class="flex gap-2 mt-3">
					<button type="submit" disabled={importing || !importText}
						class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
						style="background: var(--primary); color: white;">
						{importing ? 'Importando...' : 'Importar'}
					</button>
					<button type="button" on:click={() => showImport = false}
						class="px-4 py-2 rounded-lg text-sm transition-colors"
						style="background: var(--surface-container); color: var(--text);">
						Cancelar
					</button>
				</div>
			</form>
		{/if}

		<!-- Formulario de receta -->
		{#if showForm}
			<form method="POST" action={editingRecipe ? '?/update' : '?/create'}
				use:enhance={() => {
					return async (event) => { await handleRecipeSubmit(event); };
				}}
				class="mb-6 p-5 rounded-2xl shadow-sm" style="background: var(--surface); border: 1px solid var(--border);">
				{#if editingRecipe}
					<input type="hidden" name="id" value={editingRecipe.id} />
				{/if}
				<input type="hidden" name="tags" value={form.tags} />
				<input type="hidden" name="min_days" value={form.min_days} />
				<h3 class="text-lg font-semibold mb-4" style="font-family: 'Epilogue', sans-serif; color: var(--text);">{editingRecipe ? 'Editar receta' : 'Nueva receta'}</h3>
				<div class="grid gap-3">
					<input type="text" name="name" placeholder="Nombre *" bind:value={form.name}
						class="px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
					<textarea name="description" placeholder="Descripción" bind:value={form.description}
						class="px-3 py-2.5 rounded-lg text-sm h-20 resize-none focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);"></textarea>
					<TagBadgeInput bind:value={form.tags} tags={allTags} placeholder="Tags (ej: comida,carne,rápido)" />
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">
							Días mínimos entre ocurrencias
						</label>
						<p class="text-xs mb-1.5" style="color: var(--text-muted);">-1 = usar valor global</p>
						<input type="number" bind:value={form.min_days} min="-1"
							class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
							style="border: 1px solid var(--border); color: var(--text);" />
					</div>

					<!-- Imagen -->
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-2" style="color: var(--text-secondary);">Imagen</label>
						<div class="flex items-start gap-3">
							{#if pendingImageUrl}
								<div class="relative shrink-0">
									<img src={pendingImageUrl} alt="" class="w-24 h-16 object-cover rounded-lg" style="border: 1px solid var(--border);" />
									<button type="button" on:click={() => pendingImageUrl = null}
										class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shadow"
										style="background: var(--error); color: white;">&times;</button>
								</div>
							{:else if editingRecipe?.image_type}
								<div class="relative shrink-0">
									<img src="/api/recipes/{editingRecipe.id}/image" alt="" class="w-24 h-16 object-cover rounded-lg" style="border: 1px solid var(--border);" />
									<button type="button" on:click={() => removeImage(editingRecipe!.id)}
										class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shadow"
										style="background: var(--error); color: white;">&times;</button>
								</div>
							{/if}
							<button type="button" on:click={openImageSearch}
								class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
								style="border: 1px solid var(--border); color: var(--text);"
								on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
								on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
								{pendingImageUrl || editingRecipe?.image_type ? 'Cambiar imagen' : 'Buscar imagen'}
							</button>
						</div>

						{#if showImageSearch}
							<div class="mt-2 rounded-xl overflow-hidden" style="border: 1px solid var(--border);">
								<div class="flex gap-2 p-2" style="border-bottom: 1px solid var(--border);">
									<input type="text" bind:value={imageSearchQ}
										on:keydown={(e) => e.key === 'Enter' && doImageSearch()}
										placeholder="Buscar imágenes..."
										class="flex-1 px-2.5 py-1.5 rounded-lg text-sm focus:outline-none"
										style="border: 1px solid var(--border); color: var(--text);" />
									<button type="button" on:click={doImageSearch} disabled={imageSearching}
										class="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
										style="background: var(--primary); color: white;">
										{imageSearching ? '...' : 'Buscar'}
									</button>
									<button type="button" on:click={() => showImageSearch = false}
										class="px-2 py-1.5 rounded-lg text-sm"
										style="color: var(--text-secondary);">&times;</button>
								</div>
								{#if imageSearching}
									<p class="text-xs px-3 py-4 text-center" style="color: var(--text-muted);">Buscando...</p>
								{:else if imageResults.length === 0}
									<p class="text-xs px-3 py-4 text-center" style="color: var(--text-muted);">Sin resultados. Prueba otro término.</p>
								{:else}
									<div class="grid grid-cols-5 gap-1 p-2 max-h-52 overflow-y-auto">
										{#each imageResults as img}
											<button type="button" on:click={() => pickImage(img.thumbnail)}
												class="rounded-lg overflow-hidden transition-opacity hover:opacity-80 focus:outline-none"
												style="border: 2px solid transparent;"
												title={img.title}>
												<img src={img.thumbnail} alt={img.title} class="w-full h-14 object-cover" loading="lazy"
													on:error={(e) => (e.currentTarget as HTMLImageElement).closest('button')!.style.display = 'none'} />
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
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

		<!-- Cabecera de lista -->
		<div class="flex items-center justify-between mb-3">
			<p class="text-sm" style="color: var(--text-secondary);">
				{filteredRecipes.length} resultado{filteredRecipes.length !== 1 ? 's' : ''}
			</p>
			<button on:click={toggleSelectAll}
				class="text-xs font-medium transition-colors"
				style="color: var(--text-secondary);">
				{allVisibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
			</button>
		</div>

		<!-- Lista de recetas -->
		<div class="space-y-2">
			{#each filteredRecipes as recipe}
				<div class="group flex items-start gap-3 p-4 rounded-2xl transition-all duration-150"
					style="background: var(--surface); border: 1px solid var(--border);">
					<input type="checkbox"
						checked={checkedIds.has(recipe.id)}
						on:change={() => {
							if (checkedIds.has(recipe.id)) checkedIds.delete(recipe.id);
							else checkedIds.add(recipe.id);
							checkedIds = checkedIds;
						}}
						class="mt-0.5 w-4 h-4 shrink-0" style="accent-color: var(--primary);" />
					{#if recipe.image_type}
						<img src="/api/recipes/{recipe.id}/image" alt={recipe.name}
							class="w-14 h-10 object-cover rounded-lg shrink-0 mt-0.5"
							style="border: 1px solid var(--border);"
							on:error={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'} />
					{/if}
					<div class="flex-1 min-w-0">
						<p class="text-lg font-semibold leading-snug" style="font-family: 'Epilogue', sans-serif; color: var(--text);">{recipe.name}</p>
						{#if recipe.description}
							<p class="text-sm mt-0.5 line-clamp-2 leading-relaxed" style="color: var(--text-secondary);">{recipe.description}</p>
						{/if}
						{#if recipe.tags}
							<div class="flex flex-wrap gap-1 mt-2">
								{#each recipe.tags.split(',') as tag}
									<button on:click={() => toggleTag(tag)}
										class="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
										style="{selectedTags.includes(tag.trim().toLowerCase())
											? 'background: var(--nav-active); color: white;'
											: 'background: var(--surface-container); color: var(--text);'}">
										{tag.trim()}
									</button>
								{/each}
							</div>
						{/if}
						{#if recipe.min_days !== -1}
							<p class="text-xs mt-1.5" style="color: var(--text-muted);">Mín. {recipe.min_days} días entre ocurrencias</p>
						{/if}
					</div>
					<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
						<button on:click={() => startEdit(recipe)}
							class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
							style="color: var(--text-secondary);"
							on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
							on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
							title="Editar">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
						</button>
						<form method="POST" action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm('¿Eliminar esta receta?')) { cancel(); return; }
								return async ({ update }) => { await update(); };
							}}
							class="contents">
							<input type="hidden" name="id" value={recipe.id} />
							<button type="submit"
								class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
								style="color: var(--error);"
								title="Borrar">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							</button>
						</form>
					</div>
				</div>
			{:else}
				<div class="text-center py-16" style="color: var(--text-muted);">
					<p class="text-sm">
						{searchQ || selectedTags.length ? 'Sin resultados para esta búsqueda.' : 'No hay recetas. Añade una nueva o importa desde Plantoeat.'}
					</p>
				</div>
			{/each}
		</div>
	</div>
</div>
