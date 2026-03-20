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

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="min-h-full bg-stone-50">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-lg mx-auto">
			<h1 class="text-4xl font-bold leading-none text-gray-900" style="font-family: 'Playfair Display', serif">
				Opciones
			</h1>
			<p class="mt-1.5 text-sm text-stone-700">Configuración global del planificador</p>
		</div>
	</div>

	<div class="max-w-lg mx-auto px-6 py-6">
		<div class="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">

			<div class="divide-y divide-stone-100">
				<div class="px-5 py-4">
					<label class="block text-sm font-medium text-gray-700 mb-0.5">Días mínimos por defecto entre ocurrencias</label>
					<p class="text-xs text-stone-700 mb-2">Valor global si la receta no tiene uno propio</p>
					<input type="number" bind:value={options.default_min_days} min="0"
						class="w-28 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all" />
				</div>

				<div class="px-5 py-4">
					<label class="block text-sm font-medium text-gray-700 mb-2">Número de comidas al día</label>
					<input type="number" bind:value={options.meals_per_day} min="1"
						class="w-28 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all" />
				</div>

				<div class="px-5 py-4">
					<label class="block text-sm font-medium text-gray-700 mb-2">Número de cenas al día</label>
					<input type="number" bind:value={options.dinners_per_day} min="1"
						class="w-28 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all" />
				</div>

				<div class="px-5 py-4">
					<label class="block text-sm font-medium text-gray-700 mb-0.5">Acompañamientos por receta</label>
					<p class="text-xs text-stone-700 mb-2">Cuántos acompañamientos planificar por cada receta</p>
					<input type="number" bind:value={options.side_dishes_per_recipe} min="0"
						class="w-28 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all" />
				</div>

				<div class="px-5 py-4">
					<label class="block text-sm font-medium text-gray-700 mb-0.5">Acompañamientos por franja horaria</label>
					<p class="text-xs text-stone-700 mb-2">Un acompañamiento fijo por franja, independiente del nº de recetas</p>
					<input type="number" bind:value={options.side_dishes_per_slot} min="0"
						class="w-28 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all" />
				</div>
			</div>

			<div class="px-5 py-4 bg-stone-50 border-t border-stone-100">
				<button on:click={saveOptions}
					class="w-full px-4 py-2.5 font-medium rounded-lg text-sm transition-colors
						{saved ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}">
					{saved ? '✓ Guardado' : 'Guardar opciones'}
				</button>
			</div>
		</div>
	</div>
</div>
