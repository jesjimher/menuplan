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

	function parseTags(str: string): string[] {
		return str.split(',').map(t => t.trim()).filter(Boolean);
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="min-h-full bg-stone-50">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-2xl mx-auto flex items-end justify-between gap-4">
			<div>
				<h1 class="text-4xl font-bold leading-none text-gray-900" style="font-family: 'Playfair Display', serif">
					Miembros
				</h1>
				<p class="mt-1.5 text-sm text-stone-400">{members.length} miembro{members.length !== 1 ? 's' : ''} en tu familia</p>
			</div>
			<button on:click={startNew}
				class="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shrink-0">
				+ Nuevo miembro
			</button>
		</div>
	</div>

	<div class="max-w-2xl mx-auto px-6 py-6">

		<!-- Formulario -->
		{#if showForm}
			<div class="mb-6 p-5 bg-white border border-indigo-100 rounded-xl shadow-sm">
				<h3 class="font-semibold text-gray-800 mb-4">{editingMember ? 'Editar miembro' : 'Nuevo miembro'}</h3>
				<div class="grid gap-3">
					<input type="text" placeholder="Nombre *" bind:value={form.name}
						class="px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all" />
					<div>
						<label class="block text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">No puede comer</label>
						<input type="text" placeholder="ej: gluten,lactosa,marisco" bind:value={form.cannot_eat}
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-50 transition-all" />
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">Le gusta</label>
						<input type="text" placeholder="ej: pasta,pollo" bind:value={form.likes}
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-green-300 focus:ring-2 focus:ring-green-50 transition-all" />
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">No le gusta</label>
						<input type="text" placeholder="ej: verduras,pescado" bind:value={form.dislikes}
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-50 transition-all" />
					</div>
				</div>
				<div class="flex gap-2 mt-4">
					<button on:click={saveMember} disabled={!form.name}
						class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
						Guardar
					</button>
					<button on:click={() => showForm = false}
						class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-sm transition-colors">
						Cancelar
					</button>
				</div>
			</div>
		{/if}

		<!-- Lista de miembros -->
		<div class="space-y-3">
			{#each members as member}
				<div class="group p-5 bg-white border border-stone-200 rounded-xl hover:border-stone-300 hover:shadow-sm transition-all duration-150">
					<div class="flex items-start justify-between gap-3">
						<h3 class="font-semibold text-gray-800 text-base leading-snug">{member.name}</h3>
						<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
							<button on:click={() => startEdit(member)}
								class="px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors">
								Editar
							</button>
							<button on:click={() => deleteMember(member.id)}
								class="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
								Borrar
							</button>
						</div>
					</div>

					{#if member.cannot_eat}
						<div class="mt-3">
							<p class="text-xs font-medium text-stone-600 uppercase tracking-wide mb-1.5">🚫 No puede comer</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.cannot_eat) as tag}
									<span class="text-xs px-2 py-0.5 bg-red-50 text-red-500 rounded-full font-medium">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if member.likes}
						<div class="mt-3">
							<p class="text-xs font-medium text-stone-600 uppercase tracking-wide mb-1.5">👍 Le gusta</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.likes) as tag}
									<span class="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if member.dislikes}
						<div class="mt-3">
							<p class="text-xs font-medium text-stone-600 uppercase tracking-wide mb-1.5">👎 No le gusta</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.dislikes) as tag}
									<span class="text-xs px-2 py-0.5 bg-orange-50 text-orange-500 rounded-full font-medium">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if !member.cannot_eat && !member.likes && !member.dislikes}
						<p class="mt-2 text-sm text-stone-300">Sin restricciones ni preferencias</p>
					{/if}
				</div>
			{:else}
				<div class="text-center py-16 text-stone-300">
					<p class="text-4xl mb-3">👥</p>
					<p class="text-sm">No hay miembros. Añade los miembros de tu familia.</p>
				</div>
			{/each}
		</div>
	</div>
</div>
