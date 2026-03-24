<script lang="ts">
	import { onMount } from 'svelte';
	import type { Rule } from '$lib/types/index.js';
	import TagBadgeInput from '$lib/components/TagBadgeInput.svelte';

	let rules: Rule[] = [];
	let allTags: string[] = [];
	let showForm = false;
	let editingRule: Rule | null = null;
	let form = { tag: '', direction: 'at_least' as 'at_least' | 'no_more_than', times: 1 };

	onMount(async () => {
		await Promise.all([loadRules(), loadTags()]);
	});

	async function loadRules() {
		const res = await fetch('/api/rules');
		rules = await res.json();
	}

	async function loadTags() {
		const res = await fetch('/api/recipes?tags=1');
		allTags = await res.json();
	}

	function startEdit(r: Rule) {
		editingRule = r;
		form = { tag: r.tag, direction: r.direction, times: r.times };
		showForm = true;
	}

	function startNew() {
		editingRule = null;
		form = { tag: '', direction: 'at_least', times: 1 };
		showForm = true;
	}

	async function saveRule() {
		if (!form.tag) return;
		if (editingRule) {
			await fetch(`/api/rules/${editingRule.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
		} else {
			await fetch('/api/rules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
		}
		showForm = false;
		await loadRules();
	}

	async function deleteRule(id: number) {
		if (!confirm('¿Eliminar esta regla?')) return;
		await fetch(`/api/rules/${id}`, { method: 'DELETE' });
		await loadRules();
	}

	function ruleText(r: Rule) {
		return r.direction === 'at_least'
			? `Al menos ${r.times} ${r.times > 1 ? 'veces' : 'vez'} "${r.tag}" por semana`
			: `No más de ${r.times} ${r.times > 1 ? 'veces' : 'vez'} "${r.tag}" por semana`;
	}
</script>

<div class="min-h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<div class="px-6 pt-8 pb-6" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="max-w-2xl mx-auto flex items-end justify-between gap-4">
			<div>
				<h1 class="text-4xl font-bold leading-none" style="font-family: 'Lora', serif; color: var(--text);">
					Reglas
				</h1>
				<p class="mt-1.5 text-sm" style="color: var(--text-secondary);">{rules.length} regla{rules.length !== 1 ? 's' : ''} definida{rules.length !== 1 ? 's' : ''}</p>
			</div>
			<button on:click={startNew}
				class="p-2 sm:px-4 sm:py-2 rounded-lg transition-colors shrink-0"
			title="Nueva regla"
				style="background: var(--primary); color: white;"
				on:mouseenter={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
				on:mouseleave={(e) => e.currentTarget.style.background = 'var(--primary)'}>
				+ Nueva regla
			</button>
		</div>
	</div>

	<div class="max-w-2xl mx-auto px-6 py-6">

		<!-- Formulario -->
		{#if showForm}
			<div class="mb-6 p-5 rounded-2xl shadow-sm" style="background: var(--surface); border: 1px solid var(--border);">
				<h3 class="text-lg font-semibold mb-4" style="font-family: 'Lora', serif; color: var(--text);">{editingRule ? 'Editar regla' : 'Nueva regla'}</h3>
				<div class="grid gap-3">
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">Tag</label>
						<TagBadgeInput bind:value={form.tag} tags={allTags} placeholder="ej: pescado, carne, vegetariano" multiple={false} />
					</div>
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">Condición</label>
						<select bind:value={form.direction}
							class="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
							style="border: 1px solid var(--border); color: var(--text); background: var(--surface);">
							<option value="at_least">Al menos</option>
							<option value="no_more_than">No más de</option>
						</select>
					</div>
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">Número de veces</label>
						<input type="number" bind:value={form.times} min="1"
							class="w-28 px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
							style="border: 1px solid var(--border); color: var(--text);" />
					</div>
				</div>
				<div class="flex gap-2 mt-4">
					<button on:click={saveRule} disabled={!form.tag}
						class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
						style="background: var(--primary); color: white;">
						Guardar
					</button>
					<button on:click={() => showForm = false}
						class="px-4 py-2 rounded-lg text-sm transition-colors"
						style="background: var(--surface-warm); color: var(--text);">
						Cancelar
					</button>
				</div>
			</div>
		{/if}

		<!-- Lista de reglas -->
		<div class="space-y-2">
			{#each rules as rule}
				<div class="group flex items-center justify-between p-4 rounded-2xl transition-all duration-150"
					style="background: var(--surface); border: 1px solid var(--border);">
					<div class="flex items-center gap-3">
						<div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
							style="background: {rule.direction === 'at_least' ? 'var(--success-bg)' : 'var(--error-bg)'};">
							<svg class="w-4 h-4" fill="none" stroke="{rule.direction === 'at_least' ? 'var(--success)' : 'var(--error)'}" viewBox="0 0 24 24">
								{#if rule.direction === 'at_least'}
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
								{:else}
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
								{/if}
							</svg>
						</div>
						<div>
							<p class="text-sm font-medium" style="color: var(--text);">{ruleText(rule)}</p>
							<span class="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
								style="{rule.direction === 'at_least'
									? 'background: var(--success-bg); color: var(--success);'
									: 'background: var(--error-bg); color: var(--error);'}">
								{rule.direction === 'at_least' ? 'mínimo' : 'máximo'}
							</span>
						</div>
					</div>
					<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
						<button on:click={() => startEdit(rule)}
							class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
							style="color: var(--text-secondary);"
							on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
							on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
							Editar
						</button>
						<button on:click={() => deleteRule(rule.id)}
							class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
							style="color: var(--error);">
							Borrar
						</button>
					</div>
				</div>
			{:else}
				<div class="text-center py-16" style="color: var(--text-muted);">
					<p class="text-sm">No hay reglas definidas. Las reglas ayudan a equilibrar el plan semanal.</p>
				</div>
			{/each}
		</div>
	</div>
</div>
