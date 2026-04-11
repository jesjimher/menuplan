<script lang="ts">
	import type { SlotData, MealConfig } from '$lib/types/index.js';
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
	}: {
		weekday: number;
		mealType: string;
		slotIdx: number;
		isAcc?: number;
		slot: SlotData | undefined;
		slotKeyStr: string;
		cfg: MealConfig;
		allTags: string[];
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
	} = $props();

	function squareLimit(node: HTMLElement) {
		function update() {
			node.style.maxHeight = (node.offsetWidth * 3 / 4) + 'px';
		}
		const ro = new ResizeObserver(update);
		ro.observe(node);
		update();
		return { destroy() { ro.disconnect(); } };
	}

	let imgH = $derived(
		isAcc ? '' :
		cfg.recipe_count === 1 ? 'min-h-[70px]' :
		cfg.recipe_count === 2 ? 'min-h-[52px]' : 'min-h-[40px]'
	);
	let emptyH = $derived(
		isAcc ? '' :
		cfg.recipe_count === 1 ? 'min-h-[3rem]' :
		cfg.recipe_count === 2 ? 'min-h-[2rem]' : 'min-h-[1.5rem]'
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
				class="w-full text-left text-xs transition-colors select-none pr-6 px-2 py-1.5 rounded-lg empty-accompaniment {slot?.recipe ? 'has-recipe filled-accompaniment' : ''}"
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

	</div>
{:else}
	<!-- Main recipe slot -->
	<div class="flex-1 flex flex-col" use:squareLimit>
		<div class="dropdown-container relative flex-1 flex flex-col"
			style:box-shadow={isDragOver ? '0 0 0 2px var(--primary)' : undefined}
			style:outline={isMoveMode ? '2px dashed var(--primary)' : undefined}
			style:outline-offset={isMoveMode ? '2px' : undefined}
			on:dragover|preventDefault={onDragOver}
			on:dragleave={onDragLeave}
			on:drop|preventDefault={onDrop}
		>
			<div class="relative group/slot flex-1 flex flex-col">
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
					class="w-full text-left text-xs transition-all select-none empty-recipe-slot lg:flex-1 {slot?.recipe?.image_type ? `relative overflow-hidden rounded-xl shadow-sm hover:shadow-md ${imgH}` : slot?.recipe ? 'recipe-without-image px-3 py-2.5 rounded-xl shadow-sm min-h-[2.5rem] flex items-start' : `px-2.5 py-3 rounded-xl ${emptyH} flex flex-col items-center justify-center gap-1`}"
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
						<div class="empty-slot">
							<svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M12 4.5v15m7.5-7.5h-15"/>
							</svg>
							<span class="empty-text">Añadir receta</span>
						</div>
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
	.empty-recipe-slot:not(:has(.empty-slot)) {
		/* empty state when no recipe is assigned - handled via inner element */
	}
	.empty-recipe-slot:has(.empty-slot) {
		transition: all 0.2s ease;
	}
	.empty-recipe-slot:has(.empty-slot):hover {
		border-style: solid;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1);
	}
	.recipe-without-image {
		transition: all 0.2s ease;
	}
	.recipe-without-image:hover {
		box-shadow: 0 6px 16px rgba(0,0,0,0.15);
		transform: translateY(-1px);
	}
	.empty-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 100%;
	}
	.empty-icon {
		width: 24px;
		height: 24px;
		color: var(--text-muted);
		opacity: 0.5;
	}
	.empty-text {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
	}
	.empty-accompaniment {
		transition: all 0.2s ease;
	}
	.empty-accompaniment:hover:not(.has-recipe) {
		border-style: solid;
		box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		transform: scale(1.01);
	}
	.filled-accompaniment {
		transition: all 0.2s ease;
	}
	.filled-accompaniment:hover {
		box-shadow: 0 4px 12px rgba(0,0,0,0.12);
		transform: translateY(-1px);
	}
</style>
