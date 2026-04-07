<script lang="ts">
	import type { Recipe, SlotData, MealConfig } from '$lib/types/index.js';
	import TagInput from '$lib/components/TagInput.svelte';

	let {
		weekday,
		mealType,
		slotIdx,
		isAcc = 0,
		slot,
		slotKeyStr,
		cfg,
		allTags,
		// Dropdown state
		openDropdown,
		searchQuery = $bindable(''),
		searchResults,
		topRecipes,
		// Busy / drag state
		isBusy = false,
		isDragSource = false,
		isDragOver = false,
		isMoveMode = false,
		isTouchDevice = false,
		// Tag editing
		editingTagKey,
		slotTags = [],
		slotTagEditKey = '',
		// Callbacks
		onSelectRecipe,
		onRemove,
		onRandom,
		onOpenDropdown,
		onCloseDropdown,
		onSearch,
		onAddTag,
		onRemoveTag,
		onSetEditingTag,
		onDragStart,
		onDragEnd,
		onDragOver,
		onDragLeave,
		onDrop,
		onMoveClick,
		onTouchStart,
		onTouchEnd,
		onTouchMove,
		focusOnMount,
		fixedDropdown,
	}: {
		weekday: number;
		mealType: string;
		slotIdx: number;
		isAcc?: number;
		slot: SlotData | undefined;
		slotKeyStr: string;
		cfg: MealConfig;
		allTags: string[];
		openDropdown: string | null;
		searchQuery: string;
		searchResults: Recipe[];
		topRecipes: Recipe[];
		isBusy?: boolean;
		isDragSource?: boolean;
		isDragOver?: boolean;
		isMoveMode?: boolean;
		isTouchDevice?: boolean;
		editingTagKey: string | null;
		slotTags?: string[];
		slotTagEditKey?: string;
		onSelectRecipe: (recipeId: number) => void;
		onRemove: () => void;
		onRandom: () => void;
		onOpenDropdown: () => void;
		onCloseDropdown: () => void;
		onSearch: () => void;
		onAddTag: (tag: string) => void;
		onRemoveTag: (tag: string) => void;
		onSetEditingTag: (key: string | null) => void;
		onDragStart: (e: DragEvent) => void;
		onDragEnd: () => void;
		onDragOver: (e: DragEvent) => void;
		onDragLeave: (e: Event) => void;
		onDrop: () => void;
		onMoveClick: () => void;
		onTouchStart: () => void;
		onTouchEnd: () => void;
		onTouchMove: () => void;
		focusOnMount: (node: HTMLInputElement) => void;
		fixedDropdown: (node: HTMLElement) => { destroy: () => void };
	} = $props();

	let dropdownActiveIndex = $state(-1);

	let topCount = $derived(topRecipes.length > 0 && !searchQuery ? topRecipes.length : 0);
	let allDropdownItems = $derived(
		(topRecipes.length > 0 && !searchQuery ? topRecipes : []).concat(searchResults)
	);

	$effect(() => {
		searchResults; topRecipes; searchQuery;
		dropdownActiveIndex = -1;
	});

	let topListEl: HTMLElement | null = null;
	let searchListEl: HTMLElement | null = null;

	$effect(() => {
		const idx = dropdownActiveIndex;
		if (idx < 0) return;
		if (idx < topCount && topListEl) {
			(topListEl.querySelectorAll('button')[idx] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
		} else if (searchListEl) {
			(searchListEl.querySelectorAll('button')[idx - topCount] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
		}
	});

	function handleDropdownKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			dropdownActiveIndex = Math.min(dropdownActiveIndex + 1, allDropdownItems.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			dropdownActiveIndex = Math.max(dropdownActiveIndex - 1, -1);
		} else if (e.key === 'Enter' && dropdownActiveIndex >= 0) {
			e.preventDefault();
			onSelectRecipe(allDropdownItems[dropdownActiveIndex].id);
			dropdownActiveIndex = -1;
		} else if (e.key === 'Escape') {
			onCloseDropdown();
		}
	}

	let imgH = $derived(
		isAcc ? '' :
		cfg.recipe_count === 1 ? 'min-h-[100px]' :
		cfg.recipe_count === 2 ? 'min-h-[52px]' : 'min-h-[40px]'
	);
	let emptyH = $derived(
		isAcc ? '' :
		cfg.recipe_count === 1 ? 'min-h-[3.5rem]' :
		cfg.recipe_count === 2 ? 'min-h-[1.75rem]' : 'min-h-[1.25rem]'
	);
</script>

{#if isAcc}
	<!-- Accompaniment slot -->
	<div class="dropdown-container relative mt-1.5"
		style:box-shadow={isDragOver ? '0 0 0 2px var(--primary)' : undefined}
		style:outline={isMoveMode ? '2px dashed var(--primary)' : undefined}
		style:outline-offset={isMoveMode ? '2px' : undefined}
		on:dragover|preventDefault={onDragOver}
		on:dragleave={onDragLeave}
		on:drop|preventDefault={onDrop}
	>
		<div class="relative group/acc">
			<button
				draggable={!isTouchDevice && !!slot?.recipe ? 'true' : 'false'}
				class:opacity-40={isDragSource}
				on:click|stopPropagation={onMoveClick}
				on:dragstart={onDragStart}
				on:dragend={onDragEnd}
				on:touchstart|passive={onTouchStart}
				on:touchend={onTouchEnd}
				on:touchmove={onTouchMove}
				on:contextmenu|preventDefault={() => {}}
				class="w-full text-left text-xs transition-colors select-none pr-6 px-2 py-1.5 rounded-lg"
				style="{slot?.recipe
					? `background: var(--secondary-container); color: var(--secondary);`
					: `background: transparent; border: 1px dashed var(--border); color: var(--text-muted);`}"
			>
				<span class="leading-snug {slot?.recipe ? 'font-semibold' : 'italic'}">
					{slot?.recipe?.name ?? '+ acomp.'}
				</span>
			</button>
			{#if slot?.recipe}
				<div class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/acc:opacity-100 transition-opacity">
					<button
						on:click|stopPropagation={onRemove}
						class="w-5 h-5 flex items-center justify-center rounded-full shadow-sm transition-colors text-xs"
						style="background: rgba(255,255,255,0.9); color: var(--error);"
						aria-label="Quitar acompañamiento"
					>&times;</button>
				</div>
			{/if}
		</div>

		{#if openDropdown === slotKeyStr}
			<div class="fixed z-[9999] w-72 rounded-xl shadow-xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);" use:fixedDropdown>
				<div class="p-2" style="border-bottom: 1px solid var(--surface-container-highest);">
					<input
						type="text"
						placeholder="Buscar acomp..."
						bind:value={searchQuery}
						on:input={onSearch}
						on:keydown={handleDropdownKeydown}
						class="w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none"
						style="background: var(--surface-container-low); color: var(--text);"
						use:focusOnMount
					/>
				</div>
				<div class="max-h-64 overflow-y-auto" bind:this={searchListEl}>
					{#if searchResults.length === 0}
						<p class="text-xs px-3 py-3" style="color: var(--text-muted);">Sin resultados</p>
					{:else}
						{#each searchResults as r, i}
							<button
								on:click|stopPropagation={() => onSelectRecipe(r.id)}
								class="dropdown-item block w-full text-left px-3 py-2 transition-colors"
								style="border-bottom: 1px solid var(--surface-container-highest); color: var(--text); {dropdownActiveIndex === i ? 'background: var(--surface-container-low);' : ''}"
							>
								<p class="text-sm font-medium" style="color: var(--text);">{r.name}</p>
								{#if r.tags}
									<p class="text-xs mt-0.5" style="color: var(--text-muted);">{r.tags}</p>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Main recipe slot -->
	<div>
		<div class="dropdown-container relative"
			style:box-shadow={isDragOver ? '0 0 0 2px var(--primary)' : undefined}
			style:outline={isMoveMode ? '2px dashed var(--primary)' : undefined}
			style:outline-offset={isMoveMode ? '2px' : undefined}
			on:dragover|preventDefault={onDragOver}
			on:dragleave={onDragLeave}
			on:drop|preventDefault={onDrop}
		>
			<div class="relative group/slot">
				<button
					draggable={!isTouchDevice && !!slot?.recipe ? 'true' : 'false'}
					class:opacity-40={isDragSource}
					on:click|stopPropagation={onMoveClick}
					on:dragstart={onDragStart}
					on:dragend={onDragEnd}
					on:touchstart|passive={onTouchStart}
					on:touchend={onTouchEnd}
					on:touchmove={onTouchMove}
					on:contextmenu|preventDefault={() => {}}
					class="w-full text-left text-xs transition-all select-none {slot?.recipe?.image_type ? `relative overflow-hidden rounded-xl shadow-sm hover:shadow-md ${imgH}` : slot?.recipe ? 'px-3 py-2.5 rounded-xl shadow-sm min-h-[2.5rem] flex items-start' : `px-2.5 py-3 rounded-xl ${emptyH} flex flex-col items-center justify-center gap-1`}"
					style="{slot?.recipe
						? (slot.recipe.image_type ? 'background: var(--surface);' : `background: var(--surface); color: var(--text);`)
						: `background: var(--surface-container-low); border: 2px dashed var(--border); color: var(--text-muted);`}"
				>
					{#if slot?.recipe?.image_type}
						<img src="/api/recipes/{slot.recipe.id}/image" alt={slot.recipe.name}
							class="absolute inset-0 w-full h-full object-cover group-hover/slot:scale-105 transition-transform duration-500"
							on:error={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'} />
						<span class="absolute bottom-0 left-0 right-0 px-2.5 py-2 font-bold text-sm leading-tight"
							style="background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%); color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
							{slot.recipe.name}
						</span>
					{:else if slot?.recipe}
						<span class="leading-snug font-semibold text-sm">{slot.recipe.name}</span>
					{:else}
						<span class="text-lg leading-none" style="color: var(--text-muted);">+</span>
					{/if}
				</button>
				<div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/slot:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
					{#if editingTagKey !== slotTagEditKey}
						<button
							on:click|stopPropagation={() => onSetEditingTag(slotTagEditKey)}
							class="slot-action-btn w-6 h-6 flex items-center justify-center rounded-full shadow-sm transition-colors"
							aria-label="Añadir tag requerido"
							title="Añadir tag requerido"
						><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg></button>
					{/if}
					<button
						on:click|stopPropagation={onRandom}
						disabled={isBusy}
						class="slot-action-btn w-6 h-6 flex items-center justify-center rounded-full shadow-sm disabled:opacity-40 disabled:cursor-wait transition-colors text-sm"
						aria-label="Receta aleatoria"
						title="Receta aleatoria"
					>{isBusy ? '...' : '↻'}</button>
					{#if slot?.recipe}
						<a
							href="/recipes?edit={slot.recipe.id}"
							on:click|stopPropagation
							class="slot-action-btn w-6 h-6 flex items-center justify-center rounded-full shadow-sm transition-colors text-sm"
							title="Editar receta"
						>
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
						</a>
						<button
							on:click|stopPropagation={onRemove}
							class="slot-action-btn-danger w-6 h-6 flex items-center justify-center rounded-full shadow-sm transition-colors text-sm"
							aria-label="Quitar receta"
							title="Quitar"
						>&times;</button>
					{/if}
				</div>
			</div>

			<!-- Dropdown búsqueda receta -->
			{#if openDropdown === slotKeyStr}
				<div class="fixed z-[9999] w-72 rounded-xl shadow-2xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--surface-container-highest);" use:fixedDropdown>
					<div class="p-2" style="border-bottom: 1px solid var(--surface-container-highest);">
						<input
							type="text"
							placeholder="Buscar receta..."
							bind:value={searchQuery}
							on:input={onSearch}
							on:keydown={handleDropdownKeydown}
							class="w-full text-sm px-2.5 py-2 rounded-lg focus:outline-none"
							style="background: var(--surface-container-low); color: var(--text);"
							use:focusOnMount
						/>
					</div>
					{#if topRecipes.length > 0 && !searchQuery}
						<div class="px-3 py-2" bind:this={topListEl}
							style="background: var(--surface-container-low); border-bottom: 1px solid var(--surface-container-highest);">
							<p class="text-[10px] font-black uppercase tracking-tighter mb-1.5" style="color: var(--text-muted);">Top este día</p>
							{#each topRecipes as r, i}
								<button
									on:click|stopPropagation={() => onSelectRecipe(r.id)}
									class="dropdown-item-subtle block w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors font-medium"
									style="color: var(--primary); {dropdownActiveIndex === i ? 'background: var(--surface-container);' : ''}"
								>{r.name}</button>
							{/each}
						</div>
					{/if}
					<div class="max-h-64 overflow-y-auto" bind:this={searchListEl}>
						{#if searchResults.length === 0}
							<p class="text-xs px-3 py-3" style="color: var(--text-muted);">Sin resultados</p>
						{:else}
							{#each searchResults as r, i}
								<button
									on:click|stopPropagation={() => onSelectRecipe(r.id)}
									class="dropdown-item block w-full text-left px-3 py-2.5 transition-colors"
									style="border-bottom: 1px solid var(--surface-container-highest); color: var(--text); {dropdownActiveIndex === topCount + i ? 'background: var(--surface-container-low);' : ''}"
								>
									<p class="text-sm font-semibold" style="color: var(--text);">{r.name}</p>
									{#if r.tags}
										<p class="text-xs mt-0.5" style="color: var(--text-muted);">{r.tags}</p>
									{/if}
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Tags requeridos del slot -->
		{#if slotTags.length > 0 || editingTagKey === slotTagEditKey}
			<div class="mt-1.5 flex flex-wrap gap-1 items-center">
				{#each slotTags as tag}
					<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm"
						style="background: var(--secondary-container); color: var(--secondary);">
						{tag}
						<button
							on:click|stopPropagation={() => onRemoveTag(tag)}
							class="hover:opacity-60 transition-opacity font-bold"
							aria-label="Quitar tag {tag}"
							title="Quitar"
						>&times;</button>
					</span>
				{/each}
				{#if editingTagKey === slotTagEditKey}
					<TagInput
						autofocus
						value=""
						tags={allTags}
						placeholder="tag requerido..."
						class="text-xs"
						onchange={(v) => onAddTag(v)}
						onkeydown={(e) => {
							if (e.key === 'Escape') onSetEditingTag(null);
							if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
						}}
					/>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.select-none {
		-webkit-touch-callout: none;
	}
	.dropdown-item:hover {
		background: var(--surface-container-low);
	}
	.dropdown-item-subtle:hover {
		background: var(--surface-container);
	}
	.slot-action-btn {
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(4px);
		color: var(--primary);
		box-shadow: 0 2px 5px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(0,0,0,0.22);
	}
	.slot-action-btn:hover {
		background: rgba(255, 255, 255, 1);
		box-shadow: 0 3px 8px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(0,0,0,0.28);
	}
	.slot-action-btn-danger {
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(4px);
		color: var(--error);
		box-shadow: 0 2px 5px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(0,0,0,0.22);
	}
	.slot-action-btn-danger:hover {
		background: rgba(255, 255, 255, 1);
		box-shadow: 0 3px 8px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(0,0,0,0.28);
	}
</style>
