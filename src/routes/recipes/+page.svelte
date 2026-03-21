<script lang="ts">
	import { onMount } from 'svelte';
	import type { Recipe } from '$lib/types/index.js';
	import TagInput from '$lib/components/TagInput.svelte';
	import MultiTagInput from '$lib/components/MultiTagInput.svelte';

	let recipes: Recipe[] = [];
	let showForm = false;
	let showImport = false;
	let editingRecipe: Recipe | null = null;
	let importText = '';
	let importing = false;
	let searchQ = '';
	let selectedTags: string[] = [];

	let form = { name: '', description: '', tags: '', min_days: -1 };

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
			r.tags.toLowerCase().includes(searchQ.toLowerCase()) ||
			r.description.toLowerCase().includes(searchQ.toLowerCase());
		const recipeTags = r.tags.split(',').map(t => t.trim().toLowerCase());
		const matchesTags = selectedTags.every(t => recipeTags.includes(t));
		return matchesText && matchesTags;
	});

	function startEdit(r: Recipe) {
		editingRecipe = r;
		form = { name: r.name, description: r.description, tags: r.tags, min_days: r.min_days };
		showForm = true;
	}

	function startNew() {
		editingRecipe = null;
		form = { name: '', description: '', tags: '', min_days: -1 };
		showForm = true;
	}

	async function saveRecipe() {
		if (!form.name) return;
		if (editingRecipe) {
			await fetch(`/api/recipes/${editingRecipe.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
		} else {
			await fetch('/api/recipes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
		}
		showForm = false;
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

<div class="min-h-full" style="background: #f0ebe3; font-family: 'DM Sans', sans-serif;">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-4xl mx-auto flex items-end justify-between gap-4">
			<div>
				<h1 class="text-4xl font-bold leading-none text-stone-900" style="font-family: 'Lora', serif">
					Recetas
				</h1>
				<p class="mt-1.5 text-sm text-stone-600">{recipes.length} recetas en tu colección</p>
			</div>
			<div class="flex gap-2 shrink-0">
				<button on:click={() => showImport = !showImport}
					class="px-4 py-2 text-sm font-medium text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors">
					Importar
				</button>
				<button on:click={startNew}
					class="px-4 py-2 text-sm font-medium bg-stone-800 hover:bg-stone-900 text-white rounded-lg transition-colors">
					+ Nueva receta
				</button>
			</div>
		</div>
	</div>

	<div class="max-w-4xl mx-auto px-6 py-6">

		<!-- Buscador -->
		<div class="relative mb-4">
			<svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<input type="text" placeholder="Buscar por nombre, descripción o tag..."
				bind:value={searchQ}
				class="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm shadow-sm focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-100 transition-all" />
		</div>

		<!-- Tags activos -->
		{#if selectedTags.length > 0}
			<div class="flex flex-wrap gap-1.5 mb-4">
				{#each selectedTags as tag}
					<button on:click={() => toggleTag(tag)}
						class="inline-flex items-center gap-1 text-xs px-3 py-1 bg-stone-800 text-white rounded-full font-medium hover:bg-stone-900 transition-colors">
						{tag}
						<span class="opacity-70">×</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Barra de acción masiva -->
		{#if checkedIds.size > 0}
			<div class="flex items-center gap-3 mb-4 px-4 py-3 bg-white border border-stone-200 rounded-xl shadow-sm">
				<span class="text-sm font-medium text-stone-800 shrink-0">
					{checkedIds.size} seleccionada{checkedIds.size > 1 ? 's' : ''}
				</span>
				<div class="relative flex-1">
					<TagInput
						bind:value={bulkTag}
						tags={allTags}
						placeholder="Tag a añadir..."
						class="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400"
					/>
				</div>
				<button on:click={applyBulkTag} disabled={!bulkTag.trim() || bulkAdding}
					class="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 shrink-0 transition-colors">
					{bulkAdding ? 'Añadiendo...' : 'Añadir tag'}
				</button>
				<button on:click={() => { checkedIds = new Set(); }}
					class="text-sm text-stone-600 hover:text-stone-800 shrink-0 transition-colors">
					Cancelar
				</button>
			</div>
		{/if}

		<!-- Panel de importación -->
		{#if showImport}
			<div class="mb-6 p-5 bg-white border border-stone-200 rounded-2xl shadow-sm">
				<h3 class="font-semibold text-stone-900 mb-3" style="font-family: 'Lora', serif">Importar desde Plantoeat</h3>
				<textarea bind:value={importText}
					placeholder="Pega aquí el texto exportado de Plantoeat..."
					class="w-full h-40 px-3 py-2.5 border border-stone-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-50 transition-all"></textarea>
				<div class="flex gap-2 mt-3">
					<button on:click={importRecipes} disabled={importing || !importText}
						class="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
						{importing ? 'Importando...' : 'Importar'}
					</button>
					<button on:click={() => showImport = false}
						class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm transition-colors">
						Cancelar
					</button>
				</div>
			</div>
		{/if}

		<!-- Formulario de receta -->
		{#if showForm}
			<div class="mb-6 p-5 bg-white border border-stone-200 rounded-2xl shadow-sm">
				<h3 class="font-semibold text-stone-900 mb-4" style="font-family: 'Lora', serif">{editingRecipe ? 'Editar receta' : 'Nueva receta'}</h3>
				<div class="grid gap-3">
					<input type="text" placeholder="Nombre *" bind:value={form.name}
						class="px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-50 transition-all" />
					<textarea placeholder="Descripción" bind:value={form.description}
						class="px-3 py-2.5 border border-stone-200 rounded-lg text-sm h-20 resize-none focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-50 transition-all"></textarea>
					<MultiTagInput bind:value={form.tags} tags={allTags} placeholder="Tags (ej: comida,carne,rápido)"
						class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-50 transition-all" />
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">
							Días mínimos entre ocurrencias
						</label>
						<p class="text-xs text-stone-500 mb-1.5">-1 = usar valor global</p>
						<input type="number" bind:value={form.min_days} min="-1"
							class="w-28 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 transition-all" />
					</div>
				</div>
				<div class="flex gap-2 mt-4">
					<button on:click={saveRecipe} disabled={!form.name}
						class="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
						Guardar
					</button>
					<button on:click={() => showForm = false}
						class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm transition-colors">
						Cancelar
					</button>
				</div>
			</div>
		{/if}

		<!-- Cabecera de lista -->
		<div class="flex items-center justify-between mb-3">
			<p class="text-sm text-stone-600">
				{filteredRecipes.length} resultado{filteredRecipes.length !== 1 ? 's' : ''}
			</p>
			<button on:click={toggleSelectAll}
				class="text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors">
				{allVisibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
			</button>
		</div>

		<!-- Lista de recetas -->
		<div class="space-y-2">
			{#each filteredRecipes as recipe}
				<div class="group flex items-start gap-3 p-4 bg-white border border-stone-200 rounded-2xl hover:border-stone-300 hover:shadow-sm transition-all duration-150">
					<input type="checkbox"
						checked={checkedIds.has(recipe.id)}
						on:change={() => {
							if (checkedIds.has(recipe.id)) checkedIds.delete(recipe.id);
							else checkedIds.add(recipe.id);
							checkedIds = checkedIds;
						}}
						class="mt-0.5 w-4 h-4 shrink-0 accent-stone-800" />
					<div class="flex-1 min-w-0">
						<p class="font-semibold text-stone-900 leading-snug" style="font-family: 'Lora', serif">{recipe.name}</p>
						{#if recipe.description}
							<p class="text-sm text-stone-600 mt-0.5 line-clamp-2 leading-relaxed">{recipe.description}</p>
						{/if}
						{#if recipe.tags}
							<div class="flex flex-wrap gap-1 mt-2">
								{#each recipe.tags.split(',') as tag}
									<button on:click={() => toggleTag(tag)}
										class="text-xs px-2 py-0.5 rounded-full font-medium transition-colors {selectedTags.includes(tag.trim().toLowerCase())
											? 'bg-stone-800 text-white'
											: 'bg-stone-100 text-stone-700 hover:bg-stone-200'}">
										{tag.trim()}
									</button>
								{/each}
							</div>
						{/if}
						{#if recipe.min_days !== -1}
							<p class="text-xs text-stone-500 mt-1.5">Mín. {recipe.min_days} días entre ocurrencias</p>
						{/if}
					</div>
					<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
						<button on:click={() => startEdit(recipe)}
							class="px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors">
							Editar
						</button>
						<button on:click={() => deleteRecipe(recipe.id)}
							class="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors">
							Borrar
						</button>
					</div>
				</div>
			{:else}
				<div class="text-center py-16 text-stone-500">
					<p class="text-4xl mb-3">🍳</p>
					<p class="text-sm">
						{searchQ || selectedTags.length ? 'Sin resultados para esta búsqueda.' : 'No hay recetas. Añade una nueva o importa desde Plantoeat.'}
					</p>
				</div>
			{/each}
		</div>
	</div>
</div>
