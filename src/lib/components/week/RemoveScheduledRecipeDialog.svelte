<script lang="ts">
	let {
		open,
		recipeName,
		everyNWeeks,
		onOnlyThisWeek,
		onFullSchedule,
		onCancel,
	}: {
		open: boolean;
		recipeName: string;
		everyNWeeks: number;
		onOnlyThisWeek: () => void;
		onFullSchedule: () => void;
		onCancel: () => void;
	} = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
		style="background: rgba(0,0,0,0.5);"
		on:click|self={onCancel}
	>
		<div class="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-3"
			style="background: var(--surface); box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

			<div>
				<h2 class="text-base font-bold" style="color: var(--text); font-family: 'Epilogue', sans-serif;">
					Receta programada
				</h2>
				<p class="text-sm mt-1" style="color: var(--text-secondary);">
					«<span class="font-semibold" style="color: var(--text);">{recipeName}</span>»
					está programada cada {everyNWeeks} {everyNWeeks === 1 ? 'semana' : 'semanas'}.
					¿Qué quieres hacer?
				</p>
			</div>

			<div class="flex flex-col gap-2 pt-1">
				<button
					on:click={onOnlyThisWeek}
					class="w-full py-2.5 rounded-xl font-bold text-sm text-left px-4 transition-colors"
					style="background: var(--surface-container-low); color: var(--text);"
				>
					Quitar solo esta semana
					<span class="block text-xs font-normal mt-0.5" style="color: var(--text-muted);">
						La programación continúa en semanas futuras
					</span>
				</button>

				<button
					on:click={onFullSchedule}
					class="w-full py-2.5 rounded-xl font-bold text-sm text-left px-4 transition-colors"
					style="background: var(--error-container, #fce8e8); color: var(--error);"
				>
					Eliminar la programación completa
					<span class="block text-xs font-normal mt-0.5" style="color: var(--error); opacity: 0.7;">
						No se planificará más en semanas futuras
					</span>
				</button>

				<button
					on:click={onCancel}
					class="w-full py-2 rounded-xl text-sm transition-colors"
					style="color: var(--text-secondary);"
				>
					Cancelar
				</button>
			</div>
		</div>
	</div>
{/if}
