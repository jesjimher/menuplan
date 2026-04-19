<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { WeekData, Recipe, Rule } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, WEEKDAY_NAMES, SHORT_MONTH_NAMES } from '$lib/utils/dates.js';
	import WeekHeader from '$lib/components/week/WeekHeader.svelte';
	import ViolationBanner from '$lib/components/week/ViolationBanner.svelte';
	import RecipeSlot from '$lib/components/week/RecipeSlot.svelte';
	import RecipePickerModal from '$lib/components/week/RecipePickerModal.svelte';
	import { sidebarOpen } from '$lib/stores/ui.js';

	let { data } = $props();

	let weekKey = $state(data.weekKey);
	let weekData = $state<WeekData | null>(data.weekData);
	let recipes = $state<Recipe[]>(data.recipes);
	let rules = $state<Rule[]>(data.rules);
	let allTags = $state<string[]>(data.allTags);
	let calculating = $state(false);
	let busySlots = $state(new Set<string>());
	let editingTagKey = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let errorTimeout: ReturnType<typeof setTimeout>;
	let selectedDay = $state(1);

	$effect(() => {
		const currentWeek = getWeekKey();
		if (weekKey === currentWeek) {
			const now = new Date();
			const jsDay = now.getDay();
			selectedDay = jsDay === 0 ? 7 : jsDay;
		} else {
			selectedDay = 1;
		}
	});

	function showError(msg: string) {
		errorMsg = msg;
		clearTimeout(errorTimeout);
		errorTimeout = setTimeout(() => { errorMsg = null; }, 5000);
	}

	// Sync when server data changes (e.g. navigating weeks via goto)
	$effect(() => {
		weekKey = data.weekKey;
		weekData = data.weekData;
		recipes = data.recipes;
		rules = data.rules;
		allTags = data.allTags;
	});

	// Recipe picker modal state
	type PickerSlot = { weekday: number; mealType: string; slotIndex: number; isAcc: number };
	let pickerOpen = $state(false);
	let pickerSlot = $state<PickerSlot | null>(null);

	// Drag & move state
	type SlotCoord = { weekday: number; mealType: string; slotIndex: number; isAcc: number };
	let dragSource = $state<SlotCoord | null>(null);
	let dragOver = $state<string | null>(null);
	let moveSource = $state<SlotCoord | null>(null);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let dayLongPressTimer: ReturnType<typeof setTimeout> | null = null;
	let dayDisableConfirm = $state<number | null>(null);
	let isTouchDevice = false;

	let weekDates = $derived(getWeekDates(weekKey));

	const now = new Date();
	const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window;
	});

	function prevWeek() {
		const prev = getPreviousWeekKey(weekKey);
		goto(`/week?weekKey=${prev}`, { noScroll: true });
	}

	function nextWeek() {
		const [year, weekStr] = weekKey.split('-W');
		let wn = parseInt(weekStr) + 1;
		let yn = parseInt(year);
		if (wn > 52) { wn = 1; yn++; }
		const next = `${yn}-W${String(wn).padStart(2, '0')}`;
		goto(`/week?weekKey=${next}`, { noScroll: true });
	}

	function toToday() {
		const today = getWeekKey();
		goto(`/week?weekKey=${today}`, { noScroll: true });
	}

	function getSlot(weekday: number, mealType: string, slotIndex: number, isAccompaniment: number) {
		return weekData?.slots.find(s =>
			s.weekday === weekday && s.meal_type === mealType &&
			s.slot_index === slotIndex && s.is_accompaniment === isAccompaniment
		);
	}

	function getDayConfig(weekday: number, mealType: 'comida' | 'cena') {
		return weekData?.configs[weekday]?.[mealType] ?? { recipe_count: 1, accompaniment_per_recipe: 1, accompaniment_per_slot: 0, required_tags: [], disabled: false, disabled_comment: null, note: null };
	}

	function slotKey(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		return `${weekday}-${mealType}-${slotIndex}-${isAcc}`;
	}

	function openRecipePicker(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		pickerSlot = { weekday, mealType, slotIndex, isAcc };
		pickerOpen = true;
	}

	function patchSlot(weekday: number, mealType: string, slotIndex: number, isAcc: number, recipe: Recipe | null) {
		if (!weekData) return;
		const exists = weekData.slots.some(s =>
			s.weekday === weekday && s.meal_type === mealType &&
			s.slot_index === slotIndex && s.is_accompaniment === isAcc
		);
		let newSlots;
		if (exists) {
			newSlots = weekData.slots.map(s =>
				s.weekday === weekday && s.meal_type === mealType &&
				s.slot_index === slotIndex && s.is_accompaniment === isAcc
					? { ...s, recipe }
					: s
			);
		} else if (recipe) {
			newSlots = [...weekData.slots, { weekday, meal_type: mealType as 'comida' | 'cena', slot_index: slotIndex, is_accompaniment: isAcc, recipe, member: null }];
		} else {
			return;
		}
		weekData = { ...weekData, slots: newSlots, violations: checkRules(newSlots, rules) };
	}

	async function selectRecipe(weekday: number, mealType: string, slotIndex: number, isAcc: number, recipeId: number) {
		const prev = getSlot(weekday, mealType, slotIndex, isAcc)?.recipe ?? null;
		patchSlot(weekday, mealType, slotIndex, isAcc, recipes.find(r => r.id === recipeId) ?? null);
		try {
			const res = await fetch('/api/week/assign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc, recipe_id: recipeId, member_id: null })
			});
			if (!res.ok) throw new Error();
		} catch {
			patchSlot(weekday, mealType, slotIndex, isAcc, prev);
			showError('Error al asignar receta');
		}
	}

	async function removeSlot(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		const prev = getSlot(weekday, mealType, slotIndex, isAcc)?.recipe ?? null;
		patchSlot(weekday, mealType, slotIndex, isAcc, null);
		try {
			const res = await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc })
			});
			if (!res.ok) throw new Error();
		} catch {
			patchSlot(weekday, mealType, slotIndex, isAcc, prev);
			showError('Error al quitar receta');
		}
	}

	async function moveRecipe(from: SlotCoord, to: SlotCoord) {
		if (slotKey(from.weekday, from.mealType, from.slotIndex, from.isAcc) ===
			slotKey(to.weekday, to.mealType, to.slotIndex, to.isAcc)) return;
		const fromRecipe = getSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc)?.recipe ?? null;
		const toRecipe   = getSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc)?.recipe ?? null;
		if (!fromRecipe) return;
		patchSlot(to.weekday,   to.mealType,   to.slotIndex,   to.isAcc,   fromRecipe);
		patchSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc, toRecipe);
		const doAssign = (coord: SlotCoord, recipe: Recipe | null) => {
			if (recipe) {
				return fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, weekday: coord.weekday, meal_type: coord.mealType,
						slot_index: coord.slotIndex, is_accompaniment: coord.isAcc, recipe_id: recipe.id, member_id: null }) });
			} else {
				return fetch('/api/week/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, weekday: coord.weekday, meal_type: coord.mealType,
						slot_index: coord.slotIndex, is_accompaniment: coord.isAcc }) });
			}
		};
		try {
			const results = await Promise.all([doAssign(to, fromRecipe), doAssign(from, toRecipe)]);
			if (results.some(r => !r.ok)) throw new Error();
		} catch {
			patchSlot(to.weekday,   to.mealType,   to.slotIndex,   to.isAcc,   toRecipe);
			patchSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc, fromRecipe);
			showError('Error al mover receta');
		}
	}

	async function randomSlot(weekday: number, mealType: 'comida' | 'cena', slotIndex: number, isAcc: number) {
		const key = slotKey(weekday, mealType, slotIndex, isAcc);
		if (busySlots.has(key)) return;
		busySlots = new Set([...busySlots, key]);
		try {
			const res = await fetch('/api/week/calculate-slot', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc })
			});
			if (res.ok) {
				const { recipe } = await res.json();
				patchSlot(weekday, mealType, slotIndex, isAcc, recipe);
			} else {
				showError('No se encontró receta para este slot');
			}
		} catch {
			showError('Error de conexión');
		} finally {
			const next = new Set(busySlots);
			next.delete(key);
			busySlots = next;
		}
	}

	async function calculatePlan() {
		calculating = true;
		try {
			const res = await fetch('/api/week/calculate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			if (!res.ok) { showError('Error al calcular el plan'); return; }
			weekData = await res.json();
		} catch {
			showError('Error de conexión al calcular');
		} finally {
			calculating = false;
		}
	}

	async function recalculatePlan() {
		if (!confirm('¿Limpiar todo el plan y recalcular desde cero?')) return;
		calculating = true;
		try {
			const clearRes = await fetch('/api/week/clear', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			if (!clearRes.ok) { showError('Error al limpiar el plan'); return; }
			const res = await fetch('/api/week/calculate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			if (!res.ok) { showError('Error al recalcular el plan'); return; }
			weekData = await res.json();
		} catch {
			showError('Error de conexión al recalcular');
		} finally {
			calculating = false;
		}
	}

	async function clearPlan() {
		if (!confirm('¿Limpiar todo el plan de esta semana?')) return;
		try {
			const res = await fetch('/api/week/clear', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			if (!res.ok) { showError('Error al limpiar el plan'); return; }
			await invalidateAll();
		} catch {
			showError('Error de conexión');
		}
	}

	async function copyPrevious() {
		if (!confirm('¿Copiar el plan de la semana anterior?')) return;
		try {
			const res = await fetch('/api/week/copy-previous', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			if (!res.ok) { showError('Error al copiar semana anterior'); return; }
			await invalidateAll();
		} catch {
			showError('Error de conexión');
		}
	}

	async function updateConfig(weekday: number, mealType: string, field: string, value: number) {
		await fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, [field]: value })
		});
		await invalidateAll();
	}

	async function decrementMealCount(weekday: number, mealType: string) {
		if (!weekData) return;
		const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena');
		if (cfg.recipe_count <= 1) {
			const comment = cfg.disabled_comment ?? '';
			weekData = {
				...weekData,
				configs: {
					...weekData.configs,
					[weekday]: {
						...weekData.configs[weekday],
						[mealType]: { ...cfg, recipe_count: 0, disabled: true, disabled_comment: comment }
					}
				}
			};
			fetch('/api/week/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, recipe_count: 0, disabled: true, disabled_comment: comment })
			});
		} else {
			await updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count - 1);
		}
	}

	async function incrementMealCount(weekday: number, mealType: string) {
		if (!weekData) return;
		const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena');
		if (cfg.disabled) {
			weekData = {
				...weekData,
				configs: {
					...weekData.configs,
					[weekday]: {
						...weekData.configs[weekday],
						[mealType]: { ...cfg, recipe_count: 1, disabled: false, disabled_comment: null }
					}
				}
			};
			fetch('/api/week/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, recipe_count: 1, disabled: false, disabled_comment: null })
			});
		} else {
			await updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1);
		}
	}

	function setDisabledComment(weekday: number, mealType: string, comment: string) {
		fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, disabled: true, disabled_comment: comment })
		});
	}

	async function disableDay(weekday: number) {
		if (!weekData) return;
		const comidaCfg = weekData.configs[weekday]?.comida;
		const cenaCfg = weekData.configs[weekday]?.cena;
		const alreadyDisabled = comidaCfg?.disabled && cenaCfg?.disabled;
		const nowDisabled = !alreadyDisabled;
		const sharedComment = nowDisabled ? (comidaCfg?.disabled_comment ?? cenaCfg?.disabled_comment ?? '') : null;
		weekData = {
			...weekData,
			configs: {
				...weekData.configs,
				[weekday]: {
					comida: { ...comidaCfg, disabled: nowDisabled, disabled_comment: sharedComment },
					cena: { ...cenaCfg, disabled: nowDisabled, disabled_comment: sharedComment }
				}
			}
		};
		await Promise.all([
			fetch('/api/week/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: 'comida', disabled: nowDisabled, disabled_comment: sharedComment })
			}),
			fetch('/api/week/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: 'cena', disabled: nowDisabled, disabled_comment: sharedComment })
			})
		]);
	}

	function setMealNote(weekday: number, mealType: string, note: string) {
		fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, note: note || null })
		});
	}

	function setDayComment(weekday: number, comment: string) {
		fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: 'comida', disabled: true, disabled_comment: comment })
		});
		fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: 'cena', disabled: true, disabled_comment: comment })
		});
	}

	function getSlotTags(weekday: number, mealType: string, slotIdx: number): string[] {
		return weekData?.configs[weekday]?.[mealType as 'comida' | 'cena']?.required_tags[slotIdx] ?? [];
	}

	async function setSlotTags(weekday: number, mealType: string, slotIdx: number, tags: string[]) {
		await fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIdx, required_tags: tags })
		});
		await invalidateAll();
	}

	async function addRequiredTag(weekday: number, mealType: string, slotIdx: number, tag: string) {
		const value = tag.trim().toLowerCase();
		editingTagKey = null;
		if (!value) return;
		const current = getSlotTags(weekday, mealType, slotIdx);
		if (current.includes(value)) return;
		await setSlotTags(weekday, mealType, slotIdx, [...current, value]);
	}

	async function removeRequiredTag(weekday: number, mealType: string, slotIdx: number, tag: string) {
		const current = getSlotTags(weekday, mealType, slotIdx);
		await setSlotTags(weekday, mealType, slotIdx, current.filter(t => t !== tag));
	}

	// Helpers for creating slot callbacks
	function makeSlotCallbacks(weekday: number, mealType: string, slotIdx: number, isAcc: number) {
		const key = slotKey(weekday, mealType, slotIdx, isAcc);
		const coord: SlotCoord = { weekday, mealType, slotIndex: slotIdx, isAcc };
		return {
			onSelectRecipe: (recipeId: number) => selectRecipe(weekday, mealType, slotIdx, isAcc, recipeId),
			onRemove: () => removeSlot(weekday, mealType, slotIdx, isAcc),
			onRandom: () => randomSlot(weekday, mealType as 'comida' | 'cena', slotIdx, isAcc),
			onAddTag: (tag: string) => addRequiredTag(weekday, mealType, slotIdx, tag),
			onRemoveTag: (tag: string) => removeRequiredTag(weekday, mealType, slotIdx, tag),
			onSetEditingTag: (k: string | null) => { editingTagKey = k; },
			onDragStart: (e: DragEvent) => {
				const slot = getSlot(weekday, mealType, slotIdx, isAcc);
				if (!slot?.recipe) return;
				dragSource = coord;
				e.dataTransfer!.effectAllowed = 'move';
				e.dataTransfer!.setData('text/plain', key);
			},
			onDragEnd: () => { dragSource = null; dragOver = null; },
			onDragOver: (e: DragEvent) => { if (!dragSource) return; e.dataTransfer!.dropEffect = 'move'; dragOver = key; },
			onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver = null; },
			onDrop: () => {
				if (!dragSource) return;
				moveRecipe(dragSource, coord);
				dragSource = null; dragOver = null;
			},
			onMoveClick: () => {
				if (moveSource) {
					moveRecipe(moveSource, coord);
					moveSource = null;
					return;
				}
				openRecipePicker(weekday, mealType, slotIdx, isAcc);
			},
			onTouchStart: () => {
				const slot = getSlot(weekday, mealType, slotIdx, isAcc);
				if (!isTouchDevice || !slot?.recipe) return;
				longPressTimer = setTimeout(() => {
					moveSource = coord;
					longPressTimer = null;
				}, 500);
			},
			onTouchEnd: () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } },
			onTouchMove: () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } },
		};
	}
