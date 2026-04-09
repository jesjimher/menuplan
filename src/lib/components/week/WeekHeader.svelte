<script lang="ts">
	import { sidebarOpen } from '$lib/stores/ui.js';
	import { getWeekDates } from '$lib/utils/dates.js';

	let {
		weekKey,
		calculating = false,
		onPrevWeek,
		onToday,
		onNextWeek,
		onCalculate,
		onRecalculate,
		onClear,
		onCopyPrevious
	}: {
		weekKey: string;
		calculating: boolean;
		onPrevWeek: () => void;
		onToday: () => void;
		onNextWeek: () => void;
		onCalculate: () => void;
		onRecalculate: () => void;
		onClear: () => void;
		onCopyPrevious: () => void;
	} = $props();

	const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

	const dates = $derived(getWeekDates(weekKey));
	const year = $derived(parseInt(weekKey.split('-W')[0]));
	const weekDisplay = $derived(dates?.length === 7 ? `${dates[0].getUTCDate()} a ${dates[6].getUTCDate()} de ${MONTH_NAMES[dates[6].getUTCMonth()]}` : '');
</script>

<header class="px-4 sm:px-6 py-3 shrink-0 relative" style="background: rgba(255,248,243,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-container-highest);">
	<div class="flex items-center">
		<div class="flex items-center gap-2 sm:gap-3 shrink-0" style="width: 14rem">
			<button class="lg:hidden p-1.5 rounded-lg transition-colors shrink-0"
				style="color: var(--primary);"
				aria-label="Abrir menú lateral"
				on:click={() => $sidebarOpen = true}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<h1 class="text-lg sm:text-xl font-black tracking-tight" style="font-family: 'Epilogue', sans-serif; color: var(--primary); line-height: 1.2;">
				<div class="sm:hidden">{weekDisplay}</div>
				<div class="hidden sm:inline-block">
					<div>{weekDisplay}</div>
					<div class="text-xs font-normal" style="color: var(--text-muted); margin-top: 0.125rem;">{year}</div>
				</div>
			</h1>
		</div>

		<nav class="flex items-center gap-1 sm:gap-2 text-sm font-bold" aria-label="Navegación de semanas">
			<button on:click={onPrevWeek}
				class="nav-btn p-2 rounded-lg transition-colors"
				aria-label="Semana anterior"
				title="Anterior">
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
			</button>
			<button on:click={onToday}
				class="nav-btn px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold"
				aria-label="Ir a la semana actual"
				title="Hoy">
				Hoy
			</button>
			<button on:click={onNextWeek}
				class="nav-btn p-2 rounded-lg transition-colors"
				aria-label="Semana siguiente"
				title="Siguiente">
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
			</button>
		</nav>

		<div class="ml-auto flex gap-1 sm:gap-2 items-center">
			<div class="hidden sm:flex items-center gap-1 pr-2 mr-1" style="border-right: 1px solid var(--surface-container-highest);">
				<button on:click={onCopyPrevious}
					class="icon-btn p-2 rounded-lg transition-colors"
					aria-label="Copiar semana anterior"
					title="Copiar semana anterior">
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
				</button>
				<button on:click={onClear}
					class="icon-btn p-2 rounded-lg transition-colors"
					aria-label="Limpiar plan"
					title="Limpiar plan">
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
				</button>
			</div>
			<button on:click={onRecalculate} disabled={calculating}
				class="nav-btn hidden sm:inline-flex px-3 py-1.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
				title="Recalcular plan completo">
				{calculating ? 'Calculando...' : 'Recalcular'}
			</button>
			<button on:click={onCalculate} disabled={calculating}
				class="calc-btn px-4 sm:px-5 py-2 rounded-full text-sm font-bold disabled:opacity-40 transition-all shadow-sm"
				title="Completar huecos">
				{#if calculating}
					<span class="sm:hidden">...</span>
					<span class="hidden sm:inline">Calculando...</span>
				{:else}
					<svg class="sm:hidden w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
					<span class="hidden sm:inline">Completar huecos</span>
				{/if}
			</button>
		</div>
	</div>
</header>

<style>
	.nav-btn {
		color: var(--text-secondary);
	}
	.nav-btn:hover {
		background: var(--surface-container);
	}
	.icon-btn {
		color: var(--text-secondary);
	}
	.icon-btn:hover {
		background: var(--surface-container);
	}
	.calc-btn {
		background: var(--primary);
		color: white;
	}
	.calc-btn:hover:not(:disabled) {
		background: var(--primary-hover);
	}
</style>
