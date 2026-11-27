<script lang="ts">
	// Celda de una franja (día + comida/cena): cabecera móvil, platos, luego
	// acompañamientos, estado deshabilitado y nota. La lógica de mutación vive
	// en la página; aquí solo se reciben callbacks.
	import RecipeSlot from './RecipeSlot.svelte';
	import EditableNote from './EditableNote.svelte';
	import SlotAddButtons from './SlotAddButtons.svelte';
	import type { MealConfig, SlotData, ScheduleWithRecipe, Person } from '$lib/types/index.js';
	import type { WeekDragDrop } from '$lib/utils/weekDragDrop.svelte.js';

	let {
		weekday, mealType, col, isToday, weekKey,
		cfg, allTags, editingTagKey, busySlots, isTouchDevice, isMoveMode,
		dnd, slotSchedules, accSlotSchedules,
		getSlot, slotKey, makeSlotCallbacks,
		people, slotPeopleIds, isSlotHidden,
		onAddMealSlot, onRemoveMealSlot,
		onSetDisabledComment, onSetMealNote, onRemoveSlot
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
		accSlotSchedules: ScheduleWithRecipe[];
		getSlot: (weekday: number, mealType: string, slotId: number, isAcc: number) => SlotData | undefined;
		slotKey: (weekday: number, mealType: string, slotId: number, isAcc: number) => string;
		makeSlotCallbacks: (weekday: number, mealType: string, slotId: number, isAcc: number) => Record<string, unknown>;
		people: Person[];
		/** Para quién es la receta del hueco (vacío = para todos). */
		slotPeopleIds: (weekday: number, mealType: string, slotId: number, isAcc: number) => number[];
		/** En la vista por persona, oculta las recetas que no son para ella. */
		isSlotHidden: (weekday: number, mealType: string, slotId: number, isAcc: number) => boolean;
		/** Añade un hueco (plato o acompañamiento). */
		onAddMealSlot: (kind: 'main' | 'acc') => void;
		/** Quita un hueco concreto (no solo su receta). */
		onRemoveMealSlot: (slotId: number) => void;
		onSetDisabledComment: (comment: string) => void;
		onSetMealNote: (note: string) => void;
		/** Quita la receta de un hueco. */
		onRemoveSlot: (slotId: number, isAcc: number) => void;
	} = $props();

	let isComida = $derived(mealType === 'comida');
	let mainSlots = $derived(cfg.slots.filter(s => s.kind === 'main'));
	let accSlots = $derived(cfg.slots.filter(s => s.kind === 'acc'));
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
			onAddPlato={() => onAddMealSlot('main')}
			onAddAcomp={() => onAddMealSlot('acc')}
		/>
	{:else}

		<!-- Slots: primero los platos y luego los acompañamientos -->
		<div class="px-2 pb-3 pt-2 flex-1 flex flex-col gap-2">
			{#each [...mainSlots, ...accSlots] as ms (ms.id)}
				{@const slotId = ms.id}
				{@const isAcc = ms.kind === 'acc' ? 1 : 0}
				{@const slot = getSlot(weekday, mealType, slotId, isAcc)}
				{@const key = slotKey(weekday, mealType, slotId, isAcc)}
				{@const callbacks = makeSlotCallbacks(weekday, mealType, slotId, isAcc)}

				{#if !isSlotHidden(weekday, mealType, slotId, isAcc)}
				<RecipeSlot
					{weekday} {mealType} {slotId} {isAcc}
					{slot} slotKeyStr={key} {cfg} {allTags}
					isBusy={busySlots.has(key)}
					isDragSource={!!dnd.dragSource && key === slotKey(dnd.dragSource.weekday, dnd.dragSource.mealType, dnd.dragSource.slotId, dnd.dragSource.isAcc)}
					isDragOver={dnd.dragOver === key}
					{isMoveMode}
					{isTouchDevice}
					{editingTagKey} slotTags={ms.tags} slotTagEditKey={`tag-${slotId}`}
					schedule={slot?.schedule ?? null}
					slotSchedules={isAcc ? accSlotSchedules : slotSchedules}
					{...callbacks}
					{people}
					slotPeople={slotPeopleIds(weekday, mealType, slotId, isAcc)}
					onDeleteSlot={ms.virtual
						// Hueco que solo existe porque lo añade una programación: quitarlo es quitar la receta programada
						? () => onRemoveSlot(slotId, isAcc)
						: () => onRemoveMealSlot(slotId)}
				/>
				{/if}
			{/each}

			<!-- Botones añadir justo después del último slot -->
			<SlotAddButtons class="pt-2"
				onAddPlato={() => onAddMealSlot('main')}
				onAddAcomp={() => onAddMealSlot('acc')}
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
