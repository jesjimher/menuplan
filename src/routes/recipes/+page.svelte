<script lang="ts">
	import { onMount } from 'svelte';
	import type { Recipe } from '$lib/types/index.js';
	import TagInput from '$lib/components/TagInput.svelte';
	import TagBadgeInput from '$lib/components/TagBadgeInput.svelte';

	let recipes: Recipe[] = [];
	let showForm = false;
	let showImport = false;
	let editingRecipe: Recipe | null = null;
	let importText = '';
	let importing = false;
	let searchQ = '';
	let selectedTags: string[] = [];

	let form = { name: '', description: '', tags: '', min_days: -1 };

	// Image picker state
	let showImageSearch = false;
	let imageSearchQ = '';
	let imageResults: { url: string; thumbnail: string; title: string }[] = [];
	let imageSearching = false;
	let pendingImageUrl: string | null = null; // URL to store when saving

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

	let checkedIds = new Set<number>();
	let bulkTag = '';
	let bulkAdding = false;

	$: allTags = [...new Set(
		recipes.flatMap(r => r.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
	)].sort();

	$: allVisibleSelected = filteredRecipes.length > 0 && filteredRecipes.every(r => checkedIds.has(r.id));

	function toggleSelectAll() {
		if (allVisibleSelected) {
			filteredRecipes.forEach(r => checkedIds.delete(r.id));
		} else {
			filteredRecipes.forEach(r => checkedIds.add(r.id));
		}
		checkedIds = checkedIds;
	}

	onMount(async () => {
		await loadRecipes();
		const params = new URLSearchParams(window.location.search);
		const editId = params.get('edit');
		if (editId) {
			const r = recipes.find(r => r.id === parseInt(editId));
			if (r) startEdit(r);
		}
	});

	async function loadRecipes() {
		const res = await fetch('/api/recipes');
		recipes = await res.json();
	}

	function toggleTag(tag: string) {
		const t = tag.trim().toLowerCase();
		if (selectedTags.includes(t)) {
			selectedTags = selectedTags.filter(x => x !== t);
		} else {
			selectedTags = [...selectedTags, t];
		}
	}

	$: filteredRecipes = recipes.filter(r => {
		const matchesText = !searchQ ||
			r.name.toLowerCase().includes(searchQ.toLowerCase()) ||
			r.tags.toLowerCase().includes(searchQ.toLowerCase());

		const recipeTags = r.tags.split(',').map(t => t.trim().toLowerCase());
		const matchesTags = selectedTags.every(t => recipeTags.includes(t));
		return matchesText && matchesTags;
	});

	function startEdit(r: Recipe) {
		editingRecipe = r;
		form = { name: r.name, description: r.description, tags: r.tags, min_days: r.min_days };
		pendingImageUrl = null;
		showImageSearch = false;
		showForm = true;
	}

	function startNew() {
		editingRecipe = null;
		form = { name: '', description: '', tags: '', min_days: -1 };
		pendingImageUrl = null;
		showImageSearch = false;
		showForm = true;
	}

	async function saveRecipe() {
		if (!form.name) return;
		let savedId: number;
		if (editingRecipe) {
			await fetch(`/api/recipes/${editingRecipe.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			savedId = editingRecipe.id;
		} else {
			const res = await fetch('/api/recipes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			const created = await res.json();
			savedId = created.id;
		}
		if (pendingImageUrl) {
			await fetch(`/api/recipes/${savedId}/image`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: pendingImageUrl })
			});
		}
		showForm = false;
		pendingImageUrl = null;
		await loadRecipes();
	}

	async function removeImage(id: number) {
		await fetch(`/api/recipes/${id}/image`, { method: 'DELETE' });
		await loadRecipes();
	}

	async function deleteRecipe(id: number) {
		if (!confirm('¿Eliminar esta receta?')) return;
		await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
		await loadRecipes();
	}

	async function applyBulkTag() {
		const tag = bulkTag.trim().toLowerCase();
		if (!tag || checkedIds.size === 0) return;
		bulkAdding = true;
		try {
			await Promise.all([...checkedIds].map(id => {
				const recipe = recipes.find(r => r.id === id)!;
				const current = recipe.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
				if (current.includes(tag)) return Promise.resolve();
				const newTags = [...current, tag].join(',');
				return fetch(`/api/recipes/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...recipe, tags: newTags })
				});
			}));
			bulkTag = '';
			checkedIds = new Set();
			await loadRecipes();
		} finally {
			bulkAdding = false;
		}
	}

	async function importRecipes() {
		importing = true;
		try {
			await fetch('/api/recipes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ import_text: importText })
			});
			importText = '';
			showImport = false;
			await loadRecipes();
		} finally {
			importing = false;
		}
	}
