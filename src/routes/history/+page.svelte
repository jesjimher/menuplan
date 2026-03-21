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

<div class="min-h-full" style="background: #f0ebe3; font-family: 'DM Sans', sans-serif;">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-5xl mx-auto">
			<h1 class="text-4xl font-bold leading-none text-stone-900" style="font-family: 'Lora', serif">
				Histórico
			</h1>
			<p class="mt-1.5 text-sm text-stone-600">{history.length} semana{history.length !== 1 ? 's' : ''} planificada{history.length !== 1 ? 's' : ''}</p>
		</div>
	</div>

	<div class="max-w-5xl mx-auto px-6 py-6">
		<div class="flex gap-5">

			<!-- Lista de semanas -->
			<div class="w-44 shrink-0">
				{#if history.length === 0}
					<p class="text-sm text-stone-500 py-4">No hay semanas planificadas.</p>
				{:else}
					<div class="space-y-1">
						{#each history as wk}
							<button on:click={() => selectWeek(wk)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors
									{selectedWeek === wk
										? 'bg-stone-900 text-white'
										: 'bg-white border border-stone-200 text-stone-800 hover:border-stone-300 hover:bg-stone-50'}">
								{wk}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Detalle de semana -->
			<div class="flex-1 min-w-0">
				{#if weekData && selectedWeek}
					<h2 class="text-base font-semibold text-stone-800 mb-3" style="font-family: 'Lora', serif">{selectedWeek}</h2>
					<div class="grid grid-cols-2 md:grid-cols-7 gap-2">
						{#each [1,2,3,4,5,6,7] as weekday, i}
							{@const isWeekend = weekday >= 6}
							<div class="bg-white border border-stone-200 rounded-xl overflow-hidden">
								<div class="px-2.5 py-2 border-b" style="background: {isWeekend ? '#f5ebe0' : '#eef2f7'}; border-color: {isWeekend ? '#e8d5c0' : '#d8e4ef'};">
									<p class="text-xs font-semibold" style="color: {isWeekend ? '#7c2828' : '#1c3a5a'}">{WEEKDAY_NAMES[i]}</p>
								</div>
								<div class="p-2">
									{#each ['comida', 'cena'] as mealType}
										{@const isComida = mealType === 'comida'}
										<div class="mb-2 last:mb-0">
											<p class="text-xs font-medium uppercase tracking-wide mb-1" style="color: {isComida ? '#5a9dc0' : '#c88030'}">{mealType}</p>
											{#each getSlots(weekData, weekday, mealType) as slot}
												{#if slot.recipe}
													<p class="text-xs font-medium leading-snug line-clamp-2" style="color: {isComida ? '#0e2840' : '#3a1800'}; font-family: 'Lora', serif">{slot.recipe.name}</p>
												{/if}
											{/each}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center h-48 text-stone-500">
						<p class="text-4xl mb-3">📚</p>
						<p class="text-sm">Selecciona una semana para ver el detalle.</p>
					</div>
				{/if}
			</div>

		</div>
	</div>
</div>
