<script lang="ts">
	import { onMount } from 'svelte';
	import type { Recipe } from '$lib/types/index.js';

	let recipes: Recipe[] = [];
	let showForm = false;
	let showImport = false;
	let editingRecipe: Recipe | null = null;
	let importText = '';
	let importing = false;
	let searchQ = '';
	let selectedTags: string[] = [];

	let form = { name: '', description: '', tags: '', min_days: -1 };

	onMount(loadRecipes);

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

<div class="p-4 max-w-4xl mx-auto">
	<div class="flex items-center justify-between mb-4">
		<h1 class="text-2xl font-bold text-gray-800">Recetas ({recipes.length})</h1>
		<div class="flex gap-2">
			<button on:click={() => showImport = !showImport} class="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 rounded text-sm">Importar</button>
			<button on:click={startNew} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">+ Nueva receta</button>
		</div>
	</div>

	<input type="text" placeholder="Buscar recetas..." bind:value={searchQ} class="w-full mb-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
	{#if selectedTags.length > 0}
		<div class="flex flex-wrap gap-1 mb-4">
			{#each selectedTags as tag}
				<button on:click={() => toggleTag(tag)}
					class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-indigo-600 text-white rounded-full">
					{tag}
					<span class="font-bold">×</span>
				</button>
			{/each}
		</div>
	{:else}
		<div class="mb-4"></div>
	{/if}

	{#if showImport}
		<div class="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
			<h3 class="font-semibold text-gray-700 mb-2">Importar desde Plantoeat</h3>
			<textarea
				bind:value={importText}
				placeholder="Pega aquí el texto exportado de Plantoeat..."
				class="w-full h-40 px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-indigo-400"
			></textarea>
			<div class="flex gap-2 mt-2">
				<button on:click={importRecipes} disabled={importing || !importText} class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50">
					{importing ? 'Importando...' : 'Importar'}
				</button>
				<button on:click={() => showImport = false} class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Cancelar</button>
			</div>
		</div>
	{/if}

	{#if showForm}
		<div class="mb-4 p-4 bg-white border border-indigo-200 rounded-lg shadow-sm">
			<h3 class="font-semibold text-gray-700 mb-3">{editingRecipe ? 'Editar receta' : 'Nueva receta'}</h3>
			<div class="grid grid-cols-1 gap-3">
				<input type="text" placeholder="Nombre *" bind:value={form.name} class="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				<textarea placeholder="Descripción" bind:value={form.description} class="px-3 py-2 border border-gray-300 rounded text-sm h-20 focus:outline-none focus:border-indigo-400"></textarea>
				<input type="text" placeholder="Tags (ej: comida,carne,rápido)" bind:value={form.tags} class="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				<div>
					<label class="text-sm text-gray-600">Días mínimos entre ocurrencias (-1 = usar valor global)</label>
					<input type="number" bind:value={form.min_days} min="-1" class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				</div>
			</div>
			<div class="flex gap-2 mt-3">
				<button on:click={saveRecipe} disabled={!form.name} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-50">Guardar</button>
				<button on:click={() => showForm = false} class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Cancelar</button>
			</div>
		</div>
	{/if}

	<div class="space-y-2">
		{#each filteredRecipes as recipe}
			<div class="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
				<div class="flex-1 min-w-0">
					<p class="font-medium text-gray-800">{recipe.name}</p>
					{#if recipe.description}
						<p class="text-sm text-gray-500 mt-0.5 line-clamp-2">{recipe.description}</p>
					{/if}
					{#if recipe.tags}
						<div class="flex flex-wrap gap-1 mt-1">
							{#each recipe.tags.split(',') as tag}
								<button on:click={() => toggleTag(tag)}
									class="text-xs px-1.5 py-0.5 rounded transition-colors {selectedTags.includes(tag.trim().toLowerCase())
										? 'bg-indigo-600 text-white'
										: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}">
									{tag.trim()}
								</button>
							{/each}
						</div>
					{/if}
					{#if recipe.min_days !== -1}
						<p class="text-xs text-gray-400 mt-1">Mín. {recipe.min_days} días entre ocurrencias</p>
					{/if}
				</div>
				<div class="flex gap-1 shrink-0">
					<button on:click={() => startEdit(recipe)} class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Editar</button>
					<button on:click={() => deleteRecipe(recipe.id)} class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded">Borrar</button>
				</div>
			</div>
		{:else}
			<div class="text-center py-12 text-gray-400">
				{searchQ ? 'Sin resultados' : 'No hay recetas. Añade una nueva o importa desde Plantoeat.'}
			</div>
		{/each}
	</div>
</div>
