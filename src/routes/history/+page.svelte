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

<div class="min-h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<div class="px-6 pt-8 pb-6" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="max-w-5xl mx-auto">
			<h1 class="text-4xl font-bold leading-none" style="font-family: 'Lora', serif; color: var(--text);">
				Histórico
			</h1>
			<p class="mt-1.5 text-sm" style="color: var(--text-secondary);">{history.length} semana{history.length !== 1 ? 's' : ''} planificada{history.length !== 1 ? 's' : ''}</p>
		</div>
	</div>

	<div class="max-w-5xl mx-auto px-6 py-6">
		<div class="flex gap-5">

			<!-- Lista de semanas -->
			<div class="w-44 shrink-0">
				{#if history.length === 0}
					<p class="text-sm py-4" style="color: var(--text-muted);">No hay semanas planificadas.</p>
				{:else}
					<div class="space-y-1">
						{#each history as wk}
							<button on:click={() => selectWeek(wk)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors"
								style="{selectedWeek === wk
									? 'background: var(--nav-active); color: white;'
									: `background: var(--surface); border: 1px solid var(--border); color: var(--text);`}"
								on:mouseenter={(e) => { if (selectedWeek !== wk) e.currentTarget.style.background = 'var(--surface-warm)'; }}
								on:mouseleave={(e) => { if (selectedWeek !== wk) e.currentTarget.style.background = 'var(--surface)'; }}>
								{wk}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Detalle de semana -->
			<div class="flex-1 min-w-0">
				{#if weekData && selectedWeek}
					<h2 class="text-lg font-semibold mb-3" style="font-family: 'Lora', serif; color: var(--text);">{selectedWeek}</h2>
					<div class="grid grid-cols-2 md:grid-cols-7 gap-2">
						{#each [1,2,3,4,5,6,7] as weekday, i}
							{@const isWeekend = weekday >= 6}
							<div class="rounded-xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);">
								<div class="px-2.5 py-2" style="background: {isWeekend ? 'var(--weekend-bg)' : 'var(--day-bg)'}; border-bottom: 1px solid var(--border);">
									<p class="text-xs font-semibold" style="color: var(--day-text);">{WEEKDAY_NAMES[i]}</p>
								</div>
								<div class="p-2">
									{#each ['comida', 'cena'] as mealType}
										{@const isComida = mealType === 'comida'}
										<div class="mb-2 last:mb-0">
											<p class="text-xs font-medium uppercase tracking-wide mb-1" style="color: {isComida ? 'var(--comida-accent)' : 'var(--cena-accent)'};">{mealType}</p>
											{#each getSlots(weekData, weekday, mealType) as slot}
												{#if slot.recipe}
													<p class="text-xs font-medium leading-snug line-clamp-2" style="color: var(--text); font-family: 'Lora', serif;">{slot.recipe.name}</p>
												{/if}
											{/each}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center h-48" style="color: var(--text-muted);">
						<p class="text-sm">Selecciona una semana para ver el detalle.</p>
					</div>
				{/if}
			</div>

		</div>
	</div>
</div>
