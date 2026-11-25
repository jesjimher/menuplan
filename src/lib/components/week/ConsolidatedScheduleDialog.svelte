<script lang="ts">
	// Receta de un día ya pasado que venía de una programación. Al quitarla o cambiarla por lo
	// que realmente se comió, permite retrasar la rotación para no perder la receta que tocaba.
	let {
		mode,
		recipeName,
		onDelay,
		onKeep,
		onCancel,
	}: {
		/** 'remove': se va a quitar la receta; 'changed': ya se cambió por otra. */
		mode: 'remove' | 'changed';
		recipeName: string;
		onDelay: () => void;
		onKeep: () => void;
		onCancel: () => void;
	} = $props();
</script>

<div class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
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
				Ese día tocaba «<span class="font-semibold" style="color: var(--text);">{recipeName}</span>»
				por una programación.
				{mode === 'remove' ? '¿Qué hacemos con ella?' : '¿Quieres que pase a la semana siguiente?'}
			</p>
		</div>

		<div class="flex flex-col gap-2 pt-1">
			<button
				on:click={onDelay}
				class="w-full py-2.5 rounded-xl font-bold text-sm text-left px-4 transition-colors"
				style="background: var(--surface-container-low); color: var(--text);"
			>
				{mode === 'remove' ? 'Quitarla y pasarla a la semana siguiente' : 'Pasarla a la semana siguiente'}
				<span class="block text-xs font-normal mt-0.5" style="color: var(--text-muted);">
					El resto de la rotación se retrasa una semana
				</span>
			</button>

			<button
				on:click={onKeep}
				class="w-full py-2.5 rounded-xl font-bold text-sm text-left px-4 transition-colors"
				style="background: var(--surface-container-low); color: var(--text);"
			>
				{mode === 'remove' ? 'Quitarla solo de este día' : 'No, la programación sigue igual'}
				<span class="block text-xs font-normal mt-0.5" style="color: var(--text-muted);">
					Las próximas semanas no cambian
				</span>
			</button>

			{#if mode === 'remove'}
				<button
					on:click={onCancel}
					class="w-full py-2 rounded-xl text-sm transition-colors"
					style="color: var(--text-secondary);"
				>
					Cancelar
				</button>
			{/if}
		</div>
	</div>
</div>
