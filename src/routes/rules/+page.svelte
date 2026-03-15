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

<div class="p-4 max-w-2xl mx-auto">
	<div class="flex items-center justify-between mb-4">
		<h1 class="text-2xl font-bold text-gray-800">Reglas</h1>
		<button on:click={startNew} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">+ Nueva regla</button>
	</div>

	{#if showForm}
		<div class="mb-4 p-4 bg-white border border-indigo-200 rounded-lg shadow-sm">
			<h3 class="font-semibold text-gray-700 mb-3">{editingRule ? 'Editar regla' : 'Nueva regla'}</h3>
			<div class="grid grid-cols-1 gap-3">
				<div>
					<label class="text-sm text-gray-600 font-medium">Tag</label>
					<input type="text" placeholder="ej: pescado, carne, vegetariano" bind:value={form.tag} class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				</div>
				<div>
					<label class="text-sm text-gray-600 font-medium">Condición</label>
					<select bind:value={form.direction} class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400">
						<option value="at_least">Al menos</option>
						<option value="no_more_than">No más de</option>
					</select>
				</div>
				<div>
					<label class="text-sm text-gray-600 font-medium">Número de veces</label>
					<input type="number" bind:value={form.times} min="1" class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				</div>
			</div>
			<div class="flex gap-2 mt-3">
				<button on:click={saveRule} disabled={!form.tag} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-50">Guardar</button>
				<button on:click={() => showForm = false} class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Cancelar</button>
			</div>
		</div>
	{/if}

	<div class="space-y-2">
		{#each rules as rule}
			<div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
				<div class="flex items-center gap-3">
					<span class="text-2xl">{rule.direction === 'at_least' ? '✅' : '🚫'}</span>
					<p class="text-sm font-medium text-gray-800">{ruleText(rule)}</p>
				</div>
				<div class="flex gap-1">
					<button on:click={() => startEdit(rule)} class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Editar</button>
					<button on:click={() => deleteRule(rule.id)} class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded">Borrar</button>
				</div>
			</div>
		{:else}
			<div class="text-center py-12 text-gray-400">No hay reglas definidas. Las reglas ayudan a equilibrar el plan semanal.</div>
		{/each}
	</div>
</div>
