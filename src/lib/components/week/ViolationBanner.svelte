<script lang="ts">
	import type { RuleViolation } from '$lib/types/index.js';

	let { violations }: { violations: RuleViolation[] } = $props();
</script>

<div class="mt-4 mb-4 px-4 py-3 flex items-center gap-3 rounded-xl shrink-0"
	style="{violations.length > 0
		? `background: var(--error-bg); border-left: 4px solid var(--error);`
		: `background: var(--success-bg); border-left: 4px solid var(--success);`}">
	{#if violations.length > 0}
		<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style="background: rgba(186,26,26,0.1);">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--error);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
		</div>
		<div class="flex-1 min-w-0">
			<p class="text-xs font-black uppercase tracking-wide" style="font-family: 'Epilogue', sans-serif; color: var(--error);">Reglas incumplidas</p>
			<p class="text-sm truncate mt-0.5" style="color: var(--error);">{violations.map(v => v.message).join(' · ')}</p>
		</div>
	{:else}
		<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style="background: rgba(45,106,62,0.1);">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--success);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
		</div>
		<p class="text-sm font-medium" style="color: var(--success);">Se cumplen todas las reglas</p>
	{/if}
</div>
