<script lang="ts">
	import { onMount } from 'svelte';
	import type { Options } from '$lib/types/index.js';

	let options: Options = {
		default_min_days: 5,
		meals_per_day: 1,
		dinners_per_day: 1,
		side_dishes_per_recipe: 1,
		side_dishes_per_slot: 0
	};
	let saved = false;

	onMount(async () => {
		const res = await fetch('/api/options');
		options = await res.json();
	});

	async function saveOptions() {
		await fetch('/api/options', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(options)
		});
		saved = true;
		setTimeout(() => saved = false, 2000);
	}
</script>

<div class="p-4 max-w-lg mx-auto">
	<h1 class="text-2xl font-bold text-gray-800 mb-6">Opciones</h1>

	<div class="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
		<div>
			<label class="text-sm font-medium text-gray-700">Días mínimos por defecto entre ocurrencias</label>
			<p class="text-xs text-gray-400 mb-1">Valor global si la receta no tiene uno propio</p>
			<input type="number" bind:value={options.default_min_days} min="0" class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
		</div>

		<div>
			<label class="text-sm font-medium text-gray-700">Número de comidas al día</label>
			<input type="number" bind:value={options.meals_per_day} min="1" class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
		</div>

		<div>
			<label class="text-sm font-medium text-gray-700">Número de cenas al día</label>
			<input type="number" bind:value={options.dinners_per_day} min="1" class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
		</div>

		<div>
			<label class="text-sm font-medium text-gray-700">Acompañamientos por receta</label>
			<p class="text-xs text-gray-400 mb-1">Cuántos acompañamientos planificar por cada receta</p>
			<input type="number" bind:value={options.side_dishes_per_recipe} min="0" class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
		</div>

		<div>
			<label class="text-sm font-medium text-gray-700">Acompañamientos por franja horaria</label>
			<p class="text-xs text-gray-400 mb-1">Un acompañamiento fijo por franja, independiente del nº de recetas</p>
			<input type="number" bind:value={options.side_dishes_per_slot} min="0" class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
		</div>

		<button on:click={saveOptions} class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium">
			{saved ? '✓ Guardado' : 'Guardar opciones'}
		</button>
	</div>
</div>
