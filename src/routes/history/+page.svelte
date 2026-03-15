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

<div class="p-4 max-w-5xl mx-auto">
	<h1 class="text-2xl font-bold text-gray-800 mb-4">Histórico</h1>

	<div class="flex gap-4">
		<!-- Week list -->
		<div class="w-48 shrink-0">
			{#if history.length === 0}
				<p class="text-sm text-gray-400">No hay semanas planificadas.</p>
			{:else}
				<div class="space-y-1">
					{#each history as wk}
						<button
							on:click={() => selectWeek(wk)}
							class="w-full text-left px-3 py-2 rounded text-sm {selectedWeek === wk ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'}"
						>{wk}</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Week detail -->
		<div class="flex-1">
			{#if weekData && selectedWeek}
				<h2 class="text-lg font-semibold text-gray-700 mb-3">{selectedWeek}</h2>
				<div class="grid grid-cols-2 md:grid-cols-7 gap-2">
					{#each [1,2,3,4,5,6,7] as weekday, i}
						<div class="bg-white border border-gray-200 rounded-lg p-2">
							<p class="text-xs font-semibold text-gray-500 mb-1">{WEEKDAY_NAMES[i]}</p>
							{#each ['comida', 'cena'] as mealType}
								<div class="mb-2">
									<p class="text-xs text-gray-400">{mealType}</p>
									{#each getSlots(weekData, weekday, mealType) as slot}
										{#if slot.recipe}
											<p class="text-xs text-gray-700 font-medium truncate">{slot.recipe.name}</p>
										{/if}
									{/each}
								</div>
							{/each}
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-gray-400 text-center py-12">Selecciona una semana para ver el detalle.</div>
			{/if}
		</div>
	</div>
</div>
