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

<div class="min-h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<div class="px-6 pt-8 pb-6" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="max-w-lg mx-auto">
			<h1 class="text-4xl font-bold leading-none" style="font-family: 'Lora', serif; color: var(--text);">
				Opciones
			</h1>
			<p class="mt-1.5 text-sm" style="color: var(--text-secondary);">Configuración global del planificador</p>
		</div>
	</div>

	<div class="max-w-lg mx-auto px-6 py-6">
		<div class="rounded-2xl shadow-sm overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);">

			<div class="divide-y" style="--tw-divide-opacity: 1; border-color: var(--border);">
				<div class="px-5 py-4" style="border-color: var(--border);">
					<label class="block text-sm font-medium mb-0.5" style="color: var(--text);">Días mínimos por defecto entre ocurrencias</label>
					<p class="text-xs mb-2" style="color: var(--text-muted);">Valor global si la receta no tiene uno propio</p>
					<input type="number" bind:value={options.default_min_days} min="0"
						class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
				</div>

				<div class="px-5 py-4" style="border-color: var(--border);">
					<label class="block text-sm font-medium mb-2" style="color: var(--text);">Número de comidas al día</label>
					<input type="number" bind:value={options.meals_per_day} min="1"
						class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
				</div>

				<div class="px-5 py-4" style="border-color: var(--border);">
					<label class="block text-sm font-medium mb-2" style="color: var(--text);">Número de cenas al día</label>
					<input type="number" bind:value={options.dinners_per_day} min="1"
						class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
				</div>

				<div class="px-5 py-4" style="border-color: var(--border);">
					<label class="block text-sm font-medium mb-0.5" style="color: var(--text);">Acompañamientos por receta</label>
					<p class="text-xs mb-2" style="color: var(--text-muted);">Cuántos acompañamientos planificar por cada receta</p>
					<input type="number" bind:value={options.side_dishes_per_recipe} min="0"
						class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
				</div>

				<div class="px-5 py-4" style="border-color: var(--border);">
					<label class="block text-sm font-medium mb-0.5" style="color: var(--text);">Acompañamientos por franja horaria</label>
					<p class="text-xs mb-2" style="color: var(--text-muted);">Un acompañamiento fijo por franja, independiente del nº de recetas</p>
					<input type="number" bind:value={options.side_dishes_per_slot} min="0"
						class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);" />
				</div>
			</div>

			<div class="px-5 py-4" style="background: var(--surface-warm); border-top: 1px solid var(--border);">
				<button on:click={saveOptions}
					class="w-full px-4 py-2.5 font-medium rounded-lg text-sm transition-colors"
					style="{saved
						? 'background: var(--success); color: white;'
						: 'background: var(--primary); color: white;'}"
					on:mouseenter={(e) => { if (!saved) e.currentTarget.style.background = 'var(--primary-hover)'; }}
					on:mouseleave={(e) => { if (!saved) e.currentTarget.style.background = 'var(--primary)'; }}>
					{saved ? 'Guardado' : 'Guardar opciones'}
				</button>
			</div>
		</div>
	</div>
</div>
