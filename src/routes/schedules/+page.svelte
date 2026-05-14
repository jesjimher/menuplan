<script lang="ts">
	import type { ScheduleWithRecipe } from '$lib/types/index.js';
	import { WEEKDAY_NAMES } from '$lib/utils/dates.js';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let schedules = $state<ScheduleWithRecipe[]>(data.schedules);

	$effect(() => { schedules = data.schedules; });

	let editingId = $state<number | null>(null);
	let editN = $state(1);

	function startEdit(s: ScheduleWithRecipe) {
		editingId = s.id;
		editN = s.every_n_weeks;
	}

	async function saveEdit(s: ScheduleWithRecipe) {
		await fetch('/api/schedules', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				recipe_id: s.recipe_id,
				weekday: s.weekday,
				meal_type: s.meal_type,
				slot_index: s.slot_index,
				is_accompaniment: s.is_accompaniment,
				every_n_weeks: editN,
				anchor_week_key: s.anchor_week_key,
			})
		});
		editingId = null;
		await invalidateAll();
	}

	async function deleteSchedule(id: number) {
		if (!confirm('¿Eliminar esta programación?')) return;
		await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function deleteException(scheduleId: number, weekKey: string) {
		await fetch(`/api/schedules/${scheduleId}/exceptions`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ week_key: weekKey })
		});
		await invalidateAll();
	}
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
	<h1 class="text-2xl font-black mb-1" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">
		Programaciones
	</h1>
	<p class="text-sm mb-6" style="color: var(--text-secondary);">
		Recetas que se planifican automáticamente en intervalos regulares.
	</p>

	{#if schedules.length === 0}
		<div class="text-center py-16 rounded-2xl" style="background: var(--surface-container-low); color: var(--text-muted);">
			<svg class="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="4" width="18" height="18" rx="2"/>
				<line x1="16" y1="2" x2="16" y2="6"/>
				<line x1="8" y1="2" x2="8" y2="6"/>
				<line x1="3" y1="10" x2="21" y2="10"/>
			</svg>
			<p class="font-semibold">No hay programaciones activas</p>
			<p class="text-xs mt-1">Usa el icono de calendario en los slots de la vista semanal para programar recetas.</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each schedules as s (s.id)}
				<div class="rounded-2xl p-4" style="background: var(--surface);">
					<div class="flex items-start gap-3">
						<!-- Foto de la receta -->
						<div class="w-12 h-12 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
							style="background: var(--surface-container-low);">
							{#if s.recipe.image_type}
								<img src="/api/recipes/{s.recipe.id}/image" alt={s.recipe.name}
									class="w-full h-full object-cover" />
							{:else}
								<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-muted); opacity: 0.4;">
									<rect x="3" y="4" width="18" height="18" rx="2"/>
									<line x1="16" y1="2" x2="16" y2="6"/>
									<line x1="8" y1="2" x2="8" y2="6"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
								</svg>
							{/if}
						</div>

						<!-- Info -->
						<div class="flex-1 min-w-0">
							<p class="font-bold text-sm leading-tight" style="color: var(--text);">{s.recipe.name}</p>
							<p class="text-xs mt-0.5" style="color: var(--text-secondary);">
								{WEEKDAY_NAMES[s.weekday - 1]}, {s.meal_type}
								{s.slot_index > 0 ? `· slot ${s.slot_index + 1}` : ''}
							</p>

							<!-- Frecuencia (editable) -->
							<div class="mt-2 flex items-center gap-2">
								{#if editingId === s.id}
									<span class="text-xs" style="color: var(--text-muted);">Cada</span>
									<input
										type="number"
										min="1"
										max="52"
										bind:value={editN}
										class="w-14 px-2 py-1 rounded-lg text-center text-sm font-bold border-2 outline-none"
										style="background: var(--surface-container-low); color: var(--text); border-color: var(--primary);"
									/>
									<span class="text-xs" style="color: var(--text-muted);">semanas</span>
									<button
										on:click={() => saveEdit(s)}
										class="text-xs font-bold px-2 py-1 rounded-lg"
										style="background: var(--primary); color: white;"
									>Guardar</button>
									<button
										on:click={() => editingId = null}
										class="text-xs px-2 py-1 rounded-lg"
										style="color: var(--text-secondary);"
									>Cancelar</button>
								{:else}
									<span class="text-xs font-semibold px-2 py-0.5 rounded-full"
										style="background: var(--secondary-container); color: var(--secondary);">
										Cada {s.every_n_weeks} {s.every_n_weeks === 1 ? 'semana' : 'semanas'}
									</span>
									<button
										on:click={() => startEdit(s)}
										class="text-xs font-semibold underline"
										style="color: var(--text-muted);"
									>Editar</button>
								{/if}
							</div>

							<!-- Excepciones -->
							{#if s.exceptions.length > 0}
								<div class="mt-2">
									<p class="text-[10px] font-bold uppercase tracking-wider mb-1" style="color: var(--text-muted);">
										Semanas excluidas
									</p>
									<div class="flex flex-wrap gap-1">
										{#each s.exceptions as ex}
											<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
												style="background: var(--surface-container-highest); color: var(--text-secondary);">
												{ex}
												<button
													on:click={() => deleteException(s.id, ex)}
													class="hover:opacity-60 font-bold"
													aria-label="Quitar excepción {ex}"
												>&times;</button>
											</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						<!-- Botón eliminar -->
						<button
							on:click={() => deleteSchedule(s.id)}
							class="w-7 h-7 flex items-center justify-center rounded-full shrink-0 transition-colors"
							style="color: var(--error); background: var(--error-container, #fce8e8);"
							aria-label="Eliminar programación"
							title="Eliminar programación"
						>
							<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<polyline points="3 6 5 6 21 6"/>
								<path d="M19 6l-1 14H6L5 6"/>
								<path d="M10 11v6M14 11v6"/>
								<path d="M9 6V4h6v2"/>
							</svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
