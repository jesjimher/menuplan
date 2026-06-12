<script lang="ts">
	// Celda de una franja (día + comida/cena): cabecera móvil, slots con sus
	// acompañamientos, estado deshabilitado y nota. La lógica de mutación vive
	// en la página; aquí solo se reciben callbacks.
	import RecipeSlot from './RecipeSlot.svelte';
	import EditableNote from './EditableNote.svelte';
	import SlotAddButtons from './SlotAddButtons.svelte';
	import type { MealConfig, SlotData, ScheduleWithRecipe } from '$lib/types/index.js';
	import type { WeekDragDrop } from '$lib/utils/weekDragDrop.svelte.js';

	let {
		weekday, mealType, col, isToday, weekKey,
		cfg, allTags, editingTagKey, busySlots, isTouchDevice, isMoveMode,
		dnd, slotSchedules,
		getSlot, slotKey, makeSlotCallbacks,
		onIncrementMealCount, onDecrementMealCount, onUpdateConfig,
		onSetDisabledComment, onSetMealNote, onOpenPicker, onRemoveSlot
	}: {
		weekday: number;
		mealType: 'comida' | 'cena';
		col: number;
		isToday: boolean;
		weekKey: string;
		cfg: MealConfig;
		allTags: string[];
		editingTagKey: string | null;
		busySlots: Set<string>;
		isTouchDevice: boolean;
		isMoveMode: boolean;
		dnd: WeekDragDrop;
		slotSchedules: ScheduleWithRecipe[];
		getSlot: (weekday: number, mealType: string, slotIndex: number, isAcc: number) => SlotData | undefined;
		slotKey: (weekday: number, mealType: string, slotIndex: number, isAcc: number) => string;
		makeSlotCallbacks: (weekday: number, mealType: string, slotIdx: number, isAcc: number) => Record<string, unknown>;
		onIncrementMealCount: () => void;
		onDecrementMealCount: () => void;
		onUpdateConfig: (field: string, value: number) => void;
		onSetDisabledComment: (comment: string) => void;
		onSetMealNote: (note: string) => void;
		onOpenPicker: (slotIdx: number, isAcc: number) => void;
		onRemoveSlot: (slotIdx: number, isAcc: number) => void;
	} = $props();

	let isComida = $derived(mealType === 'comida');
	let row = $derived(isComida ? 2 : 3);
</script>

