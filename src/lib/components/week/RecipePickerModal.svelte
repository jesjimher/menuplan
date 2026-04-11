<script lang="ts">
	import type { Recipe } from '$lib/types/index.js';
	import TagInput from '$lib/components/TagInput.svelte';

	let {
		open = false,
		weekKey,
		weekday,
		mealType,
		slotIndex,
		isAcc = 0,
		allTags = [],
		onSelect,
		onClose,
	}: {
		open?: boolean;
		weekKey: string;
		weekday: number;
		mealType: string;
		slotIndex: number;
		isAcc?: number;
		allTags?: string[];
		onSelect: (recipeId: number) => void;
		onClose: () => void;
	} = $props();

	type Tab = 'search' | 'topDay' | 'topAll' | 'recent' | 'oldest' | 'discarded';
	let activeTab = $state<Tab>('search');

	// Search tab state
	let searchQuery = $state('');
	let searchTags = $state<string[]>([]);
	let searchTagInput = $state('');
	let excludeTags = $state<string[]>([]);
	let excludeTagInput = $state('');
	let searchResults = $state<Recipe[]>([]);
	let searchTimeout: ReturnType<typeof setTimeout>;

	// Picker data (tabs 2-6)
	type RecipeWithFreq = Recipe & { freq: number };
	type RecipeWithWeek = Recipe & { last_week: string | null };
	type Discarded = { recipe: Recipe; reason: string };

	let topForDay = $state<RecipeWithFreq[]>([]);
	let topOverall = $state<RecipeWithFreq[]>([]);
	let recentForDay = $state<RecipeWithWeek[]>([]);
	let oldestPlanned = $state<RecipeWithWeek[]>([]);
	let discarded = $state<Discarded[]>([]);
	let pickerLoading = $state(false);

	$effect(() => {
		if (!open) return;
		// Reset search on open
		searchQuery = '';
		searchTags = [];
		searchTagInput = '';
		excludeTags = [];
		excludeTagInput = '';
		searchResults = [];
		activeTab = 'search';
		loadPickerData();
	});

	async function loadPickerData() {
		pickerLoading = true;
		try {
			const params = new URLSearchParams({
				weekKey,
				weekday: String(weekday),
				mealType,
				slotIndex: String(slotIndex),
				isAcc: String(isAcc),
			});
			const res = await fetch(`/api/recipes/picker?${params}`);
			if (!res.ok) return;
			const data = await res.json();
			topForDay = data.topForDay ?? [];
			topOverall = data.topOverall ?? [];
			recentForDay = data.recentForDay ?? [];
			oldestPlanned = data.oldestPlanned ?? [];
			discarded = data.discarded ?? [];
		} finally {
			pickerLoading = false;
		}
	}

	function triggerSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			const requiredTag = isAcc ? 'acompañamiento' : mealType;
			const params = new URLSearchParams({ q: searchQuery, mealType: requiredTag });
			const res = await fetch(`/api/recipes?${params}`);
			const data = await res.json();
			const raw: Recipe[] = data.recipes ?? data;
			const discardedIds = new Set(discarded.map(d => d.recipe.id));
			searchResults = raw.filter(r => {
				if (discardedIds.has(r.id)) return false;
				const tags = r.tags.split(',').map(t => t.trim().toLowerCase());
				if (searchTags.length > 0 && !searchTags.every(st => tags.includes(st))) return false;
				if (excludeTags.length > 0 && excludeTags.some(et => tags.includes(et))) return false;
				return true;
			});
		}, 200);
	}

	$effect(() => {
		searchQuery; searchTags; excludeTags; discarded;
		if (!open) return;
		triggerSearch();
	});

	function addSearchTag(tag: string) {
		const t = tag.trim().toLowerCase();
		if (t && !searchTags.includes(t)) searchTags = [...searchTags, t];
		// clear after a tick so TagInput's own blur handler sees the empty value
		setTimeout(() => { searchTagInput = ''; }, 0);
	}

	function removeSearchTag(tag: string) {
		searchTags = searchTags.filter(t => t !== tag);
	}

	function addExcludeTag(tag: string) {
		const t = tag.trim().toLowerCase();
		if (t && !excludeTags.includes(t)) excludeTags = [...excludeTags, t];
		setTimeout(() => { excludeTagInput = ''; }, 0);
	}

	function removeExcludeTag(tag: string) {
		excludeTags = excludeTags.filter(t => t !== tag);
	}

	function handleSelect(id: number) {
		onSelect(id);
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const TABS: { id: Tab; label: string }[] = [
		{ id: 'search',    label: 'Búsqueda' },
		{ id: 'topDay',    label: 'Top este día' },
		{ id: 'topAll',    label: 'Top general' },
		{ id: 'recent',    label: 'Más recientes' },
		{ id: 'oldest',    label: 'Sin planificar' },
		{ id: 'discarded', label: 'Descartadas' },
	];

	function focusOnMount(node: HTMLInputElement) {
		// rAF ensures the element is visible before focusing (modal transition)
		requestAnimationFrame(() => node.focus());
	}

	function weekLabel(weekStr: string | null): string {
		if (!weekStr) return 'nunca';
		// "2026-W15" → "sem. 15/2026"
		const m = weekStr.match(/^(\d{4})-W(\d+)$/);
		if (m) return `sem. ${m[2]}/${m[1]}`;
		return weekStr;
	}
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="dialog"
	aria-modal="true"
	aria-label="Seleccionar receta"
	class="modal-backdrop"
	onclick={handleBackdrop}
	onkeydown={handleKeydown}
>
	<div class="modal-panel" onclick={(e) => e.stopPropagation()}>
		<!-- Header -->
		<div class="modal-header">
			<h2 class="modal-title">Seleccionar receta
				<span class="modal-subtitle">— {mealType}, {isAcc ? 'acompañamiento' : 'plato principal'}</span>
			</h2>
			<button class="modal-close" onclick={onClose} aria-label="Cerrar">&times;</button>
		</div>

		<!-- Tabs -->
		<div class="tabs-bar">
			{#each TABS as tab}
				<button
					class="tab-btn {activeTab === tab.id ? 'tab-active' : ''}"
					onclick={() => { activeTab = tab.id; }}
				>{tab.label}</button>
			{/each}
		</div>

		<!-- Content -->
		<div class="modal-body">
			{#if activeTab === 'search'}
				<!-- Search controls -->
				<div class="search-controls">
					<input
						type="text"
						placeholder="Buscar por nombre..."
						bind:value={searchQuery}
						class="search-input"
						style="background: var(--surface-container-low); color: var(--text); border: 1px solid var(--border);"
						use:focusOnMount
					/>
					<div class="tag-filters-row">
						<div class="tag-filter-area">
							<span class="tag-filter-label">Con:</span>
							{#each searchTags as tag}
								<span class="search-tag-badge search-tag-include">
									{tag}
									<button onclick={() => removeSearchTag(tag)} aria-label="Quitar tag {tag}">&times;</button>
								</span>
							{/each}
							<TagInput
								bind:value={searchTagInput}
								tags={allTags.filter(t => !searchTags.includes(t) && !excludeTags.includes(t))}
								placeholder="tag..."
								class="tag-filter-input"
								onchange={addSearchTag}
							/>
						</div>
						<div class="tag-filter-area">
							<span class="tag-filter-label">Sin:</span>
							{#each excludeTags as tag}
								<span class="search-tag-badge search-tag-exclude">
									{tag}
									<button onclick={() => removeExcludeTag(tag)} aria-label="Quitar tag {tag}">&times;</button>
								</span>
							{/each}
							<TagInput
								bind:value={excludeTagInput}
								tags={allTags.filter(t => !searchTags.includes(t) && !excludeTags.includes(t))}
								placeholder="tag..."
								class="tag-filter-input"
								onchange={addExcludeTag}
							/>
						</div>
					</div>
				</div>
				<div class="recipe-list">
					{#if searchResults.length === 0}
						<p class="empty-msg">Sin resultados</p>
					{:else}
						{#each searchResults as r}
							<button class="recipe-row" onclick={() => handleSelect(r.id)}>
								{#if r.image_type}
									<img src="/api/recipes/{r.id}/image" alt={r.name} class="recipe-thumb" />
								{:else}
									<div class="recipe-thumb-placeholder"></div>
								{/if}
								<div class="recipe-info">
									<span class="recipe-name">{r.name}</span>
									{#if r.tags}
										<span class="recipe-tags">{r.tags}</span>
									{/if}
								</div>
							</button>
						{/each}
					{/if}
				</div>

			{:else if activeTab === 'topDay'}
				<div class="recipe-list">
					{#if pickerLoading}
						<p class="empty-msg">Cargando...</p>
					{:else if topForDay.length === 0}
						<p class="empty-msg">Sin datos de planificación para este día</p>
					{:else}
						{#each topForDay as r}
							<button class="recipe-row" onclick={() => handleSelect(r.id)}>
								{#if r.image_type}
									<img src="/api/recipes/{r.id}/image" alt={r.name} class="recipe-thumb" />
								{:else}
									<div class="recipe-thumb-placeholder"></div>
								{/if}
								<div class="recipe-info">
									<span class="recipe-name">{r.name}</span>
									{#if r.tags}
										<span class="recipe-tags">{r.tags}</span>
									{/if}
								</div>
								<span class="recipe-badge">{r.freq}×</span>
							</button>
						{/each}
					{/if}
				</div>

			{:else if activeTab === 'topAll'}
				<div class="recipe-list">
					{#if pickerLoading}
						<p class="empty-msg">Cargando...</p>
					{:else if topOverall.length === 0}
						<p class="empty-msg">Sin datos de planificación</p>
					{:else}
						{#each topOverall as r}
							<button class="recipe-row" onclick={() => handleSelect(r.id)}>
								{#if r.image_type}
									<img src="/api/recipes/{r.id}/image" alt={r.name} class="recipe-thumb" />
								{:else}
									<div class="recipe-thumb-placeholder"></div>
								{/if}
								<div class="recipe-info">
									<span class="recipe-name">{r.name}</span>
									{#if r.tags}
										<span class="recipe-tags">{r.tags}</span>
									{/if}
								</div>
								<span class="recipe-badge">{r.freq}×</span>
							</button>
						{/each}
					{/if}
				</div>

			{:else if activeTab === 'recent'}
				<div class="recipe-list">
					{#if pickerLoading}
						<p class="empty-msg">Cargando...</p>
					{:else if recentForDay.length === 0}
						<p class="empty-msg">Sin datos de planificación para este día</p>
					{:else}
						{#each recentForDay as r}
							<button class="recipe-row" onclick={() => handleSelect(r.id)}>
								{#if r.image_type}
									<img src="/api/recipes/{r.id}/image" alt={r.name} class="recipe-thumb" />
								{:else}
									<div class="recipe-thumb-placeholder"></div>
								{/if}
								<div class="recipe-info">
									<span class="recipe-name">{r.name}</span>
									{#if r.tags}
										<span class="recipe-tags">{r.tags}</span>
									{/if}
								</div>
								<span class="recipe-badge recipe-badge-muted">{weekLabel(r.last_week)}</span>
							</button>
						{/each}
					{/if}
				</div>

			{:else if activeTab === 'oldest'}
				<div class="recipe-list">
					{#if pickerLoading}
						<p class="empty-msg">Cargando...</p>
					{:else if oldestPlanned.length === 0}
						<p class="empty-msg">Sin recetas</p>
					{:else}
						{#each oldestPlanned as r}
							<button class="recipe-row" onclick={() => handleSelect(r.id)}>
								{#if r.image_type}
									<img src="/api/recipes/{r.id}/image" alt={r.name} class="recipe-thumb" />
								{:else}
									<div class="recipe-thumb-placeholder"></div>
								{/if}
								<div class="recipe-info">
									<span class="recipe-name">{r.name}</span>
									{#if r.tags}
										<span class="recipe-tags">{r.tags}</span>
									{/if}
								</div>
								<span class="recipe-badge recipe-badge-muted">{weekLabel(r.last_week)}</span>
							</button>
						{/each}
					{/if}
				</div>

			{:else if activeTab === 'discarded'}
				<div class="recipe-list">
					{#if pickerLoading}
						<p class="empty-msg">Cargando...</p>
					{:else if discarded.length === 0}
						<p class="empty-msg">Ninguna receta descartada</p>
					{:else}
						{#each discarded as d}
							<button class="recipe-row recipe-row-discarded" onclick={() => handleSelect(d.recipe.id)}>
								{#if d.recipe.image_type}
									<img src="/api/recipes/{d.recipe.id}/image" alt={d.recipe.name} class="recipe-thumb recipe-thumb-dim" />
								{:else}
									<div class="recipe-thumb-placeholder"></div>
								{/if}
								<div class="recipe-info">
									<span class="recipe-name">{d.recipe.name}</span>
									<span class="recipe-discard-reason">({d.reason})</span>
								</div>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal-panel {
		background: var(--surface);
		border-radius: 1.25rem;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		width: min(820px, 95vw);
		height: min(85vh, 700px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.modal-subtitle {
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--text-muted);
	}

	.modal-close {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 1.25rem;
		color: var(--text-muted);
		transition: background 0.15s, color 0.15s;
	}

	.modal-close:hover {
		background: var(--surface-container-low);
		color: var(--text);
	}

	.tabs-bar {
		display: flex;
		gap: 0;
		padding: 0 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.tabs-bar::-webkit-scrollbar {
		display: none;
	}

	.tab-btn {
		padding: 0.6rem 0.9rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-muted);
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.tab-btn:hover {
		color: var(--text);
	}

	.tab-active {
		color: var(--primary);
		border-bottom-color: var(--primary);
	}

	.modal-body {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.search-controls {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		outline: none;
	}

	.search-input:focus {
		border-color: var(--primary);
		outline: 2px solid var(--primary);
		outline-offset: -1px;
	}

	.tag-filters-row {
		display: flex;
		gap: 0.5rem;
	}

	.tag-filter-area {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border);
		background: var(--surface-container-low);
		flex: 1;
		min-width: 0;
		cursor: text;
	}

	.tag-filter-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.search-tag-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		color: white;
		white-space: nowrap;
	}

	.search-tag-include {
		background: var(--primary);
	}

	.search-tag-exclude {
		background: var(--error, #c0392b);
	}

	.search-tag-badge button {
		font-size: 0.85rem;
		line-height: 1;
		opacity: 0.75;
		transition: opacity 0.1s;
	}

	.search-tag-badge button:hover {
		opacity: 1;
	}

	:global(.tag-filter-input) {
		background: transparent;
		color: var(--text);
		border: none;
		outline: none;
		font-size: 0.8rem;
		min-width: 3rem;
		padding: 0.15rem 0;
	}

	.recipe-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0;
	}

	.empty-msg {
		text-align: center;
		padding: 2rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.recipe-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		text-align: left;
		padding: 0.5rem 1rem;
		transition: background 0.1s;
		border-bottom: 1px solid var(--surface-container-highest);
	}

	.recipe-row:hover {
		background: var(--surface-container-low);
	}

	.recipe-row-discarded {
		opacity: 0.75;
	}

	.recipe-row-discarded:hover {
		opacity: 1;
	}

	.recipe-thumb {
		width: 3rem;
		height: 3rem;
		object-fit: cover;
		border-radius: 0.5rem;
		flex-shrink: 0;
	}

	.recipe-thumb-dim {
		filter: grayscale(0.4);
	}

	.recipe-thumb-placeholder {
		width: 3rem;
		height: 3rem;
		border-radius: 0.5rem;
		background: var(--surface-container-highest);
		flex-shrink: 0;
	}

	.recipe-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.recipe-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.recipe-tags {
		font-size: 0.72rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.recipe-discard-reason {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.recipe-badge {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--primary);
		background: var(--primary-light, color-mix(in srgb, var(--primary) 12%, transparent));
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.recipe-badge-muted {
		color: var(--text-muted);
		background: var(--surface-container-highest);
		font-weight: 500;
	}
</style>
