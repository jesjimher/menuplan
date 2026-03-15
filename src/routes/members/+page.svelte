<script lang="ts">
	import { onMount } from 'svelte';
	import type { Member } from '$lib/types/index.js';

	let members: Member[] = [];
	let showForm = false;
	let editingMember: Member | null = null;
	let form = { name: '', cannot_eat: '', likes: '', dislikes: '' };

	onMount(loadMembers);

	async function loadMembers() {
		const res = await fetch('/api/members');
		members = await res.json();
	}

	function startEdit(m: Member) {
		editingMember = m;
		form = { name: m.name, cannot_eat: m.cannot_eat, likes: m.likes, dislikes: m.dislikes };
		showForm = true;
	}

	function startNew() {
		editingMember = null;
		form = { name: '', cannot_eat: '', likes: '', dislikes: '' };
		showForm = true;
	}

	async function saveMember() {
		if (!form.name) return;
		if (editingMember) {
			await fetch(`/api/members/${editingMember.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
		} else {
			await fetch('/api/members', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
		}
		showForm = false;
		await loadMembers();
	}

	async function deleteMember(id: number) {
		if (!confirm('¿Eliminar este miembro?')) return;
		await fetch(`/api/members/${id}`, { method: 'DELETE' });
		await loadMembers();
	}
</script>

<div class="p-4 max-w-2xl mx-auto">
	<div class="flex items-center justify-between mb-4">
		<h1 class="text-2xl font-bold text-gray-800">Miembros de la familia</h1>
		<button on:click={startNew} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">+ Nuevo miembro</button>
	</div>

	{#if showForm}
		<div class="mb-4 p-4 bg-white border border-indigo-200 rounded-lg shadow-sm">
			<h3 class="font-semibold text-gray-700 mb-3">{editingMember ? 'Editar miembro' : 'Nuevo miembro'}</h3>
			<div class="grid grid-cols-1 gap-3">
				<input type="text" placeholder="Nombre *" bind:value={form.name} class="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				<div>
					<label class="text-sm text-gray-600 font-medium">No puede comer (tags separados por coma)</label>
					<input type="text" placeholder="ej: gluten,lactosa,marisco" bind:value={form.cannot_eat} class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				</div>
				<div>
					<label class="text-sm text-gray-600 font-medium">Le gusta (tags)</label>
					<input type="text" placeholder="ej: pasta,pollo" bind:value={form.likes} class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				</div>
				<div>
					<label class="text-sm text-gray-600 font-medium">No le gusta (tags)</label>
					<input type="text" placeholder="ej: verduras,pescado" bind:value={form.dislikes} class="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-indigo-400" />
				</div>
			</div>
			<div class="flex gap-2 mt-3">
				<button on:click={saveMember} disabled={!form.name} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-50">Guardar</button>
				<button on:click={() => showForm = false} class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Cancelar</button>
			</div>
		</div>
	{/if}

	<div class="space-y-3">
		{#each members as member}
			<div class="p-4 bg-white border border-gray-200 rounded-lg">
				<div class="flex items-start justify-between">
					<h3 class="font-semibold text-gray-800">{member.name}</h3>
					<div class="flex gap-1">
						<button on:click={() => startEdit(member)} class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">Editar</button>
						<button on:click={() => deleteMember(member.id)} class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded">Borrar</button>
					</div>
				</div>
				{#if member.cannot_eat}
					<p class="text-sm text-red-600 mt-1">🚫 No puede comer: <span class="font-medium">{member.cannot_eat}</span></p>
				{/if}
				{#if member.likes}
					<p class="text-sm text-green-600 mt-1">👍 Le gusta: <span class="font-medium">{member.likes}</span></p>
				{/if}
				{#if member.dislikes}
					<p class="text-sm text-orange-500 mt-1">👎 No le gusta: <span class="font-medium">{member.dislikes}</span></p>
				{/if}
			</div>
		{:else}
			<div class="text-center py-12 text-gray-400">No hay miembros. Añade los miembros de tu familia.</div>
		{/each}
	</div>
</div>
