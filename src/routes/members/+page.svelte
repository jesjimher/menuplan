<script lang="ts">
	import { onMount } from 'svelte';
	import type { Member } from '$lib/types/index.js';
	import MultiTagInput from '$lib/components/MultiTagInput.svelte';

	let members: Member[] = [];
	let allTags: string[] = [];
	let showForm = false;
	let editingMember: Member | null = null;
	let form = { name: '', cannot_eat: '', likes: '', dislikes: '' };

	onMount(async () => {
		await Promise.all([loadMembers(), loadTags()]);
	});

	async function loadMembers() {
		const res = await fetch('/api/members');
		members = await res.json();
	}

	async function loadTags() {
		const res = await fetch('/api/recipes?tags=1');
		allTags = await res.json();
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

<div class="min-h-full" style="background: #f0ebe3; font-family: 'DM Sans', sans-serif;">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-6 pt-8 pb-6">
		<div class="max-w-2xl mx-auto flex items-end justify-between gap-4">
			<div>
				<h1 class="text-4xl font-bold leading-none text-stone-900" style="font-family: 'Lora', serif">
					Miembros
				</h1>
				<p class="mt-1.5 text-sm text-stone-600">{members.length} miembro{members.length !== 1 ? 's' : ''} en tu familia</p>
			</div>
			<button on:click={startNew}
				class="px-4 py-2 text-sm font-medium bg-stone-800 hover:bg-stone-900 text-white rounded-lg transition-colors shrink-0">
				+ Nuevo miembro
			</button>
		</div>
	</div>

	<div class="max-w-2xl mx-auto px-6 py-6">

		<!-- Formulario -->
		{#if showForm}
			<div class="mb-6 p-5 bg-white border border-stone-200 rounded-2xl shadow-sm">
				<h3 class="font-semibold text-stone-900 mb-4" style="font-family: 'Lora', serif">{editingMember ? 'Editar miembro' : 'Nuevo miembro'}</h3>
				<div class="grid gap-3">
					<input type="text" placeholder="Nombre *" bind:value={form.name}
						class="px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-50 transition-all" />
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">No puede comer</label>
						<MultiTagInput bind:value={form.cannot_eat} tags={allTags} placeholder="ej: gluten,lactosa,marisco"
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-50 transition-all" />
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">Le gusta</label>
						<MultiTagInput bind:value={form.likes} tags={allTags} placeholder="ej: pasta,pollo"
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-green-300 focus:ring-2 focus:ring-green-50 transition-all" />
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-700 uppercase tracking-wide mb-1">No le gusta</label>
						<MultiTagInput bind:value={form.dislikes} tags={allTags} placeholder="ej: verduras,pescado"
							class="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-50 transition-all" />
					</div>
				</div>
				<div class="flex gap-2 mt-4">
					<button on:click={saveMember} disabled={!form.name}
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

		<!-- Lista de miembros -->
		<div class="space-y-3">
			{#each members as member}
				<div class="group p-5 bg-white border border-stone-200 rounded-2xl hover:border-stone-300 hover:shadow-sm transition-all duration-150">
					<div class="flex items-start justify-between gap-3">
						<h3 class="font-semibold text-stone-900 text-base leading-snug" style="font-family: 'Lora', serif">{member.name}</h3>
						<div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
							<button on:click={() => startEdit(member)}
								class="px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors">
								Editar
							</button>
							<button on:click={() => deleteMember(member.id)}
								class="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors">
								Borrar
							</button>
						</div>
					</div>

					{#if member.cannot_eat}
						<div class="mt-3">
							<p class="text-xs font-medium text-stone-700 uppercase tracking-wide mb-1.5">🚫 No puede comer</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.cannot_eat) as tag}
									<span class="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if member.likes}
						<div class="mt-3">
							<p class="text-xs font-medium text-stone-700 uppercase tracking-wide mb-1.5">👍 Le gusta</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.likes) as tag}
									<span class="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if member.dislikes}
						<div class="mt-3">
							<p class="text-xs font-medium text-stone-700 uppercase tracking-wide mb-1.5">👎 No le gusta</p>
							<div class="flex flex-wrap gap-1">
								{#each parseTags(member.dislikes) as tag}
									<span class="text-xs px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full font-medium">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if !member.cannot_eat && !member.likes && !member.dislikes}
						<p class="mt-2 text-sm text-stone-500">Sin restricciones ni preferencias</p>
					{/if}
				</div>
			{:else}
				<div class="text-center py-16 text-stone-500">
					<p class="text-4xl mb-3">👥</p>
					<p class="text-sm">No hay miembros. Añade los miembros de tu familia.</p>
				</div>
			{/each}
		</div>
	</div>
</div>
