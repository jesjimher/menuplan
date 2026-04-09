<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { WeekData, Recipe, Rule } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, WEEKDAY_NAMES, SHORT_MONTH_NAMES } from '$lib/utils/dates.js';
	import WeekHeader from '$lib/components/week/WeekHeader.svelte';
	import ViolationBanner from '$lib/components/week/ViolationBanner.svelte';
	import RecipeSlot from '$lib/components/week/RecipeSlot.svelte';
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

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}

	// Recipe search state per slot
	let openDropdown = $state<string | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<Recipe[]>([]);
	let topRecipes = $state<Recipe[]>([]);
	let searchTimeout: ReturnType<typeof setTimeout>;

	// Drag & move state
	type SlotCoord = { weekday: number; mealType: string; slotIndex: number; isAcc: number };
	let dragSource = $state<SlotCoord | null>(null);
	let dragOver = $state<string | null>(null);
	let moveSource = $state<SlotCoord | null>(null);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let isTouchDevice = false;

	let weekDates = $derived(getWeekDates(weekKey));

	const now = new Date();
	const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window;

		// On mobile, auto-scroll to today if viewing the current week
		if (window.innerWidth < 640 && weekKey === getWeekKey()) {
			const today = new Date();
			const jsDay = today.getDay(); // 0=Sun, 1=Mon...6=Sat
			const isoWeekday = jsDay === 0 ? 7 : jsDay; // 1=Mon...7=Sun
			document.getElementById(`day-${isoWeekday}`)?.scrollIntoView({ block: 'start' });
		}
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
		return weekData?.configs[weekday]?.[mealType] ?? { recipe_count: 1, accompaniment_per_recipe: 1, accompaniment_per_slot: 0, required_tags: [] };
	}

	function slotKey(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		return `${weekday}-${mealType}-${slotIndex}-${isAcc}`;
	}

	function openSlotDropdown(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		const key = slotKey(weekday, mealType, slotIndex, isAcc);
		openDropdown = key;
		searchQuery = '';
		searchResults = recipes.filter(r => {
			const tags = r.tags.split(',').map(t => t.trim().toLowerCase());
			const requiredTag = isAcc ? 'acompañamiento' : mealType;
			return tags.includes(requiredTag);
		}).slice(0, 20);

		fetch(`/api/recipes?q=&mealType=${mealType}&weekday=${weekday}`)
			.then(r => r.json())
			.then(data => { topRecipes = data.top || []; });
	}

	function handleSearch(weekday: number, mealType: string, isAcc: number) {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			const requiredTag = isAcc ? 'acompañamiento' : mealType;
			const res = await fetch(`/api/recipes?q=${encodeURIComponent(searchQuery)}&mealType=${requiredTag}&weekday=${weekday}`);
			const data = await res.json();
			searchResults = data.recipes || [];
			topRecipes = data.top || [];
		}, 200);
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
		openDropdown = null;
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

	async function toggleDisableMeal(weekday: number, mealType: string) {
		if (!weekData) return;
		const cfg = weekData.configs[weekday]?.[mealType as 'comida' | 'cena'];
		const nowDisabled = !cfg?.disabled;
		weekData = {
			...weekData,
			configs: {
				...weekData.configs,
				[weekday]: {
					...weekData.configs[weekday],
					[mealType]: { ...cfg, disabled: nowDisabled, disabled_comment: nowDisabled ? (cfg?.disabled_comment ?? '') : null }
				}
			}
		};
		await fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, disabled: nowDisabled, disabled_comment: nowDisabled ? (cfg?.disabled_comment ?? '') : null })
		});
	}

	async function setDisabledComment(weekday: number, mealType: string, comment: string) {
		if (!weekData) return;
		const cfg = weekData.configs[weekday]?.[mealType as 'comida' | 'cena'];
		weekData = {
			...weekData,
			configs: {
				...weekData.configs,
				[weekday]: {
					...weekData.configs[weekday],
					[mealType]: { ...cfg, disabled_comment: comment }
				}
			}
		};
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

	async function setDayComment(weekday: number, comment: string) {
		if (!weekData) return;
		const comidaCfg = weekData.configs[weekday]?.comida;
		const cenaCfg = weekData.configs[weekday]?.cena;
		weekData = {
			...weekData,
			configs: {
				...weekData.configs,
				[weekday]: {
					comida: { ...comidaCfg, disabled_comment: comment },
					cena: { ...cenaCfg, disabled_comment: comment }
				}
			}
		};
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

	function closeDropdown() {
		openDropdown = null;
	}

	function fixedDropdown(node: HTMLElement) {
		const container = node.closest('.dropdown-container') as HTMLElement;
		const trigger = container?.querySelector('button') as HTMLElement;

		function reposition() {
			if (!trigger) return;
			const rect = trigger.getBoundingClientRect();
			node.style.top = `${rect.bottom + 4}px`;
			const nodeWidth = node.offsetWidth || 288;
			let left = rect.left;
			if (left + nodeWidth > window.innerWidth) {
				left = Math.max(8, window.innerWidth - nodeWidth - 8);
			}
			node.style.left = `${left}px`;
		}

		requestAnimationFrame(reposition);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);

		return {
			destroy() {
				window.removeEventListener('scroll', reposition, true);
				window.removeEventListener('resize', reposition);
			}
		};
	}

	// Helpers for creating slot callbacks
	function makeSlotCallbacks(weekday: number, mealType: string, slotIdx: number, isAcc: number) {
		const key = slotKey(weekday, mealType, slotIdx, isAcc);
		const coord: SlotCoord = { weekday, mealType, slotIndex: slotIdx, isAcc };
		return {
			onSelectRecipe: (recipeId: number) => selectRecipe(weekday, mealType, slotIdx, isAcc, recipeId),
			onRemove: () => removeSlot(weekday, mealType, slotIdx, isAcc),
			onRandom: () => randomSlot(weekday, mealType as 'comida' | 'cena', slotIdx, isAcc),
			onOpenDropdown: () => openSlotDropdown(weekday, mealType, slotIdx, isAcc),
			onCloseDropdown: closeDropdown,
			onSearch: () => handleSearch(weekday, mealType, isAcc),
			onAddTag: (tag: string) => addRequiredTag(weekday, mealType, slotIdx, tag),
			onRemoveTag: (tag: string) => removeRequiredTag(weekday, mealType, slotIdx, tag),
			onSetEditingTag: (k: string | null) => { editingTagKey = k; },
			onDragStart: (e: DragEvent) => {
				const slot = getSlot(weekday, mealType, slotIdx, isAcc);
				if (!slot?.recipe) return;
				dragSource = coord;
				openDropdown = null;
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
				openDropdown === key ? closeDropdown() : openSlotDropdown(weekday, mealType, slotIdx, isAcc);
			},
			onTouchStart: () => {
				const slot = getSlot(weekday, mealType, slotIdx, isAcc);
				if (!isTouchDevice || !slot?.recipe) return;
				longPressTimer = setTimeout(() => {
					moveSource = coord;
					openDropdown = null;
					longPressTimer = null;
				}, 500);
			},
			onTouchEnd: () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } },
			onTouchMove: () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } },
		};
	}
