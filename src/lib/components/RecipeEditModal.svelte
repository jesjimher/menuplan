<script lang="ts">
	import type { Recipe } from '$lib/types/index.js';
	import TagBadgeInput from '$lib/components/TagBadgeInput.svelte';

	let {
		open = false,
		recipe = null,
		allTags = [],
		onSaved,
		onClose,
	}: {
		open?: boolean;
		recipe?: Recipe | null;
		allTags?: string[];
		onSaved: (recipe: Recipe) => void;
		onClose: () => void;
	} = $props();

	let form = $state({ name: '', description: '', tags: '', min_days: -1 });
	let saving = $state(false);

	// Image picker state
	let showImageSearch = $state(false);
	let imageSearchQ = $state('');
	let imageResults: { url: string; thumbnail: string; title: string }[] = $state([]);
	let imageSearching = $state(false);
	let pendingImageUrl: string | null = $state(null);
	let hasExistingImage = $state(false);
	let existingRecipeId: number | null = $state(null);

	// Sync form state when modal opens/closes or recipe changes
	$effect(() => {
		if (open) {
			if (recipe) {
				form = { name: recipe.name, description: recipe.description ?? '', tags: recipe.tags ?? '', min_days: recipe.min_days ?? -1 };
				hasExistingImage = !!recipe.image_type;
				existingRecipeId = recipe.id;
			} else {
				form = { name: '', description: '', tags: '', min_days: -1 };
				hasExistingImage = false;
				existingRecipeId = null;
			}
			pendingImageUrl = null;
			showImageSearch = false;
			imageResults = [];
		}
	});

	async function openImageSearch() {
		showImageSearch = true;
		imageSearchQ = form.name;
		if (imageSearchQ) await doImageSearch();
	}

	async function doImageSearch() {
		if (!imageSearchQ.trim()) return;
		imageSearching = true;
		try {
			const res = await fetch(`/api/image-search?q=${encodeURIComponent(imageSearchQ)}`);
			imageResults = await res.json();
		} finally {
			imageSearching = false;
		}
	}

	function pickImage(url: string) {
		pendingImageUrl = url;
		showImageSearch = false;
	}

	async function removeImage() {
		if (!existingRecipeId) return;
		await fetch(`/api/recipes/${existingRecipeId}/image`, { method: 'DELETE' });
		hasExistingImage = false;
	}

	async function save() {
		if (!form.name || saving) return;
		saving = true;
		try {
			let savedId: number;
			let savedRecipe: Recipe;

			const body = {
				name: form.name,
				description: form.description,
				tags: form.tags,
				min_days: form.min_days,
			};

			if (recipe) {
				const res = await fetch(`/api/recipes/${recipe.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				savedRecipe = await res.json();
				savedId = savedRecipe.id;
			} else {
				const res = await fetch('/api/recipes', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				savedRecipe = await res.json();
				savedId = savedRecipe.id;
			}

			if (pendingImageUrl) {
				await fetch(`/api/recipes/${savedId}/image`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ url: pendingImageUrl }),
				});
			}

			onSaved(savedRecipe);
		} finally {
			saving = false;
		}
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label={recipe ? 'Editar receta' : 'Nueva receta'}
		onclick={handleBackdrop}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-panel" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2 class="modal-title">{recipe ? 'Editar receta' : 'Nueva receta'}</h2>
				<button type="button" class="modal-close" onclick={onClose} aria-label="Cerrar">&times;</button>
			</div>

			<div class="modal-body">
				<div class="grid gap-3">
					<input
						type="text"
						placeholder="Nombre *"
						bind:value={form.name}
						class="px-3 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);"
					/>
					<textarea
						placeholder="Descripción"
						bind:value={form.description}
						class="px-3 py-2.5 rounded-lg text-sm h-20 resize-none focus:outline-none transition-all"
						style="border: 1px solid var(--border); color: var(--text);"
					></textarea>
					<TagBadgeInput bind:value={form.tags} tags={allTags} placeholder="Tags (ej: comida,carne,rápido)" />
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-1" style="color: var(--text-secondary);">
							Días mínimos entre ocurrencias
						</label>
						<p class="text-xs mb-1.5" style="color: var(--text-muted);">-1 = usar valor global</p>
						<input
							type="number"
							bind:value={form.min_days}
							min="-1"
							class="w-28 px-3 py-2 rounded-lg text-sm focus:outline-none transition-all"
							style="border: 1px solid var(--border); color: var(--text);"
						/>
					</div>

					<!-- Imagen -->
					<div>
						<label class="block text-xs font-medium uppercase tracking-wide mb-2" style="color: var(--text-secondary);">Imagen</label>
						<div class="flex items-start gap-3">
							{#if pendingImageUrl}
								<div class="relative shrink-0">
									<img src={pendingImageUrl} alt="" class="w-24 h-16 object-cover rounded-lg" style="border: 1px solid var(--border);" />
									<button type="button" onclick={() => (pendingImageUrl = null)}
										class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shadow"
										style="background: var(--error); color: white;">&times;</button>
								</div>
							{:else if hasExistingImage && existingRecipeId}
								<div class="relative shrink-0">
									<img src="/api/recipes/{existingRecipeId}/image" alt="" class="w-24 h-16 object-cover rounded-lg" style="border: 1px solid var(--border);" />
									<button type="button" onclick={removeImage}
										class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold shadow"
										style="background: var(--error); color: white;">&times;</button>
								</div>
							{/if}
							<button type="button" onclick={openImageSearch}
								class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
								style="border: 1px solid var(--border); color: var(--text);"
								onmouseenter={(e) => (e.currentTarget.style.background = 'var(--surface-container)')}
								onmouseleave={(e) => (e.currentTarget.style.background = 'transparent')}>
								{pendingImageUrl || hasExistingImage ? 'Cambiar imagen' : 'Buscar imagen'}
							</button>
						</div>

						{#if showImageSearch}
							<div class="mt-2 rounded-xl overflow-hidden" style="border: 1px solid var(--border);">
								<div class="flex gap-2 p-2" style="border-bottom: 1px solid var(--border);">
									<input type="text" bind:value={imageSearchQ}
										onkeydown={(e) => e.key === 'Enter' && doImageSearch()}
										placeholder="Buscar imágenes..."
										class="flex-1 px-2.5 py-1.5 rounded-lg text-sm focus:outline-none"
										style="border: 1px solid var(--border); color: var(--text);" />
									<button type="button" onclick={doImageSearch} disabled={imageSearching}
										class="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
										style="background: var(--primary); color: white;">
										{imageSearching ? '...' : 'Buscar'}
									</button>
									<button type="button" onclick={() => (showImageSearch = false)}
										class="px-2 py-1.5 rounded-lg text-sm"
										style="color: var(--text-secondary);">&times;</button>
								</div>
								{#if imageSearching}
									<p class="text-xs px-3 py-4 text-center" style="color: var(--text-muted);">Buscando...</p>
								{:else if imageResults.length === 0}
									<p class="text-xs px-3 py-4 text-center" style="color: var(--text-muted);">Sin resultados. Prueba otro término.</p>
								{:else}
									<div class="grid grid-cols-5 gap-1 p-2 max-h-52 overflow-y-auto">
										{#each imageResults as img}
											<button type="button" onclick={() => pickImage(img.thumbnail)}
												class="rounded-lg overflow-hidden transition-opacity hover:opacity-80 focus:outline-none"
												style="border: 2px solid transparent;"
												title={img.title}>
												<img src={img.thumbnail} alt={img.title} class="w-full h-14 object-cover" loading="lazy"
													onerror={(e) => ((e.currentTarget as HTMLImageElement).closest('button') as HTMLElement).style.display = 'none'} />
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button type="button" onclick={save} disabled={!form.name || saving}
					class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
					style="background: var(--primary); color: white;">
					{saving ? 'Guardando...' : 'Guardar'}
				</button>
				<button type="button" onclick={onClose}
					class="px-4 py-2 rounded-lg text-sm transition-colors"
					style="background: var(--surface-container); color: var(--text);">
					Cancelar
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 1rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		width: 100%;
		max-width: 520px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.modal-title {
		font-family: 'Epilogue', sans-serif;
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.modal-close {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		font-size: 1.25rem;
		color: var(--text-secondary);
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.modal-close:hover {
		background: var(--surface-container);
	}

	.modal-body {
		padding: 1.25rem 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.modal-footer {
		display: flex;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}
</style>
