<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { WeekData, Recipe, Rule, ScheduleWithRecipe } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, weekKeyToIndex, indexToWeekKey, WEEKDAY_NAMES, SHORT_MONTH_NAMES, MS_PER_DAY } from '$lib/utils/dates.js';
	import WeekHeader from '$lib/components/week/WeekHeader.svelte';
	import ViolationBanner from '$lib/components/week/ViolationBanner.svelte';
	import MealCell from '$lib/components/week/MealCell.svelte';
	import EditableNote from '$lib/components/week/EditableNote.svelte';
	import RecipePickerModal from '$lib/components/week/RecipePickerModal.svelte';
	import ScheduleModal from '$lib/components/week/ScheduleModal.svelte';
	import RemoveScheduledRecipeDialog from '$lib/components/week/RemoveScheduledRecipeDialog.svelte';
	import MoveCopyLeftoverModal from '$lib/components/week/MoveCopyLeftoverModal.svelte';
	import { sidebarOpen } from '$lib/stores/ui.js';
	import { WeekDragDrop, type SlotCoord } from '$lib/utils/weekDragDrop.svelte.js';

	let { data } = $props();

	let weekKey = $state(data.weekKey);
	let weekData = $state<WeekData | null>(data.weekData);
	let recipes = $state<Recipe[]>(data.recipes);
	let rules = $state<Rule[]>(data.rules);
	let allTags = $state<string[]>(data.allTags);
	let schedulesPerMeal = $state<Record<string, import('$lib/types/index.js').ScheduleWithRecipe[]>>(data.schedulesPerMeal);
	let calculating = $state(false);
	let busySlots = $state(new Set<string>());
	let editingTagKey = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let errorTimeout: ReturnType<typeof setTimeout>;
	let selectedDay = $state(1);

	$effect(() => {
		const now = new Date();
		const jsDay = now.getDay();
		selectedDay = jsDay === 0 ? 7 : jsDay;
	});

	let infoMsg = $state<string | null>(null);
	let infoTimeout: ReturnType<typeof setTimeout>;

	const ERROR_MSG_MS = 5000;
	const INFO_MSG_MS = 4000;

	function showError(msg: string) {
		errorMsg = msg;
		clearTimeout(errorTimeout);
		errorTimeout = setTimeout(() => { errorMsg = null; }, ERROR_MSG_MS);
	}

	function showInfo(msg: string) {
		infoMsg = msg;
		clearTimeout(infoTimeout);
		infoTimeout = setTimeout(() => { infoMsg = null; }, INFO_MSG_MS);
	}

	// POST a /api/week/config con manejo de errores; en fallo resincroniza con el servidor
	async function postConfig(body: Record<string, unknown>): Promise<boolean> {
		try {
			const res = await fetch('/api/week/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, ...body })
			});
			if (!res.ok) throw new Error();
			return true;
		} catch {
			showError('Error al guardar la configuración');
			await invalidateAll().catch(() => {});
			return false;
		}
	}

	// Sync when server data changes (e.g. navigating weeks via goto)
	$effect(() => {
		weekKey = data.weekKey;
		weekData = data.weekData;
		recipes = data.recipes;
		rules = data.rules;
		allTags = data.allTags;
		schedulesPerMeal = data.schedulesPerMeal;
	});

	// Recipe picker modal state
	type PickerSlot = { weekday: number; mealType: string; slotIndex: number; isAcc: number };
	let pickerOpen = $state(false);
	let pickerSlot = $state<PickerSlot | null>(null);

	// Schedule modal state
	type ScheduleSlot = { weekday: number; mealType: string; slotIndex: number; isAcc: number; recipe: Recipe; schedule: ScheduleWithRecipe | null };
	let scheduleModalOpen = $state(false);
	let scheduleModalSlot = $state<ScheduleSlot | null>(null);

	// Remove scheduled recipe dialog state
	type RemoveScheduleInfo = { scheduleId: number; recipeId: number | undefined; recipeName: string; everyNWeeks: number; weekday: number; mealType: string; slotIndex: number; isAcc: number };
	let removeScheduleDialogOpen = $state(false);
	let removeScheduleInfo = $state<RemoveScheduleInfo | null>(null);

	function openScheduleModal(weekday: number, mealType: string, slotIdx: number, isAcc: number) {
		const slot = getSlot(weekday, mealType, slotIdx, isAcc);
		if (!slot?.recipe) return;
		scheduleModalSlot = { weekday, mealType, slotIndex: slotIdx, isAcc, recipe: slot.recipe, schedule: slot.schedule ?? null };
		scheduleModalOpen = true;
	}

	// Drag & move state (HTML5 drag en $lib/utils/weekDragDrop.svelte.ts)
	const dnd = new WeekDragDrop((src, target, withModifier) => {
		if (withModifier) {
			moveCopySource = src;
			moveCopyTarget = target;
			moveCopyModalOpen = true;
		} else {
			moveRecipe(src, target);
		}
	});
	let moveSource = $state<SlotCoord | null>(null);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let dayLongPressTimer: ReturnType<typeof setTimeout> | null = null;
	let dayDisableConfirm = $state<number | null>(null);
	let isTouchDevice = false;

	// Move/copy/leftover modal
	let moveCopyModalOpen = $state(false);
	let moveCopySource = $state<SlotCoord | null>(null);
	let moveCopyTarget = $state<SlotCoord | null>(null);

	let weekDates = $derived(getWeekDates(weekKey));

	const now = new Date();
	const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window;
		return dnd.attachDocumentListeners();
	});

	function prevWeek() {
		const prev = getPreviousWeekKey(weekKey);
		goto(`/week?weekKey=${prev}`, { noScroll: true });
	}

	function nextWeek() {
		const next = indexToWeekKey(weekKeyToIndex(weekKey) + 1);
		goto(`/week?weekKey=${next}`, { noScroll: true });
	}

	function toToday() {
		const today = getWeekKey();
		const now = new Date();
		const jsDay = now.getDay();
		selectedDay = jsDay === 0 ? 7 : jsDay;
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

	function patchSlot(weekday: number, mealType: string, slotIndex: number, isAcc: number, recipe: Recipe | null, isLeftover: 0 | 1 = 0) {
		if (!weekData) return;
		const exists = weekData.slots.some(s =>
			s.weekday === weekday && s.meal_type === mealType &&
			s.slot_index === slotIndex && s.is_accompaniment === isAcc
		);
		let newSlots;
		if (recipe === null && exists) {
			// Eliminar el slot del array (en el nuevo modelo no hay filas con recipe_id = NULL)
			newSlots = weekData.slots.filter(s =>
				!(s.weekday === weekday && s.meal_type === mealType &&
				  s.slot_index === slotIndex && s.is_accompaniment === isAcc)
			);
		} else if (exists) {
			newSlots = weekData.slots.map(s =>
				s.weekday === weekday && s.meal_type === mealType &&
				s.slot_index === slotIndex && s.is_accompaniment === isAcc
					? { ...s, recipe, is_leftover: isLeftover }
					: s
			);
		} else if (recipe) {
			newSlots = [...weekData.slots, { weekday, meal_type: mealType as 'comida' | 'cena', slot_index: slotIndex, is_accompaniment: isAcc, is_leftover: isLeftover, recipe, member: null, schedule: null }];
		} else {
			return;
		}
		weekData = { ...weekData, slots: newSlots, violations: checkRules(newSlots, rules) };
	}

	async function selectRecipe(weekday: number, mealType: string, slotIndex: number, isAcc: number, recipeId: number, isLeftover = false) {
		const prevSlot = getSlot(weekday, mealType, slotIndex, isAcc);
		const prev = prevSlot?.recipe ?? null;
		const prevIsLeftover = prevSlot?.is_leftover ?? 0;
		patchSlot(weekday, mealType, slotIndex, isAcc, recipes.find(r => r.id === recipeId) ?? null, isLeftover ? 1 : 0);
		try {
			const res = await fetch('/api/week/assign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc, recipe_id: recipeId, member_id: null, is_leftover: isLeftover ? 1 : 0 })
			});
			if (!res.ok) throw new Error();
		} catch {
			patchSlot(weekday, mealType, slotIndex, isAcc, prev, prevIsLeftover as 0 | 1);
			showError('Error al asignar receta');
		}
	}

	async function removeSlot(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		const slot = getSlot(weekday, mealType, slotIndex, isAcc);
		const prev = slot?.recipe ?? null;
		try {
			const res = await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc, recipe_id: prev?.id })
			});
			if (!res.ok) throw new Error();
			const responseData = await res.json();
			if (responseData.had_schedule) {
				// Slot virtual (programación): preguntar si quitar solo esta semana o eliminar programación
				removeScheduleInfo = {
					scheduleId: responseData.schedule_id,
					recipeId: prev?.id,
					recipeName: prev?.name ?? '',
					everyNWeeks: responseData.every_n_weeks,
					weekday, mealType, slotIndex, isAcc
				};
				removeScheduleDialogOpen = true;
				return;
			}
			if (responseData.schedule_resumed) {
				// La receta manual fue borrada; una programación ha tomado el control
				showInfo('La programación ha retomado el control de este slot.');
				await invalidateAll();
				return;
			}
			patchSlot(weekday, mealType, slotIndex, isAcc, null);
		} catch {
			showError('Error al quitar receta');
		}
	}

	async function handleRemoveOnlyThisWeek() {
		if (!removeScheduleInfo) return;
		const { scheduleId, weekday, mealType, slotIndex, isAcc } = removeScheduleInfo;
		removeScheduleDialogOpen = false;
		try {
			await fetch(`/api/schedules/${scheduleId}/exceptions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ week_key: weekKey })
			});
			// Para slots virtuales no hay fila en week_plans que borrar; solo recargamos.
			// Para slots con sobreescritura manual, también limpiamos la fila.
			await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc, force: 'only_week' })
			});
			patchSlot(weekday, mealType, slotIndex, isAcc, null);
		} catch {
			showError('Error al quitar receta');
		}
		removeScheduleInfo = null;
	}

	async function handleRemoveFullSchedule() {
		if (!removeScheduleInfo) return;
		const { weekday, mealType, slotIndex, isAcc, recipeId } = removeScheduleInfo;
		removeScheduleDialogOpen = false;
		try {
			await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc, recipe_id: recipeId, force: 'full_schedule' })
			});
			await invalidateAll();
		} catch {
			showError('Error al quitar receta');
		}
		removeScheduleInfo = null;
	}

	async function moveRecipe(from: SlotCoord, to: SlotCoord) {
		if (slotKey(from.weekday, from.mealType, from.slotIndex, from.isAcc) ===
			slotKey(to.weekday, to.mealType, to.slotIndex, to.isAcc)) return;
		const fromSlot = getSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc);
		const toSlot   = getSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc);
		const fromRecipe = fromSlot?.recipe ?? null;
		const toRecipe   = toSlot?.recipe ?? null;
		const fromIsLeftover = fromSlot?.is_leftover ?? 0;
		const toIsLeftover   = toSlot?.is_leftover ?? 0;
		if (!fromRecipe) return;
		patchSlot(to.weekday,   to.mealType,   to.slotIndex,   to.isAcc,   fromRecipe, 0);
		patchSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc, toRecipe,   0);
		const doAssign = (coord: SlotCoord, recipe: Recipe | null) => {
			if (recipe) {
				return fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, weekday: coord.weekday, meal_type: coord.mealType,
						slot_index: coord.slotIndex, is_accompaniment: coord.isAcc, recipe_id: recipe.id, member_id: null, is_leftover: 0 }) });
			} else {
				return fetch('/api/week/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, weekday: coord.weekday, meal_type: coord.mealType,
						slot_index: coord.slotIndex, is_accompaniment: coord.isAcc, force: 'move' }) });
			}
		};
		try {
			const results = await Promise.all([doAssign(to, fromRecipe), doAssign(from, toRecipe)]);
			if (results.some(r => !r.ok)) throw new Error();
		} catch {
			patchSlot(to.weekday,   to.mealType,   to.slotIndex,   to.isAcc,   toRecipe,   toIsLeftover as 0 | 1);
			patchSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc, fromRecipe, fromIsLeftover as 0 | 1);
			showError('Error al mover receta');
		}
	}

	async function copySlot(from: SlotCoord, to: SlotCoord) {
		const fromRecipe = getSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc)?.recipe ?? null;
		if (!fromRecipe) return;
		const prevSlot = getSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc);
		const prevRecipe = prevSlot?.recipe ?? null;
		const prevIsLeftover = prevSlot?.is_leftover ?? 0;
		patchSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc, fromRecipe, 0);
		try {
			const res = await fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday: to.weekday, meal_type: to.mealType, slot_index: to.slotIndex, is_accompaniment: to.isAcc, recipe_id: fromRecipe.id, member_id: null, is_leftover: 0 }) });
			if (!res.ok) throw new Error();
		} catch {
			patchSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc, prevRecipe, prevIsLeftover as 0 | 1);
			showError('Error al copiar receta');
		}
	}

	async function markAsLeftover(from: SlotCoord, to: SlotCoord) {
		const fromRecipe = getSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc)?.recipe ?? null;
		if (!fromRecipe) return;
		const prevSlot = getSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc);
		const prevRecipe = prevSlot?.recipe ?? null;
		const prevIsLeftover = prevSlot?.is_leftover ?? 0;
		patchSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc, fromRecipe, 1);
		try {
			const res = await fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, weekday: to.weekday, meal_type: to.mealType, slot_index: to.slotIndex, is_accompaniment: to.isAcc, recipe_id: fromRecipe.id, member_id: null, is_leftover: 1 }) });
			if (!res.ok) throw new Error();
		} catch {
			patchSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc, prevRecipe, prevIsLeftover as 0 | 1);
			showError('Error al marcar como restos');
		}
	}

	function isWithinLeftoverWindow(source: SlotCoord, target: SlotCoord): boolean {
		const dates = weekDates;
		const sourceDate = dates[source.weekday - 1];
		const targetDate = dates[target.weekday - 1];
		if (!sourceDate || !targetDate) return false;
		const diffDays = Math.round((targetDate.getTime() - sourceDate.getTime()) / MS_PER_DAY);
		return diffDays > 0 && diffDays <= 5;
	}

	function handleMoveCopyAction(action: 'move' | 'copy' | 'leftover') {
		moveCopyModalOpen = false;
		const src = moveCopySource;
		const tgt = moveCopyTarget;
		moveCopySource = null;
		moveCopyTarget = null;
		if (!src || !tgt) return;
		if (action === 'move') moveRecipe(src, tgt);
		else if (action === 'copy') copySlot(src, tgt);
		else markAsLeftover(src, tgt);
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
		if (await postConfig({ weekday, meal_type: mealType, [field]: value })) await invalidateAll();
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
			await postConfig({ weekday, meal_type: mealType, recipe_count: 0, disabled: true, disabled_comment: comment });
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
			await postConfig({ weekday, meal_type: mealType, recipe_count: 1, disabled: false, disabled_comment: null });
		} else {
			await updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1);
		}
	}

	async function setDisabledComment(weekday: number, mealType: string, comment: string) {
		await postConfig({ weekday, meal_type: mealType, disabled: true, disabled_comment: comment });
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
			postConfig({ weekday, meal_type: 'comida', disabled: nowDisabled, disabled_comment: sharedComment }),
			postConfig({ weekday, meal_type: 'cena', disabled: nowDisabled, disabled_comment: sharedComment })
		]);
	}

	async function setMealNote(weekday: number, mealType: string, note: string) {
		await postConfig({ weekday, meal_type: mealType, note: note || null });
	}

	async function setDayComment(weekday: number, comment: string) {
		await Promise.all([
			postConfig({ weekday, meal_type: 'comida', disabled: true, disabled_comment: comment }),
			postConfig({ weekday, meal_type: 'cena', disabled: true, disabled_comment: comment })
		]);
	}

	function getSlotTags(weekday: number, mealType: string, slotIdx: number): string[] {
		return weekData?.configs[weekday]?.[mealType as 'comida' | 'cena']?.required_tags[slotIdx] ?? [];
	}

	async function setSlotTags(weekday: number, mealType: string, slotIdx: number, tags: string[]) {
		if (await postConfig({ weekday, meal_type: mealType, slot_index: slotIdx, required_tags: tags })) await invalidateAll();
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
			...dnd.handlersFor(coord, key, () => !!getSlot(weekday, mealType, slotIdx, isAcc)?.recipe),
			onMoveClick: () => {
				if (moveSource) {
					moveCopySource = moveSource;
					moveCopyTarget = coord;
					moveCopyModalOpen = true;
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
			onSchedule: () => openScheduleModal(weekday, mealType, slotIdx, isAcc),
		};
	}
</script>

<svelte:window
	on:keydown={(e) => { if (e.key === 'Escape') { moveSource = null; dnd.reset(); dayDisableConfirm = null; } }}
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

	{#if infoMsg}
		<div class="px-4 sm:px-6 py-2 text-sm font-medium flex items-center justify-between"
			style="background: var(--primary-light); color: var(--primary);">
			<span>{infoMsg}</span>
			<button on:click={() => infoMsg = null} class="ml-2 font-bold hover:opacity-70">&times;</button>
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
											<EditableNote
												value={dayComidaCfg?.disabled_comment}
												placeholder="Motivo (ej. Vacaciones en París)..."
												ariaLabel="Motivo de desactivación del día"
												onSave={(t) => setDayComment(weekday, t)}
											/>
										{/key}
									</div>
								</div>
							</div>
						{:else}
						{#each ['comida', 'cena'] as mealTypeStr}
							{@const meal = mealTypeStr as 'comida' | 'cena'}
							<MealCell
								{weekday}
								mealType={meal}
								col={i + 2}
								{isToday}
								{weekKey}
								cfg={getDayConfig(weekday, meal)}
								{allTags}
								{editingTagKey}
								{busySlots}
								{isTouchDevice}
								isMoveMode={!!moveSource}
								{dnd}
								slotSchedules={schedulesPerMeal[`${weekday}-${meal}-0`] ?? []}
								{getSlot}
								{slotKey}
								{makeSlotCallbacks}
								onIncrementMealCount={() => incrementMealCount(weekday, meal)}
								onDecrementMealCount={() => decrementMealCount(weekday, meal)}
								onUpdateConfig={(field, value) => updateConfig(weekday, meal, field, value)}
								onSetDisabledComment={(t) => setDisabledComment(weekday, meal, t)}
								onSetMealNote={(t) => setMealNote(weekday, meal, t)}
								onOpenPicker={(slotIdx, isAcc) => openRecipePicker(weekday, meal, slotIdx, isAcc)}
								onRemoveSlot={(slotIdx, isAcc) => removeSlot(weekday, meal, slotIdx, isAcc)}
							/>
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
			onSelect={(id, isLeftover) => {
				pickerOpen = false;
				selectRecipe(pickerSlot!.weekday, pickerSlot!.mealType, pickerSlot!.slotIndex, pickerSlot!.isAcc, id, isLeftover);
			}}
			onClose={() => { pickerOpen = false; }}
		/>
	{/if}

	{#if scheduleModalSlot}
		<ScheduleModal
			open={scheduleModalOpen}
			{weekKey}
			weekday={scheduleModalSlot.weekday}
			mealType={scheduleModalSlot.mealType}
			slotIndex={scheduleModalSlot.slotIndex}
			isAccompaniment={scheduleModalSlot.isAcc}
			recipe={scheduleModalSlot.recipe}
			schedule={scheduleModalSlot.schedule}
			onSaved={async () => { scheduleModalOpen = false; scheduleModalSlot = null; await invalidateAll(); }}
			onDeleted={async () => { scheduleModalOpen = false; scheduleModalSlot = null; await invalidateAll(); }}
			onClose={() => { scheduleModalOpen = false; scheduleModalSlot = null; }}
		/>
	{/if}

	{#if removeScheduleInfo}
		<RemoveScheduledRecipeDialog
			open={removeScheduleDialogOpen}
			recipeName={removeScheduleInfo.recipeName}
			everyNWeeks={removeScheduleInfo.everyNWeeks}
			onOnlyThisWeek={handleRemoveOnlyThisWeek}
			onFullSchedule={handleRemoveFullSchedule}
			onCancel={() => { removeScheduleDialogOpen = false; removeScheduleInfo = null; }}
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

	{#if moveCopySource && moveCopyTarget}
		<MoveCopyLeftoverModal
			open={moveCopyModalOpen}
			sourceName={getSlot(moveCopySource.weekday, moveCopySource.mealType, moveCopySource.slotIndex, moveCopySource.isAcc)?.recipe?.name ?? ''}
			canLeftover={isWithinLeftoverWindow(moveCopySource, moveCopyTarget)}
			onConfirm={handleMoveCopyAction}
			onClose={() => { moveCopyModalOpen = false; moveCopySource = null; moveCopyTarget = null; }}
		/>
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
</style>