</script>

<svelte:window
	on:click={(e) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.dropdown-container')) closeDropdown();
	}}
	on:keydown={(e) => { if (e.key === 'Escape') { moveSource = null; dragSource = null; } }}
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

	<!-- Grid semanal -->
	<div class="flex-1 overflow-auto p-3 sm:p-5">
		{#if !weekData}
			<div class="text-center py-16 text-sm" style="color: var(--text-muted);">Cargando...</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 lg:gap-x-3 lg:gap-y-0">
				{#each [1,2,3,4,5,6,7] as weekday, i}
					{@const date = weekDates[i]}
					{@const isWeekend = i >= 5}
					{@const isToday = date != null && date.getTime() === todayUTC.getTime()}
					{@const dayComidaCfg = weekData?.configs[weekday]?.comida}
					{@const dayCenaCfg = weekData?.configs[weekday]?.cena}
					{@const dayFullyDisabled = dayComidaCfg?.disabled && dayCenaCfg?.disabled}

					<div id="day-{weekday}" class="rounded-2xl overflow-hidden flex flex-col lg:contents"
						style="background: {isToday ? '#ffe8d4' : 'var(--surface-container-low)'};">

						<!-- Cabecera del día -->
						<div class="px-2 pt-4 pb-2 shrink-0 text-center"
							style="grid-column: {i+1}; grid-row: 1; background: {isToday ? 'var(--primary-light)' : 'var(--background)'}; {isToday ? 'border-top: 3px solid var(--primary);' : ''}">
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
								style="background: {isToday ? '#ffe8d4' : 'var(--surface-container-low)'}; grid-column: {i+1}; grid-row: 2 / 4;">
								<div class="px-2.5 py-3 flex-1 flex flex-col">
									<textarea
										placeholder="Motivo (ej. Vacaciones en París)..."
										on:change={(e) => setDayComment(weekday, (e.target as HTMLTextAreaElement).value)}
										class="flex-1 w-full text-xs px-2.5 py-2 rounded-xl italic focus:outline-none resize-none"
										style="background: var(--surface); border: 2px dashed var(--border); color: var(--text-muted);"
										aria-label="Motivo de desactivación del día"
									>{dayComidaCfg?.disabled_comment ?? ''}</textarea>
								</div>
							</div>
						{:else}
						{#each ['comida', 'cena'] as mealType, j}
							{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
							{@const isComida = mealType === 'comida'}

							<div class="flex-1 flex flex-col lg:flex-none {j === 1 ? 'mt-6 lg:mt-8' : ''}"
								style="background: {isToday ? '#ffe8d4' : (isComida ? 'var(--surface-container-low)' : 'var(--background)')}; grid-column: {i+1}; grid-row: {j+2};">

								<!-- Encabezado de franja -->
								<div class="flex items-center gap-1 px-2.5 py-2 border-b"
									style="border-color: var(--surface-container-highest);">
									<span class="flex-1 text-[10px] font-black uppercase tracking-tighter"
										style="color: {cfg.disabled ? 'var(--text-muted)' : 'var(--text-secondary)'}; {cfg.disabled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
										{isComida ? 'COMIDA' : 'CENA'}
									</span>
									{#if !cfg.disabled}
										<button
											on:click={() => updateConfig(weekday, mealType, 'recipe_count', Math.max(1, cfg.recipe_count - 1))}
											class="w-5 h-5 flex items-center justify-center rounded text-sm leading-none transition-opacity hover:opacity-60"
											style="color: var(--text-muted);"
										>&minus;</button>
										<span class="text-xs w-4 text-center tabular-nums"
											style="color: var(--text-muted);">{cfg.recipe_count}</span>
										<button
											on:click={() => updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1)}
											class="w-5 h-5 flex items-center justify-center rounded text-sm leading-none transition-opacity hover:opacity-60"
											style="color: var(--text-muted);"
										>+</button>
									{/if}
									<button
										on:click={() => toggleDisableMeal(weekday, mealType)}
										title={cfg.disabled ? 'Planificar' : 'No planificar'}
										aria-label={cfg.disabled ? `Planificar ${mealType}` : `No planificar ${mealType}`}
										class="w-5 h-5 flex items-center justify-center rounded transition-opacity hover:opacity-70"
										style="color: {cfg.disabled ? 'var(--error)' : 'var(--text-muted)'};"
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
									</button>
								</div>

								{#if cfg.disabled}
									<div class="px-2.5 pb-2.5 pt-2 flex-1 flex flex-col">
										<textarea
											placeholder="Motivo (ej. Cenamos fuera)..."
											on:change={(e) => setDisabledComment(weekday, mealType, (e.target as HTMLTextAreaElement).value)}
											class="flex-1 w-full text-xs px-2.5 py-2 rounded-xl italic focus:outline-none resize-none"
											style="background: var(--surface); border: 2px dashed var(--border); color: var(--text-muted);"
											aria-label="Motivo de desactivación de {mealType}"
										>{cfg.disabled_comment ?? ''}</textarea>
									</div>
								{:else}

								<!-- Slots -->
								<div class="px-2 pb-3 pt-2 space-y-2 flex-1">
									{#each Array(cfg.recipe_count) as _, slotIdx}
										{@const slot = getSlot(weekday, mealType, slotIdx, 0)}
										{@const key = slotKey(weekday, mealType, slotIdx, 0)}
										{@const slotTags = cfg.required_tags[slotIdx] ?? []}
										{@const slotTagEditKey = `tag-${weekday}-${mealType}-${slotIdx}`}
										{@const callbacks = makeSlotCallbacks(weekday, mealType, slotIdx, 0)}

										<RecipeSlot
											{weekday} {mealType} {slotIdx}
											{slot} slotKeyStr={key} {cfg} {allTags}
											{openDropdown} bind:searchQuery {searchResults} {topRecipes}
											isBusy={busySlots.has(key)}
											isDragSource={!!dragSource && key === slotKey(dragSource.weekday, dragSource.mealType, dragSource.slotIndex, dragSource.isAcc)}
											isDragOver={dragOver === key}
											isMoveMode={!!moveSource}
											{isTouchDevice}
											{editingTagKey} {slotTags} {slotTagEditKey}
											{focusOnMount} {fixedDropdown}
											{...callbacks}
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
													{openDropdown} bind:searchQuery {searchResults} {topRecipes}
													isDragSource={!!dragSource && accKey === slotKey(dragSource.weekday, dragSource.mealType, dragSource.slotIndex, dragSource.isAcc)}
													isDragOver={dragOver === accKey}
													isMoveMode={!!moveSource}
													{isTouchDevice}
													{editingTagKey}
													{focusOnMount} {fixedDropdown}
													{...accCallbacks}
												/>
											{/each}
										{/if}
									{/each}

									<!-- Acompañamientos por franja -->
									{#if cfg.accompaniment_per_slot > 0}
										<div class="pt-1.5 space-y-1.5"
											style="border-top: 1px solid var(--surface-container-highest);">
											{#each Array(cfg.accompaniment_per_slot) as _, aIdx}
												{@const accSlot = getSlot(weekday, mealType, aIdx, 1)}
												{@const accKey = slotKey(weekday, mealType, aIdx, 1) + '-slot'}
												<div class="dropdown-container relative">
													<button
														on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, aIdx, 1)}
														class="w-full text-left text-[10px] transition-colors px-2 py-1.5 rounded-lg"
														style="{accSlot?.recipe
															? `background: var(--secondary-container); color: var(--secondary);`
															: `background: transparent; border: 1px dashed var(--border); color: var(--text-muted);`}"
													>
														<span class="{accSlot?.recipe ? 'font-semibold' : 'italic'}">
															{accSlot?.recipe?.name ?? '+ acomp. franja'}
														</span>
													</button>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
							</div>
						{/each}
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if weekData}
			<ViolationBanner violations={weekData.violations ?? []} />
		{/if}
	</div>

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
	.select-none {
		-webkit-touch-callout: none;
	}
</style>