</script>

<div class="min-h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<div class="px-6 pt-8 pb-6" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="max-w-4xl mx-auto flex items-end justify-between gap-4">
			<div>
				<h1 class="text-4xl font-bold leading-none" style="font-family: 'Lora', serif; color: var(--text);">
					Recetas
				</h1>
				<p class="mt-1.5 text-sm" style="color: var(--text-secondary);">{recipes.length} recetas en tu colección</p>
			</div>
			<div class="flex gap-2 shrink-0">
				<button on:click={() => showImport = !showImport}
					class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
					style="color: var(--text); border: 1px solid var(--border);"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
					Importar
				</button>
				<button on:click={startNew}
					class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
					style="background: var(--primary); color: white;"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'var(--primary)'}>
					+ Nueva receta
				</button>
			</div>
		</div>
	</div>

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
			<div class="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl shadow-sm"
				style="background: var(--surface); border: 1px solid var(--border);">
				<span class="text-sm font-medium shrink-0" style="color: var(--text);">
					{checkedIds.size} seleccionada{checkedIds.size > 1 ? 's' : ''}
				</span>
				<div class="relative flex-1">
					<TagInput
						bind:value={bulkTag}
						tags={allTags}
						placeholder="Tag a añadir..."
						class="w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none"
					/>
				</div>
				<button on:click={applyBulkTag} disabled={!bulkTag.trim() || bulkAdding}
					class="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 shrink-0 transition-colors"
					style="background: var(--primary); color: white;">
					{bulkAdding ? 'Añadiendo...' : 'Añadir tag'}
				</button>
				<button on:click={() => { checkedIds = new Set(); }}
					class="text-sm shrink-0 transition-colors"
					style="color: var(--text-secondary);">
					Cancelar
				</button>
			</div>
		{/if}

		<!-- Panel de importación -->
		{#if showImport}
			<div class="mb-6 p-5 rounded-2xl shadow-sm" style="background: var(--surface); border: 1px solid var(--border);">
				<h3 class="text-lg font-semibold mb-3" style="font-family: 'Lora', serif; color: var(--text);">Importar desde Plantoeat</h3>
				<textarea bind:value={importText}
					placeholder="Pega aquí el texto exportado de Plantoeat..."
					class="w-full h-40 px-3 py-2.5 rounded-lg text-sm font-mono resize-none focus:outline-none transition-all"
					style="border: 1px solid var(--border); color: var(--text);"></textarea>
				<div class="flex gap-2 mt-3">
					<button on:click={importRecipes} disabled={importing || !importText}
						class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
						style="background: var(--primary); color: white;">
						{importing ? 'Importando...' : 'Importar'}
					</button>
					<button on:click={() => showImport = false}
						class="px-4 py-2 rounded-lg text-sm transition-colors"
						style="background: var(--surface-warm); color: var(--text);">
						Cancelar
					</button>
				</div>
			</div>
		{/if}

		<!-- Formulario de receta -->
		{#if showForm}
			<div class="mb-6 p-5 rounded-2xl shadow-sm" style="background: var(--surface); border: 1px solid var(--border);">
				<h3 class="text-lg font-semibold mb-4" style="font-family: 'Lora', serif; color: var(--text);">{editingRecipe ? 'Editar receta' : 'Nueva receta'}</h3>
				<div class="grid gap-3">
					<input type="text" placeholder="Nombre *" bind:value={form.name}
						class="px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
					<textarea placeholder="Descripción" bind:value={form.description}
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
								on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
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
					<button on:click={saveRecipe} disabled={!form.name}
						class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
						style="background: var(--primary); color: white;">
						Guardar
					</button>
					<button on:click={() => showForm = false}
						class="px-4 py-2 rounded-lg text-sm transition-colors"
						style="background: var(--surface-warm); color: var(--text);">
						Cancelar
					</button>
				</div>
			</div>
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
						<p class="text-lg font-semibold leading-snug" style="font-family: 'Lora', serif; color: var(--text);">{recipe.name}</p>
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
											: 'background: var(--surface-warm); color: var(--text);'}">
										{tag.trim()}
									</button>
								{/each}
							</div>
						{/if}
						{#if recipe.min_days !== -1}
							<p class="text-xs mt-1.5" style="color: var(--text-muted);">Mín. {recipe.min_days} días entre ocurrencias</p>
						{/if}
					</div>
					<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
						<button on:click={() => startEdit(recipe)}
							class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
							style="color: var(--text-secondary);"
							on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
							on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
							Editar
						</button>
						<button on:click={() => deleteRecipe(recipe.id)}
							class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
							style="color: var(--error);">
							Borrar
						</button>
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
