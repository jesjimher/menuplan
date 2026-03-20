<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeekData } from '$lib/types/index.js';
	import { WEEKDAY_NAMES } from '$lib/utils/dates.js';

	let history: string[] = [];
	let selectedWeek: string | null = null;
	let weekData: WeekData | null = null;

	onMount(async () => {
		const res = await fetch('/api/history');
		history = await res.json();
	});

	async function selectWeek(weekKey: string) {
		selectedWeek = weekKey;
		const res = await fetch(`/api/week?weekKey=${weekKey}`);
		weekData = await res.json();
	}

	function getSlots(data: WeekData, weekday: number, mealType: string) {
		return data.slots.filter(s => s.weekday === weekday && s.meal_type === mealType && s.is_accompaniment === 0);
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="min-h-full bg-stone-50">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-5xl mx-auto">
			<h1 class="text-4xl font-bold leading-none text-gray-900" style="font-family: 'Playfair Display', serif">
				Histórico
			</h1>
			<p class="mt-1.5 text-sm text-stone-700">{history.length} semana{history.length !== 1 ? 's' : ''} planificada{history.length !== 1 ? 's' : ''}</p>
		</div>
	</div>

	<div class="max-w-5xl mx-auto px-6 py-6">
		<div class="flex gap-5">

			<!-- Lista de semanas -->
			<div class="w-44 shrink-0">
				{#if history.length === 0}
					<p class="text-sm text-stone-700 py-4">No hay semanas planificadas.</p>
				{:else}
					<div class="space-y-1">
						{#each history as wk}
							<button on:click={() => selectWeek(wk)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors
									{selectedWeek === wk
										? 'bg-indigo-600 text-white'
										: 'bg-white border border-stone-200 text-stone-800 hover:border-indigo-300 hover:text-indigo-600'}">
								{wk}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Detalle de semana -->
			<div class="flex-1 min-w-0">
				{#if weekData && selectedWeek}
					<h2 class="text-base font-semibold text-gray-700 mb-3">{selectedWeek}</h2>
					<div class="grid grid-cols-2 md:grid-cols-7 gap-2">
						{#each [1,2,3,4,5,6,7] as weekday, i}
							<div class="bg-white border border-stone-200 rounded-xl overflow-hidden">
								<div class="bg-indigo-50 px-2.5 py-2 border-b border-indigo-100">
									<p class="text-xs font-semibold text-indigo-800">{WEEKDAY_NAMES[i]}</p>
								</div>
								<div class="p-2">
									{#each ['comida', 'cena'] as mealType}
										<div class="mb-2 last:mb-0">
											<p class="text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">{mealType}</p>
											{#each getSlots(weekData, weekday, mealType) as slot}
												{#if slot.recipe}
													<p class="text-xs text-gray-700 font-medium truncate leading-snug">{slot.recipe.name}</p>
												{/if}
											{/each}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center h-48 text-stone-700">
						<p class="text-4xl mb-3">📚</p>
						<p class="text-sm">Selecciona una semana para ver el detalle.</p>
					</div>
				{/if}
			</div>

		</div>
	</div>
</div>