<div class="flex-1 flex flex-col {isComida ? '' : 'mt-2 lg:mt-0 lg:pt-3'}"
	style="background: {isToday ? 'var(--primary-light)' : `var(--${mealType}-band)`}; grid-column: {col}; grid-row: {row};">

	<!-- Encabezado de franja -->
	<div class="flex items-center gap-1 px-2.5 pt-2 lg:hidden"
		style="color: {cfg.disabled ? 'var(--text-muted)' : (isComida ? 'var(--comida-accent)' : 'var(--cena-accent)')};">
		{#if isComida}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 shrink-0"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 shrink-0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
		{/if}
		<span class="text-[11px] font-black uppercase tracking-tighter"
			style="{cfg.disabled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
			{isComida ? 'COMIDA' : 'CENA'}
		</span>
	</div>

	{#if cfg.disabled}
		<div class="px-2.5 pb-2.5 pt-2 flex-1 flex flex-col">
			<div class="flex-1 flex items-center justify-center rounded-xl px-3 py-2 cursor-text"
				on:click={(e) => (e.currentTarget.querySelector('[contenteditable]') as HTMLElement)?.focus()}
				style="background: var(--surface-container-highest); border: none;">
				{#key weekKey}
					<EditableNote
						value={cfg.disabled_comment}
						placeholder="Motivo (ej. Cenamos fuera)..."
						ariaLabel="Motivo de desactivación de {mealType}"
						onSave={onSetDisabledComment}
					/>
				{/key}
			</div>
		</div>
		<!-- Botones añadir cuando no hay slots -->
		<SlotAddButtons class="px-2 pb-2"
			onAddPlato={onIncrementMealCount}
			onAddAcomp={() => onUpdateConfig('accompaniment_per_slot', cfg.accompaniment_per_slot + 1)}
		/>
	{:else}

		<!-- Slots -->
		<div class="px-2 pb-3 pt-2 flex-1 flex flex-col gap-2">
			{#each Array(cfg.recipe_count) as _, slotIdx}
				{@const slot = getSlot(weekday, mealType, slotIdx, 0)}
				{@const key = slotKey(weekday, mealType, slotIdx, 0)}
				{@const slotTags = cfg.required_tags[slotIdx] ?? []}
				{@const slotTagEditKey = `tag-${weekday}-${mealType}-${slotIdx}`}
				{@const callbacks = makeSlotCallbacks(weekday, mealType, slotIdx, 0)}

				<RecipeSlot
					{weekday} {mealType} {slotIdx}
					{slot} slotKeyStr={key} {cfg} {allTags}
					isBusy={busySlots.has(key)}
					isDragSource={!!dnd.dragSource && key === slotKey(dnd.dragSource.weekday, dnd.dragSource.mealType, dnd.dragSource.slotIndex, dnd.dragSource.isAcc)}
					isDragOver={dnd.dragOver === key}
					{isMoveMode}
					{isTouchDevice}
					{editingTagKey} {slotTags} {slotTagEditKey}
					schedule={slot?.schedule ?? null}
					{slotSchedules}
					{...callbacks}
					onDeleteSlot={onDecrementMealCount}
				/>

				<!-- Acompañamientos por receta -->
				{#if cfg.accompaniment_per_recipe > 0}
					{#each Array(cfg.accompaniment_per_recipe) as _, aIdx}
						{@const accSlotIdx = slotIdx * cfg.accompaniment_per_recipe + aIdx}
						{@const accSlot = getSlot(weekday, mealType, accSlotIdx, 1)}
						{@const accKey = slotKey(weekday, mealType, accSlotIdx, 1)}
						{@const accCallbacks = makeSlotCallbacks(weekday, mealType, accSlotIdx, 1)}

						<RecipeSlot
							{weekday} {mealType} slotIdx={accSlotIdx} isAcc={1}
							slot={accSlot} slotKeyStr={accKey} {cfg} {allTags}
							isDragSource={!!dnd.dragSource && accKey === slotKey(dnd.dragSource.weekday, dnd.dragSource.mealType, dnd.dragSource.slotIndex, dnd.dragSource.isAcc)}
							isDragOver={dnd.dragOver === accKey}
							{isMoveMode}
							{isTouchDevice}
							{editingTagKey}
							{...accCallbacks}
						/>
					{/each}
				{/if}
			{/each}

			<!-- Acompañamientos por franja -->
			{#if cfg.accompaniment_per_slot > 0}
				<div class="pt-1.5 space-y-1.5 shrink-0"
					style="border-top: 1px solid var(--surface-container-highest);">
					{#each Array(cfg.accompaniment_per_slot) as _, aIdx}
						{@const accSlot = getSlot(weekday, mealType, aIdx, 1)}
						<div class="relative group/accslot">
							<button
								on:click|stopPropagation={() => onOpenPicker(aIdx, 1)}
								class="w-full text-left text-[10px] transition-colors px-2 py-1.5 pr-12 rounded-lg"
								style="{accSlot?.recipe
									? `background: var(--secondary-container); color: var(--secondary);`
									: `background: transparent; border: 1px dashed var(--border); color: var(--text-muted);`}"
							>
								<span class="{accSlot?.recipe ? 'font-semibold' : 'italic'}">
									{accSlot?.recipe?.name ?? 'Elegir acompañamiento'}
								</span>
							</button>
							<div class="absolute top-1/2 right-1.5 -translate-y-1/2 flex gap-1 opacity-0 group-hover/accslot:opacity-100 transition-opacity">
								{#if accSlot?.recipe}
									<button
										on:click|stopPropagation={() => onRemoveSlot(aIdx, 1)}
										class="w-5 h-5 flex items-center justify-center rounded-full shadow-sm text-xs font-bold"
										style="background: rgba(255,255,255,0.92); color: var(--error); box-shadow: 0 2px 5px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(0,0,0,0.22);"
										aria-label="Quitar receta"
										title="Quitar receta"
									>&times;</button>
								{/if}
								<button
									on:click|stopPropagation={() => onUpdateConfig('accompaniment_per_slot', Math.max(0, cfg.accompaniment_per_slot - 1))}
									class="w-5 h-5 flex items-center justify-center rounded-full shadow-sm transition-colors"
									style="background: var(--error); color: white; box-shadow: 0 2px 5px rgba(0,0,0,0.35);"
									aria-label="Eliminar acompañamiento"
									title="Eliminar acompañamiento"
								><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Botones añadir justo después del último slot -->
			<SlotAddButtons class="pt-2"
				onAddPlato={onIncrementMealCount}
				onAddAcomp={() => onUpdateConfig('accompaniment_per_slot', cfg.accompaniment_per_slot + 1)}
			/>
		</div>
		<!-- Nota de franja -->
		<div class="px-2.5 shrink-0 flex items-baseline gap-1 {cfg.note ? 'pb-2' : 'pb-1'}"
			on:click={(e) => (e.currentTarget.querySelector('[contenteditable]') as HTMLElement)?.focus()}>
			<span class="text-[9px] font-black uppercase tracking-widest shrink-0" style="color: var(--text-muted);">NOTA:</span>
			{#key weekKey}
				<EditableNote
					variant="note"
					value={cfg.note}
					placeholder="..."
					ariaLabel="Nota de {mealType}"
					onSave={onSetMealNote}
				/>
			{/key}
		</div>
	{/if}
</div>
