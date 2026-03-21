<script lang="ts">
	import { onMount } from 'svelte';
	import type { Rule } from '$lib/types/index.js';

	let rules: Rule[] = [];
	let showForm = false;
	let editingRule: Rule | null = null;
	let form = { tag: '', direction: 'at_least' as 'at_least' | 'no_more_than', times: 1 };

	onMount(loadRules);

	async function loadRules() {
		const res = await fetch('/api/rules');
		rules = await res.json();
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
			? `Al menos ${r.times} vez${r.times > 1 ? 'ces' : ''} "${r.tag}" por semana`
			: `No más de ${r.times} vez${r.times > 1 ? 'ces' : ''} "${r.tag}" por semana`;
	}
</script>

<div class="min-h-full" style="background: #f0ebe3; font-family: 'DM Sans', sans-serif;">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-2xl mx-auto flex items-end justify-between gap-4">
			<div>
				<h1 class="text-4xl font-bold leading-none text-stone-900" style="font-family: 'Lora', serif">
					Reglas
				</h1>
				<p class="mt-1.5 text-sm text-stone-600">{rules.length} regla{rules.length !== 1 ? 's' : ''} definida{rules.length !== 1 ? 's' : ''}</p>
			</div>
			<button on:click={startNew}
				class="px-4 py-2 text-sm font-medium bg-stone-800 hover:bg-stone-900 text-white rounded-lg transition-colors shrink-0">
				+ Nueva regla
			</button>
		</div>
	</div>

	<div class="max-w-2xl mx-auto px-6 py-6">

		<!-- Formulario -->
		{#if showForm}
			<div class="mb-6 p-5 bg-white border border-stone-200 rounded-2xl shadow-sm">
				<h3 class="font-semibold text-stone-900 mb-4" style="font-family: 'Lora', serif">{editingRule ? 'Editar regla' : 'Nueva regla'}</h3>
				<div class="grid gap-3">
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">Tag</label>
						<input type="text" placeholder="ej: pescado, carne, vegetariano" bind:value={form.tag}
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-50 transition-all" />
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">Condición</label>
						<select bind:value={form.direction}
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 bg-white transition-all">
							<option value="at_least">Al menos</option>
							<option value="no_more_than">No más de</option>
						</select>
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">Número de veces</label>
						<input type="number" bind:value={form.times} min="1"
							class="w-28 px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 transition-all" />
					</div>
				</div>
				<div class="flex gap-2 mt-4">
					<button on:click={saveRule} disabled={!form.tag}
						class="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
						Guardar
					</button>
					<button on:click={() => showForm = false}
						class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm transition-colors">
						Cancelar
					</button>
				</div>
			</div>
		{/if}

		<!-- Lista de reglas -->
		<div class="space-y-2">
			{#each rules as rule}
				<div class="group flex items-center justify-between p-4 bg-white border border-stone-200 rounded-2xl hover:border-stone-300 hover:shadow-sm transition-all duration-150">
					<div class="flex items-center gap-3">
						<span class="text-xl">{rule.direction === 'at_least' ? '✅' : '🚫'}</span>
						<div>
							<p class="text-sm font-medium text-stone-900">{ruleText(rule)}</p>
							<span class="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block
								{rule.direction === 'at_least' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}">
								{rule.direction === 'at_least' ? 'mínimo' : 'máximo'}
							</span>
						</div>
					</div>
					<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
						<button on:click={() => startEdit(rule)}
							class="px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors">
							Editar
						</button>
						<button on:click={() => deleteRule(rule.id)}
							class="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors">
							Borrar
						</button>
					</div>
				</div>
			{:else}
				<div class="text-center py-16 text-stone-500">
					<p class="text-4xl mb-3">📋</p>
					<p class="text-sm">No hay reglas definidas. Las reglas ayudan a equilibrar el plan semanal.</p>
				</div>
			{/each}
		</div>
	</div>
</div>