</script>

<svelte:window
	on:keydown={(e) => { if (e.key === 'Escape') { moveSource = null; dragSource = null; dayDisableConfirm = null; } }}
/>

<div class="flex flex-col h-full" style="background: var(--background);">

	<WeekHeader
		{weekKey}
		{calculating}
		onPrevWeek={prevWeek}
		onToday={toToday}
		onNextWeek={nextWeek}
		onCalculate={calculatePlan}
		onRecalculate={recalculatePlan}
		onClear={clearPlan}
		onCopyPrevious={copyPrevious}
	/>

	{#if errorMsg}
		<div class="px-4 sm:px-6 py-2 text-sm font-medium flex items-center justify-between"
			style="background: var(--error-container, #fdd); color: var(--error, #c00);">
			<span>{errorMsg}</span>
			<button on:click={() => errorMsg = null} class="ml-2 font-bold hover:opacity-70">&times;</button>
		</div>
	{/if}

	<!-- Selector de día (solo móvil) -->
	<div class="sm:hidden flex gap-1.5 px-3 pt-3 pb-1 shrink-0">
		{#each [1,2,3,4,5,6,7] as weekday, i}
			{@const date = weekDates[i]}
			{@const isSelected = weekday === selectedDay}
			{@const isToday = date != null && date.getTime() === todayUTC.getTime()}
			{@const isDisabled = weekData?.configs[weekday]?.comida?.disabled && weekData?.configs[weekday]?.cena?.disabled}
			<button
				on:click={() => selectedDay = weekday}
				on:touchstart|passive={() => {
					dayLongPressTimer = setTimeout(() => {
						selectedDay = weekday;
						dayDisableConfirm = weekday;
						dayLongPressTimer = null;
					}, 500);
				}}
				on:touchend={() => { if (dayLongPressTimer) { clearTimeout(dayLongPressTimer); dayLongPressTimer = null; } }}
				on:touchmove={() => { if (dayLongPressTimer) { clearTimeout(dayLongPressTimer); dayLongPressTimer = null; } }}
				class="flex-1 flex flex-col items-center py-2 px-1 rounded-xl text-center transition-all min-w-0"
				style="{isSelected
					? 'background: var(--primary); color: var(--primary-light);'
					: isToday
						? 'background: var(--primary-light); color: var(--primary); border: 1.5px solid var(--primary);'
						: 'background: var(--surface); color: var(--text-secondary);'}"
			>
				<span class="text-[9px] font-bold uppercase leading-none">{WEEKDAY_NAMES[i].slice(0, 3)}</span>
				{#if date}
					<span class="text-sm font-black leading-none mt-0.5 {isDisabled ? 'line-through opacity-40' : ''}">{date.getUTCDate()}</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Grid semanal -->
	<div class="flex-1 overflow-hidden flex flex-col min-h-0">
		{#if !weekData}
			<div class="text-center py-16 text-sm" style="color: var(--text-muted);">Cargando...</div>
		{:else}
		<div class="flex-1 overflow-auto p-3 sm:p-5 min-h-0">
			<div class="week-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2.5rem_repeat(7,1fr)] gap-3 lg:gap-x-3 lg:gap-y-0">
				<!-- Etiquetas de fila (solo desktop) -->
				<div class="hidden lg:block" style="grid-column: 1; grid-row: 1;"></div>
				<div class="hidden lg:flex items-center justify-center"
					style="grid-column: 1; grid-row: 2; background: var(--comida-header); border-left: 3px solid var(--comida-accent);">
					<span style="writing-mode: vertical-rl; transform: rotate(180deg); color: var(--text);"
						class="text-[11px] font-black uppercase tracking-tight">Comida</span>
				</div>
				<div class="hidden lg:flex items-center justify-center mt-2 lg:mt-3"
					style="grid-column: 1; grid-row: 3; background: var(--cena-header); border-left: 3px solid var(--cena-accent);">
					<span style="writing-mode: vertical-rl; transform: rotate(180deg); color: var(--text);"
						class="text-[11px] font-black uppercase tracking-tight">Cena</span>
				</div>

				{#each [1,2,3,4,5,6,7] as weekday, i}
					{@const date = weekDates[i]}
					{@const isWeekend = i >= 5}
					{@const isToday = date != null && date.getTime() === todayUTC.getTime()}
					{@const dayComidaCfg = weekData?.configs[weekday]?.comida}
					{@const dayCenaCfg = weekData?.configs[weekday]?.cena}
					{@const dayFullyDisabled = dayComidaCfg?.disabled && dayCenaCfg?.disabled}

					<div id="day-{weekday}" class="rounded-2xl overflow-hidden flex flex-col lg:contents {weekday !== selectedDay ? 'max-sm:hidden' : ''}"
						style="{isToday ? 'background: var(--primary-light);' : ''}">

						<!-- Cabecera del día -->
						<div class="max-sm:hidden px-2 pt-4 pb-2 shrink-0 text-center"
							style="grid-column: {i+2}; grid-row: 1; background: {isToday ? 'var(--primary-light)' : 'var(--background)'}; {isToday ? 'border-top: 3px solid var(--primary);' : ''}">
							<div class="flex flex-col items-center">
								<div class="flex items-center gap-1">
									<p class="font-semibold text-base leading-tight" style="font-family: 'Epilogue', sans-serif; color: {isWeekend ? 'var(--primary-hover)' : 'var(--primary)'};">{WEEKDAY_NAMES[i]}</p>
									<button
										on:click={() => disableDay(weekday)}
										title={dayFullyDisabled ? 'Planificar este día' : 'No planificar este día'}
										aria-label={dayFullyDisabled ? `Planificar ${WEEKDAY_NAMES[i]}` : `No planificar ${WEEKDAY_NAMES[i]}`}
										class="w-4 h-4 inline-flex items-center justify-center rounded-full transition-all hover:scale-125 hover:rotate-90"
										style="color: {dayFullyDisabled ? 'var(--error)' : 'var(--text-muted)'};"
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
									</button>
								</div>
								{#if date}
									<p class="text-[10px] uppercase tracking-widest font-bold mt-0.5" style="color: var(--secondary);">{date.getUTCDate()} {SHORT_MONTH_NAMES[date.getUTCMonth()]}</p>
								{/if}
								{#if isToday}
									<span class="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full mt-1" style="background: var(--primary); color: var(--primary-light);">hoy</span>
								{/if}
							</div>
						</div>

						{#if dayFullyDisabled}
							<div class="flex-1 flex flex-col lg:flex-none"
								style="{isToday ? 'background: var(--primary-light);' : ''} grid-column: {i+2}; grid-row: 2 / 4;">
								<div class="px-2.5 py-3 flex-1 flex flex-col">
									<div class="flex-1 flex items-center justify-center rounded-xl px-3 py-2 cursor-text"
									on:click={(e) => (e.currentTarget.querySelector('[contenteditable]') as HTMLElement)?.focus()}
										style="background: var(--surface-container-highest); border: none;">
										{#key weekKey}
										<div
											contenteditable="true"
											role="textbox"
											aria-multiline="true"
											aria-label="Motivo de desactivación del día"
											on:blur={(e) => { const el = e.currentTarget as HTMLDivElement; const t = el.innerText.trim(); if (!t) el.innerHTML = ''; setDayComment(weekday, t); }}
											data-placeholder="Motivo (ej. Vacaciones en París)..."
											class="disabled-reason w-full text-center text-sm focus:outline-none"
											style="color: var(--text);"
										>{dayComidaCfg?.disabled_comment ?? ''}</div>
									{/key}
									</div>
								</div>
							</div>
						{:else}
						{#each ['comida', 'cena'] as mealType, j}
							{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
							{@const isComida = mealType === 'comida'}

							<div class="flex-1 flex flex-col {j === 1 ? 'mt-2 lg:mt-0 lg:pt-3' : ''}"
								style="{isToday ? 'background: var(--primary-light);' : ''} grid-column: {i+2}; grid-row: {j+2};">

								<!-- Encabezado de franja -->
								<div class="flex items-center px-2.5 pt-2 lg:hidden">
									<span class="text-[10px] font-black uppercase tracking-tighter"
										style="color: {cfg.disabled ? 'var(--text-muted)' : (isComida ? 'var(--comida-accent)' : 'var(--cena-accent)')}; {cfg.disabled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
										{isComida ? 'COMIDA' : 'CENA'}
									</span>
								</div>

								{#if cfg.disabled}
									<div class="px-2.5 pb-2.5 pt-2 flex-1 flex flex-col">
										<div class="flex-1 flex items-center justify-center rounded-xl px-3 py-2 cursor-text"
									on:click={(e) => (e.currentTarget.querySelector('[contenteditable]') as HTMLElement)?.focus()}
											style="background: var(--surface-container-highest); border: none;">
											{#key weekKey}
											<div
												contenteditable="true"
												role="textbox"
												aria-multiline="true"
												aria-label="Motivo de desactivación de {mealType}"
												on:blur={(e) => { const el = e.currentTarget as HTMLDivElement; const t = el.innerText.trim(); if (!t) el.innerHTML = ''; setDisabledComment(weekday, mealType, t); }}
												data-placeholder="Motivo (ej. Cenamos fuera)..."
												class="disabled-reason w-full text-center text-sm focus:outline-none"
												style="color: var(--text);"
											>{cfg.disabled_comment ?? ''}</div>
											{/key}
										</div>
									</div>
									<!-- Botones añadir cuando no hay slots -->
									<div class="flex gap-1.5 px-2 pb-2 shrink-0 justify-center">
										<button
											on:click={() => incrementMealCount(weekday, mealType)}
											class="text-[10px] font-semibold py-1.5 px-3 rounded-lg transition-all hover:opacity-80"
											style="border: 1px dashed var(--border); color: var(--text-muted); background: transparent;"
										>+ plato</button>
										<button
											on:click={() => updateConfig(weekday, mealType, 'accompaniment_per_slot', cfg.accompaniment_per_slot + 1)}
											class="text-[10px] font-semibold py-1.5 px-3 rounded-lg transition-all hover:opacity-80"
											style="border: 1px dashed var(--border); color: var(--text-muted); background: transparent;"
										>+ acomp.</button>
									</div>
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
											isDragSource={!!dragSource && key === slotKey(dragSource.weekday, dragSource.mealType, dragSource.slotIndex, dragSource.isAcc)}
											isDragOver={dragOver === key}
											isMoveMode={!!moveSource}
											{isTouchDevice}
											{editingTagKey} {slotTags} {slotTagEditKey}
											{...callbacks}
											onDeleteSlot={() => decrementMealCount(weekday, mealType)}
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
													isDragSource={!!dragSource && accKey === slotKey(dragSource.weekday, dragSource.mealType, dragSource.slotIndex, dragSource.isAcc)}
													isDragOver={dragOver === accKey}
													isMoveMode={!!moveSource}
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
														on:click|stopPropagation={() => openRecipePicker(weekday, mealType, aIdx, 1)}
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
																on:click|stopPropagation={() => removeSlot(weekday, mealType, aIdx, 1)}
																class="w-5 h-5 flex items-center justify-center rounded-full shadow-sm text-xs font-bold"
																style="background: rgba(255,255,255,0.92); color: var(--error); box-shadow: 0 2px 5px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(0,0,0,0.22);"
																aria-label="Quitar receta"
																title="Quitar receta"
															>&times;</button>
														{/if}
														<button
															on:click|stopPropagation={() => updateConfig(weekday, mealType, 'accompaniment_per_slot', Math.max(0, cfg.accompaniment_per_slot - 1))}
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
									<div class="flex gap-1.5 pt-2 shrink-0 justify-center">
										<button
											on:click={() => incrementMealCount(weekday, mealType)}
											class="text-[10px] font-semibold py-1.5 px-3 rounded-lg transition-all hover:opacity-80"
											style="border: 1px dashed var(--border); color: var(--text-muted); background: transparent;"
										>+ plato</button>
										<button
											on:click={() => updateConfig(weekday, mealType, 'accompaniment_per_slot', cfg.accompaniment_per_slot + 1)}
											class="text-[10px] font-semibold py-1.5 px-3 rounded-lg transition-all hover:opacity-80"
											style="border: 1px dashed var(--border); color: var(--text-muted); background: transparent;"
										>+ acomp.</button>
									</div>
							</div>
							<!-- Nota de franja -->
							<div class="px-2.5 pb-2 shrink-0 flex items-baseline gap-1"
								on:click={(e) => (e.currentTarget.querySelector('[contenteditable]') as HTMLElement)?.focus()}>
								<span class="text-[9px] font-black uppercase tracking-widest shrink-0" style="color: var(--text-muted); opacity: 0.5;">NOTA:</span>
								{#key weekKey}
								<div
									contenteditable="true"
									role="textbox"
									aria-multiline="true"
									aria-label="Nota de {mealType}"
									on:blur={(e) => { const el = e.currentTarget as HTMLDivElement; const t = el.innerText.trim(); if (!t) el.innerHTML = ''; setMealNote(weekday, mealType, t); }}
									data-placeholder="..."
									class="meal-note flex-1 text-[11px] focus:outline-none px-1 py-0.5 rounded focus:bg-[var(--surface)] cursor-text"
									style="color: var(--text); font-weight: 600;"
								>{cfg.note ?? ''}</div>
								{/key}
							</div>
						{/if}
						</div>
					{/each}
					{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if weekData}
			<ViolationBanner violations={weekData.violations ?? []} />
		{/if}
		{/if}
	</div>

	{#if pickerSlot}
		<RecipePickerModal
			open={pickerOpen}
			weekKey={weekKey}
			weekday={pickerSlot.weekday}
			mealType={pickerSlot.mealType}
			slotIndex={pickerSlot.slotIndex}
			isAcc={pickerSlot.isAcc}
			{allTags}
			onSelect={(id) => {
				pickerOpen = false;
				selectRecipe(pickerSlot!.weekday, pickerSlot!.mealType, pickerSlot!.slotIndex, pickerSlot!.isAcc, id);
			}}
			onClose={() => { pickerOpen = false; }}
		/>
	{/if}

	{#if dayDisableConfirm !== null}
		{@const confirmDay = dayDisableConfirm}
		{@const confirmName = WEEKDAY_NAMES[(confirmDay - 1)]}
		{@const alreadyDisabled = weekData?.configs[confirmDay]?.comida?.disabled && weekData?.configs[confirmDay]?.cena?.disabled}
		<div class="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between shadow-lg"
			style="background: var(--error); color: white;">
			<span class="text-sm font-bold">
				{alreadyDisabled ? `¿Volver a planificar ${confirmName}?` : `¿No planificar ${confirmName}?`}
			</span>
			<div class="flex gap-2">
				<button
					on:click={() => { disableDay(confirmDay); dayDisableConfirm = null; }}
					class="text-sm font-bold px-3 py-1 rounded-full"
					style="background: rgba(255,255,255,0.25);">
					Sí
				</button>
				<button
					on:click={() => dayDisableConfirm = null}
					class="text-sm font-bold px-3 py-1 rounded-full"
					style="background: rgba(0,0,0,0.15);">
					Cancelar
				</button>
			</div>
		</div>
	{/if}

	{#if moveSource}
		<div class="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between shadow-lg"
			style="background: var(--primary); color: white;">
			<span class="text-sm font-bold">
				Toca el destino de «{getSlot(moveSource.weekday, moveSource.mealType, moveSource.slotIndex, moveSource.isAcc)?.recipe?.name}»
			</span>
			<button
				on:click={() => moveSource = null}
				class="text-sm font-bold px-3 py-1 rounded-full"
				style="background: rgba(255,255,255,0.2);">
				Cancelar
			</button>
		</div>
	{/if}
</div>

<style>
	@media (min-width: 1024px) {
		.week-grid {
			min-height: 100%;
			grid-template-rows: auto 1fr 1fr;
		}
	}
	.select-none {
		-webkit-touch-callout: none;
	}
	.disabled-reason {
		font-weight: 600;
	}
	.disabled-reason:empty::before {
		content: attr(data-placeholder);
		color: var(--text-muted);
		font-weight: 400;
		font-style: italic;
		pointer-events: none;
	}
	.disabled-reason:focus::before {
		content: none;
	}
	.meal-note:empty::before {
		content: attr(data-placeholder);
		color: var(--text-muted);
		font-weight: 400;
		font-style: italic;
		pointer-events: none;
	}
	.meal-note:focus::before {
		content: none;
	}
</style>
