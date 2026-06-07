<script lang="ts">
	import type { Recipe, ScheduleWithRecipe, ScheduleConflictMode } from '$lib/types/index.js';
	import { WEEKDAY_NAMES, getWeekDates } from '$lib/utils/dates.js';

	const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

	const CONFLICT_OPTIONS: { value: ScheduleConflictMode; label: string; description: string }[] = [
		{ value: 'skip', label: 'No planificar si ya hay receta', description: 'Si el día ya tiene una receta asignada, esta programación se salta.' },
		{ value: 'overwrite', label: 'Sobreescribir la receta existente', description: 'Esta programación tiene prioridad y reemplaza cualquier receta que hubiera.' },
		{ value: 'add', label: 'Añadir junto a la receta existente', description: 'Se añade como plato adicional en esa comida.' },
	];

	function formatWeekKey(wk: string): string {
		const dates = getWeekDates(wk);
		return `${dates[0].getUTCDate()} a ${dates[6].getUTCDate()} de ${MONTH_NAMES[dates[6].getUTCMonth()]}`;
	}

	let {
		open,
		weekKey,
		weekday,
		mealType,
		slotIndex,
		isAccompaniment,
		recipe,
		schedule,
		onSaved,
		onDeleted,
		onClose,
	}: {
		open: boolean;
		weekKey: string;
		weekday: number;
		mealType: string;
		slotIndex: number;
		isAccompaniment: number;
		recipe: Recipe;
		schedule: ScheduleWithRecipe | null;
		onSaved: () => void;
		onDeleted: () => void;
		onClose: () => void;
	} = $props();

	let everyNWeeks = $state(schedule?.every_n_weeks ?? 2);
	let onConflict = $state<ScheduleConflictMode>(schedule?.on_conflict ?? 'skip');
	let priority = $state(schedule?.priority ?? 5);
	let saving = $state(false);
	let deleting = $state(false);

	$effect(() => {
		everyNWeeks = schedule?.every_n_weeks ?? 2;
		onConflict = schedule?.on_conflict ?? 'skip';
		priority = schedule?.priority ?? 5;
	});

	async function save() {
		saving = true;
		try {
			await fetch('/api/schedules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipe_id: recipe.id,
					weekday,
					meal_type: mealType,
					is_accompaniment: isAccompaniment,
					every_n_weeks: everyNWeeks,
					anchor_week_key: weekKey,
					on_conflict: onConflict,
					priority,
				}),
			});
			onSaved();
		} finally {
			saving = false;
		}
	}

	async function deleteSchedule() {
		if (!schedule) return;
		deleting = true;
		try {
			await fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
			onDeleted();
		} finally {
			deleting = false;
		}
	}
</script>

{#if open}
	<!-- Overlay -->
	<div class="fixed inset-0 z-[200] flex items-center justify-center p-4"
		style="background: rgba(0,0,0,0.5);"
		on:click|self={onClose}
	>
		<div class="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
			style="background: var(--surface); box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

			<!-- Cabecera -->
			<div>
				<h2 class="text-base font-bold" style="color: var(--text); font-family: 'Epilogue', sans-serif;">
					{schedule ? 'Programación activa' : 'Programar receta'}
				</h2>
				<p class="text-sm mt-0.5" style="color: var(--text-secondary);">
					<span class="font-semibold" style="color: var(--primary);">«{recipe.name}»</span>
					— {WEEKDAY_NAMES[weekday - 1]}, {mealType}
				</p>
			</div>

			<!-- Campo frecuencia -->
			<div>
				<label class="block text-sm font-semibold mb-2" style="color: var(--text);">
					Repetir cada
				</label>
				<div class="flex items-center gap-3">
					<input
						type="number"
						min="1"
						max="52"
						bind:value={everyNWeeks}
						class="w-20 px-3 py-2 rounded-xl text-center text-lg font-bold border-2 outline-none transition-colors"
						style="background: var(--surface-container-low); color: var(--text); border-color: var(--primary);"
					/>
					<span class="text-sm font-medium" style="color: var(--text-secondary);">
						{everyNWeeks === 1 ? 'semana' : 'semanas'}
					</span>
				</div>
				{#if everyNWeeks > 1}
					<p class="text-xs mt-2" style="color: var(--text-muted);">
						La semana de referencia es la del {formatWeekKey(weekKey)}. La receta se planificará cada {everyNWeeks} semanas a partir de ahí.
					</p>
				{/if}
			</div>

			<!-- Modo de conflicto -->
			<div>
				<label class="block text-sm font-semibold mb-2" style="color: var(--text);">
					Si el slot ya tiene receta
				</label>
				<div class="flex flex-col gap-1.5">
					{#each CONFLICT_OPTIONS as opt}
						<label class="flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors"
							style="{onConflict === opt.value ? 'background: var(--primary-light); border: 1.5px solid var(--primary);' : 'background: var(--surface-container-low); border: 1.5px solid transparent;'}">
							<input type="radio" name="on_conflict" value={opt.value} bind:group={onConflict} class="mt-0.5 accent-[var(--primary)]" />
							<div>
								<span class="text-sm font-semibold block" style="color: var(--text);">{opt.label}</span>
								<span class="text-xs" style="color: var(--text-muted);">{opt.description}</span>
							</div>
						</label>
					{/each}
				</div>
			</div>

			<!-- Prioridad -->
			<div>
				<label class="block text-sm font-semibold mb-2" style="color: var(--text);">
					Prioridad
				</label>
				<input
					type="range"
					min="1"
					max="10"
					bind:value={priority}
					class="w-full accent-[var(--primary)]"
				/>
				<div class="flex justify-between text-xs mt-1" style="color: var(--text-muted);">
					<span>Menos prioritaria</span>
					<span>Más prioritaria</span>
				</div>
			</div>

			<!-- Botones -->
			<div class="flex flex-col gap-2 pt-2">
				<button
					on:click={save}
					disabled={saving}
					class="w-full py-2.5 rounded-xl font-bold text-sm transition-opacity disabled:opacity-50"
					style="background: var(--primary); color: white;"
				>
					{saving ? 'Guardando…' : schedule ? 'Guardar cambios' : 'Programar'}
				</button>

				{#if schedule}
					<button
						on:click={deleteSchedule}
						disabled={deleting}
						class="w-full py-2.5 rounded-xl font-bold text-sm transition-opacity disabled:opacity-50"
						style="background: var(--error-container, #fce8e8); color: var(--error);"
					>
						{deleting ? 'Eliminando…' : 'Eliminar programación'}
					</button>
				{/if}

				<button
					on:click={onClose}
					class="w-full py-2 rounded-xl text-sm transition-colors"
					style="color: var(--text-secondary);"
				>
					Cancelar
				</button>
			</div>
		</div>
	</div>
{/if}
