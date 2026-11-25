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
	import ConsolidatedScheduleDialog from '$lib/components/week/ConsolidatedScheduleDialog.svelte';
	import MoveCopyLeftoverModal from '$lib/components/week/MoveCopyLeftoverModal.svelte';
	import RecipeEditModal from '$lib/components/RecipeEditModal.svelte';
	import SlotPeopleDialog from '$lib/components/week/SlotPeopleDialog.svelte';
	import PersonFilter from '$lib/components/people/PersonFilter.svelte';
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

	// Personas activas (vienen con la semana) y vista por persona (null = todos)
	let people = $derived(weekData?.people ?? []);
	let viewPerson = $state<number | null>(null);
	$effect(() => {
		// Si la persona vista se archiva o se borra, volver a la vista general
		if (viewPerson !== null && !people.some(p => p.id === viewPerson)) viewPerson = null;
	});
	let visibleViolations = $derived((weekData?.violations ?? []).filter(v =>
		viewPerson === null || v.people.length === 0 || v.people.includes(viewPerson)
	));

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
	type PickerSlot = { weekday: number; mealType: string; slotId: number; isAcc: number };
	let pickerOpen = $state(false);
	let pickerSlot = $state<PickerSlot | null>(null);

	// Schedule modal state
	type ScheduleSlot = { weekday: number; mealType: string; slotId: number; isAcc: number; recipe: Recipe; schedule: ScheduleWithRecipe | null };
	let scheduleModalOpen = $state(false);
	let scheduleModalSlot = $state<ScheduleSlot | null>(null);

	// Remove scheduled recipe dialog state
	type RemoveScheduleInfo = { scheduleId: number; recipeId: number | undefined; recipeName: string; everyNWeeks: number; rotationSize: number; nextInRotation: string[]; weekday: number; mealType: string; slotId: number; isAcc: number };
	let removeScheduleDialogOpen = $state(false);
	let removeScheduleInfo = $state<RemoveScheduleInfo | null>(null);

	// Recipe edit modal state
	let recipeEditOpen = $state(false);
	let recipeEditRecipe = $state<Recipe | null>(null);

	async function openRecipeEditModal(weekday: number, mealType: string, slotId: number, isAcc: number) {
		const slot = getSlot(weekday, mealType, slotId, isAcc);
		if (!slot?.recipe) return;
		// Fetch full recipe (slot may not have all fields like description/image_type)
		const res = await fetch(`/api/recipes/${slot.recipe.id}`);
		recipeEditRecipe = await res.json();
		recipeEditOpen = true;
	}

	function openScheduleModal(weekday: number, mealType: string, slotId: number, isAcc: number) {
		const slot = getSlot(weekday, mealType, slotId, isAcc);
		if (!slot?.recipe) return;
		scheduleModalSlot = { weekday, mealType, slotId: slotId, isAcc, recipe: slot.recipe, schedule: slot.schedule ?? null };
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

	// Swipe horizontal para cambiar de día en móvil
	let swipeTouchStartX = 0;
	let swipeTouchStartY = 0;
	let slideAnim = $state(true);
	let dayTrackWidth = $state(0);
	let dayOffsetPx = $derived(-(selectedDay - 1) * dayTrackWidth);

	function navNoAnim(navigate: () => void) {
		slideAnim = false;
		navigate();
		requestAnimationFrame(() => requestAnimationFrame(() => { slideAnim = true; }));
	}

	function onContentTouchStart(e: TouchEvent) {
		swipeTouchStartX = e.touches[0].clientX;
		swipeTouchStartY = e.touches[0].clientY;
	}

	function onContentTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - swipeTouchStartX;
		const dy = e.changedTouches[0].clientY - swipeTouchStartY;
		if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
		if (dx < 0) {
			// swipe izquierda → día siguiente
			if (selectedDay < 7) {
				selectedDay++;
			} else {
				nextWeek();
				selectedDay = 1;
			}
		} else {
			// swipe derecha → día anterior
			if (selectedDay > 1) {
				selectedDay--;
			} else {
				prevWeek();
				selectedDay = 7;
			}
		}
	}

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
		navNoAnim(() => {
			const prev = getPreviousWeekKey(weekKey);
			goto(`/week?weekKey=${prev}`, { noScroll: true });
		});
	}

	function nextWeek() {
		navNoAnim(() => {
			const next = indexToWeekKey(weekKeyToIndex(weekKey) + 1);
			goto(`/week?weekKey=${next}`, { noScroll: true });
		});
	}

	function toToday() {
		navNoAnim(() => {
			const today = getWeekKey();
			const now = new Date();
			const jsDay = now.getDay();
			selectedDay = jsDay === 0 ? 7 : jsDay;
			goto(`/week?weekKey=${today}`, { noScroll: true });
		});
	}

	function getSlot(weekday: number, mealType: string, slotId: number, isAccompaniment: number) {
		return weekData?.slots.find(s =>
			s.weekday === weekday && s.meal_type === mealType &&
			s.slot_id === slotId && s.is_accompaniment === isAccompaniment
		);
	}

	function getDayConfig(weekday: number, mealType: 'comida' | 'cena') {
		return weekData?.configs[weekday]?.[mealType] ?? { slots: [], disabled: false, disabled_comment: null, note: null };
	}

	function slotKey(weekday: number, mealType: string, slotId: number, isAcc: number) {
		return `${weekday}-${mealType}-${slotId}-${isAcc}`;
	}

	function openRecipePicker(weekday: number, mealType: string, slotId: number, isAcc: number) {
		pickerSlot = { weekday, mealType, slotId, isAcc };
		pickerOpen = true;
	}

	// `slotPeople` omitido = conservar las personas que ya tuviera el hueco
	function patchSlot(weekday: number, mealType: string, slotId: number, isAcc: number, recipe: Recipe | null, isLeftover: 0 | 1 = 0, slotPeople?: number[]) {
		if (!weekData) return;
		const exists = weekData.slots.some(s =>
			s.weekday === weekday && s.meal_type === mealType &&
			s.slot_id === slotId && s.is_accompaniment === isAcc
		);
		let newSlots;
		if (recipe === null && exists) {
			// Eliminar el slot del array (en el nuevo modelo no hay filas con recipe_id = NULL)
			newSlots = weekData.slots.filter(s =>
				!(s.weekday === weekday && s.meal_type === mealType &&
				  s.slot_id === slotId && s.is_accompaniment === isAcc)
			);
		} else if (exists) {
			newSlots = weekData.slots.map(s =>
				s.weekday === weekday && s.meal_type === mealType &&
				s.slot_id === slotId && s.is_accompaniment === isAcc
					? { ...s, recipe, is_leftover: isLeftover, people: slotPeople ?? s.people }
					: s
			);
		} else if (recipe) {
			newSlots = [...weekData.slots, { weekday, meal_type: mealType as 'comida' | 'cena', slot_id: slotId, is_accompaniment: isAcc, is_leftover: isLeftover, recipe, schedule: null, people: slotPeople ?? [], origin_schedule_id: null }];
		} else {
			return;
		}
		weekData = { ...weekData, slots: newSlots, violations: checkRules(newSlots, rules, weekData.people) };
	}

	/** Tras escribir en un hueco virtual, el servidor lo materializa con otro id: recargar. */
	async function syncIfMaterialized(slotId: number, res: Response) {
		if (slotId >= 0) return;
		const body = await res.clone().json().catch(() => null);
		if (body?.slot_id !== undefined && body.slot_id !== slotId) await invalidateAll();
	}

	// Receta consolidada (día pasado) que venía de una programación: al quitarla o cambiarla,
	// se ofrece retrasar la rotación para no perder lo que tocaba
	type ConsolidatedInfo = { mode: 'remove' | 'changed'; recipeName: string; slotId: number; weekday: number; mealType: string; isAcc: number };
	let consolidatedInfo = $state<ConsolidatedInfo | null>(null);

	async function delayRotation(slotId: number) {
		const res = await fetch('/api/week/delay-rotation', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, slot_id: slotId })
		});
		if (!res.ok) throw new Error();
	}

	async function handleConsolidated(delay: boolean) {
		const info = consolidatedInfo;
		consolidatedInfo = null;
		if (!info) return;
		try {
			if (info.mode === 'remove') {
				const res = await fetch('/api/week/remove', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, slot_id: info.slotId, force: 'only_week' })
				});
				if (!res.ok) throw new Error();
				patchSlot(info.weekday, info.mealType, info.slotId, info.isAcc, null);
			}
			if (delay) {
				await delayRotation(info.slotId);
				await invalidateAll();
				showInfo(`«${info.recipeName}» pasa a la semana siguiente; el resto de la rotación se retrasa una semana.`);
			}
		} catch {
			showError(delay ? 'Error al retrasar la programación' : 'Error al quitar receta');
		}
	}

	async function selectRecipe(weekday: number, mealType: string, slotId: number, isAcc: number, recipeId: number, isLeftover = false, slotPeople?: number[]) {
		const prevSlot = getSlot(weekday, mealType, slotId, isAcc);
		const prev = prevSlot?.recipe ?? null;
		const prevIsLeftover = prevSlot?.is_leftover ?? 0;
		const prevPeople = prevSlot?.people ?? [];
		const prevOrigin = prevSlot?.origin_schedule_id ?? null;
		patchSlot(weekday, mealType, slotId, isAcc, recipes.find(r => r.id === recipeId) ?? null, isLeftover ? 1 : 0, slotPeople);
		try {
			const res = await fetch('/api/week/assign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: slotId, recipe_id: recipeId, is_leftover: isLeftover ? 1 : 0, people: slotPeople })
			});
			if (!res.ok) throw new Error();
			await syncIfMaterialized(slotId, res);
			// Día consolidado en el que no se comió lo programado: ofrecer retrasar la rotación
			if (prevOrigin !== null && prev && prev.id !== recipeId) {
				consolidatedInfo = { mode: 'changed', recipeName: prev.name, slotId, weekday, mealType, isAcc };
			}
		} catch {
			patchSlot(weekday, mealType, slotId, isAcc, prev, prevIsLeftover as 0 | 1, prevPeople);
			showError('Error al asignar receta');
		}
	}

	async function removeSlot(weekday: number, mealType: string, slotId: number, isAcc: number) {
		const slot = getSlot(weekday, mealType, slotId, isAcc);
		const prev = slot?.recipe ?? null;
		try {
			const res = await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: slotId, recipe_id: prev?.id })
			});
			if (!res.ok) throw new Error();
			const responseData = await res.json();
			if (responseData.consolidated_schedule_id) {
				consolidatedInfo = { mode: 'remove', recipeName: prev?.name ?? '', slotId, weekday, mealType, isAcc };
				return;
			}
			if (responseData.had_schedule) {
				// Slot virtual (programación): preguntar si quitar solo esta semana o eliminar programación
				removeScheduleInfo = {
					scheduleId: responseData.schedule_id,
					recipeId: prev?.id,
					recipeName: prev?.name ?? '',
					everyNWeeks: responseData.every_n_weeks,
					rotationSize: responseData.rotation_size ?? 0,
					nextInRotation: responseData.next_in_rotation ?? [],
					weekday, mealType, slotId, isAcc
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
			patchSlot(weekday, mealType, slotId, isAcc, null);
		} catch {
			showError('Error al quitar receta');
		}
	}

	async function handleRemoveOnlyThisWeek() {
		if (!removeScheduleInfo) return;
		const { scheduleId, weekday, mealType, slotId, isAcc } = removeScheduleInfo;
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
				body: JSON.stringify({ weekKey, slot_id: slotId, force: 'only_week' })
			});
			patchSlot(weekday, mealType, slotId, isAcc, null);
		} catch {
			showError('Error al quitar receta');
		}
		removeScheduleInfo = null;
	}

	async function handleRemoveFullSchedule() {
		if (!removeScheduleInfo) return;
		const { weekday, mealType, slotId, isAcc, recipeId } = removeScheduleInfo;
		removeScheduleDialogOpen = false;
		try {
			await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: slotId, recipe_id: recipeId, force: 'full_schedule' })
			});
			await invalidateAll();
		} catch {
			showError('Error al quitar receta');
		}
		removeScheduleInfo = null;
	}

	async function handleShiftRotation() {
		if (!removeScheduleInfo) return;
		const { weekday, mealType, slotId, isAcc } = removeScheduleInfo;
		removeScheduleDialogOpen = false;
		try {
			const res = await fetch('/api/week/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: slotId, force: 'shift_rotation' })
			});
			if (!res.ok) throw new Error();
			await invalidateAll();
		} catch {
			showError('Error al adelantar la rotación');
		}
		removeScheduleInfo = null;
	}

	async function moveRecipe(from: SlotCoord, to: SlotCoord) {
		if (slotKey(from.weekday, from.mealType, from.slotId, from.isAcc) ===
			slotKey(to.weekday, to.mealType, to.slotId, to.isAcc)) return;
		const fromSlot = getSlot(from.weekday, from.mealType, from.slotId, from.isAcc);
		const toSlot   = getSlot(to.weekday, to.mealType, to.slotId, to.isAcc);
		const fromRecipe = fromSlot?.recipe ?? null;
		const toRecipe   = toSlot?.recipe ?? null;
		const fromIsLeftover = fromSlot?.is_leftover ?? 0;
		const toIsLeftover   = toSlot?.is_leftover ?? 0;
		// Las personas viajan con la receta
		const fromPeople = fromSlot?.people ?? [];
		const toPeople   = toSlot?.people ?? [];
		if (!fromRecipe) return;
		patchSlot(to.weekday,   to.mealType,   to.slotId,   to.isAcc,   fromRecipe, 0, fromPeople);
		patchSlot(from.weekday, from.mealType, from.slotId, from.isAcc, toRecipe,   0, toPeople);
		const doAssign = (coord: SlotCoord, recipe: Recipe | null, slotPeople: number[]) => {
			if (recipe) {
				return fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, slot_id: coord.slotId, recipe_id: recipe.id, is_leftover: 0, people: slotPeople }) });
			} else {
				return fetch('/api/week/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, slot_id: coord.slotId, force: 'move' }) });
			}
		};
		try {
			const results = await Promise.all([doAssign(to, fromRecipe, fromPeople), doAssign(from, toRecipe, toPeople)]);
			if (results.some(r => !r.ok)) throw new Error();
			if (from.slotId < 0 || to.slotId < 0) await invalidateAll();
		} catch {
			patchSlot(to.weekday,   to.mealType,   to.slotId,   to.isAcc,   toRecipe,   toIsLeftover as 0 | 1, toPeople);
			patchSlot(from.weekday, from.mealType, from.slotId, from.isAcc, fromRecipe, fromIsLeftover as 0 | 1, fromPeople);
			showError('Error al mover receta');
		}
	}

	async function copySlot(from: SlotCoord, to: SlotCoord) {
		const fromSlot = getSlot(from.weekday, from.mealType, from.slotId, from.isAcc);
		const fromRecipe = fromSlot?.recipe ?? null;
		if (!fromRecipe) return;
		const fromPeople = fromSlot?.people ?? [];
		const prevSlot = getSlot(to.weekday, to.mealType, to.slotId, to.isAcc);
		const prevRecipe = prevSlot?.recipe ?? null;
		const prevIsLeftover = prevSlot?.is_leftover ?? 0;
		const prevPeople = prevSlot?.people ?? [];
		patchSlot(to.weekday, to.mealType, to.slotId, to.isAcc, fromRecipe, 0, fromPeople);
		try {
			const res = await fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: to.slotId, recipe_id: fromRecipe.id, is_leftover: 0, people: fromPeople }) });
			if (!res.ok) throw new Error();
			await syncIfMaterialized(to.slotId, res);
		} catch {
			patchSlot(to.weekday, to.mealType, to.slotId, to.isAcc, prevRecipe, prevIsLeftover as 0 | 1, prevPeople);
			showError('Error al copiar receta');
		}
	}

	async function markAsLeftover(from: SlotCoord, to: SlotCoord) {
		const fromSlot = getSlot(from.weekday, from.mealType, from.slotId, from.isAcc);
		const fromRecipe = fromSlot?.recipe ?? null;
		if (!fromRecipe) return;
		const fromPeople = fromSlot?.people ?? [];
		const prevSlot = getSlot(to.weekday, to.mealType, to.slotId, to.isAcc);
		const prevRecipe = prevSlot?.recipe ?? null;
		const prevIsLeftover = prevSlot?.is_leftover ?? 0;
		const prevPeople = prevSlot?.people ?? [];
		patchSlot(to.weekday, to.mealType, to.slotId, to.isAcc, fromRecipe, 1, fromPeople);
		try {
			const res = await fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: to.slotId, recipe_id: fromRecipe.id, is_leftover: 1, people: fromPeople }) });
			if (!res.ok) throw new Error();
			await syncIfMaterialized(to.slotId, res);
		} catch {
			patchSlot(to.weekday, to.mealType, to.slotId, to.isAcc, prevRecipe, prevIsLeftover as 0 | 1, prevPeople);
			showError('Error al marcar como restos');
		}
	}

	function isWithinLeftoverWindow(source: SlotCoord, target: SlotCoord): boolean {
		const dates = weekDates;
		const sourceDate = dates[source.weekday - 1];
		const targetDate = dates[target.weekday - 1];
		if (!sourceDate || !targetDate) return false;
		const diffDays = Math.round((targetDate.getTime() - sourceDate.getTime()) / MS_PER_DAY);
		return diffDays > 0 && diffDays <= 6;
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

	async function randomSlot(weekday: number, mealType: 'comida' | 'cena', slotId: number, isAcc: number) {
		const key = slotKey(weekday, mealType, slotId, isAcc);
		if (busySlots.has(key)) return;
		busySlots = new Set([...busySlots, key]);
		try {
			const res = await fetch('/api/week/calculate-slot', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: slotId })
			});
			if (res.ok) {
				const { recipe, slot_id } = await res.json();
				if (slot_id !== slotId) await invalidateAll();
				else patchSlot(weekday, mealType, slotId, isAcc, recipe);
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

	async function clearPlan(scope: 'week' | 'future' = 'week') {
		const msg = scope === 'future'
			? 'Esto eliminará todas las recetas añadidas manualmente desde esta semana en adelante. Las programaciones se mantienen. ¿Continuar?'
			: '¿Limpiar todo el plan de esta semana?';
		if (!confirm(msg)) return;
		try {
			const res = await fetch('/api/week/clear', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, scope })
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

	// --- Huecos de la comida ---

	async function postSlots(path: string, body: Record<string, unknown>): Promise<boolean> {
		try {
			const res = await fetch(`/api/week/slots${path}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, ...body })
			});
			if (!res.ok) throw new Error();
			return true;
		} catch {
			showError('Error al guardar los huecos');
			return false;
		}
	}

	/** Añade un hueco (rige desde esta semana). Si la comida estaba desactivada, la reactiva. */
	async function addMealSlot(weekday: number, mealType: string, kind: 'main' | 'acc', parentId: number | null) {
		const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena');
		if (cfg.disabled) {
			if (!(await postConfig({ weekday, meal_type: mealType, disabled: false, disabled_comment: null }))) return;
			// Reactivar una comida que aún tiene platos no añade otro
			if (kind === 'main' && cfg.slots.some(s => s.kind === 'main')) { await invalidateAll(); return; }
		}
		await postSlots('', { weekday, meal_type: mealType, kind, parent_id: parentId });
		await invalidateAll();
	}

	/** Quita un hueco concreto desde esta semana. Quitar el último plato desactiva la comida esta semana. */
	async function removeMealSlot(weekday: number, mealType: string, slotId: number) {
		const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena');
		const target = cfg.slots.find(s => s.id === slotId);
		const lastMain = target?.kind === 'main' && cfg.slots.filter(s => s.kind === 'main' && !s.virtual).length === 1;
		if (!(await postSlots('/remove', { slot_id: slotId }))) return;
		if (lastMain) await postConfig({ weekday, meal_type: mealType, disabled: true, disabled_comment: cfg.disabled_comment ?? '' });
		await invalidateAll();
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

	function getSlotTags(weekday: number, mealType: string, slotId: number): string[] {
		return getDayConfig(weekday, mealType as 'comida' | 'cena').slots.find(s => s.id === slotId)?.tags ?? [];
	}

	async function setSlotTags(slotId: number, tags: string[]) {
		if (await postSlots('/tags', { slot_id: slotId, tags })) await invalidateAll();
	}

	async function addRequiredTag(weekday: number, mealType: string, slotId: number, tag: string) {
		const value = tag.trim().toLowerCase();
		editingTagKey = null;
		if (!value) return;
		const current = getSlotTags(weekday, mealType, slotId);
		if (current.includes(value)) return;
		await setSlotTags(slotId, [...current, value]);
	}

	async function removeRequiredTag(weekday: number, mealType: string, slotId: number, tag: string) {
		const current = getSlotTags(weekday, mealType, slotId);
		await setSlotTags(slotId, current.filter(t => t !== tag));
	}

	// --- Personas por hueco ---

	/** Plato del que cuelga un acompañamiento (null si es de toda la comida). */
	function parentMainId(weekday: number, mealType: string, accId: number): number | null {
		return getDayConfig(weekday, mealType as 'comida' | 'cena').slots.find(s => s.id === accId)?.parent_id ?? null;
	}

	/** Para quién es la receta: la suya o, si es un acompañamiento sin personas, las de su plato. */
	function slotPeopleInfo(weekday: number, mealType: string, slotId: number, isAcc: number): { ids: number[]; inherited: boolean } {
		const own = getSlot(weekday, mealType, slotId, isAcc)?.people ?? [];
		if (own.length > 0 || !isAcc) return { ids: own, inherited: false };
		const parent = parentMainId(weekday, mealType, slotId);
		if (parent === null) return { ids: [], inherited: false };
		const parentSlot = getSlot(weekday, mealType, parent, 0);
		return { ids: parentSlot?.recipe ? parentSlot.people : [], inherited: true };
	}

	function isSlotHidden(weekday: number, mealType: string, slotId: number, isAcc: number): boolean {
		if (viewPerson === null || !getSlot(weekday, mealType, slotId, isAcc)?.recipe) return false;
		const { ids } = slotPeopleInfo(weekday, mealType, slotId, isAcc);
		return ids.length > 0 && !ids.includes(viewPerson);
	}

	type PeopleSlot = { weekday: number; mealType: string; slotId: number; isAcc: number };
	let peopleSlot = $state<PeopleSlot | null>(null);

	async function setSlotPeople(weekday: number, mealType: string, slotId: number, isAcc: number, ids: number[]) {
		const slot = getSlot(weekday, mealType, slotId, isAcc);
		if (!slot?.recipe) return;
		const prevPeople = slot.people;
		patchSlot(weekday, mealType, slotId, isAcc, slot.recipe, slot.is_leftover, ids);
		try {
			const res = await fetch('/api/week/people', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey, slot_id: slotId, recipe_id: slot.recipe.id, people: ids })
			});
			if (!res.ok) throw new Error();
			await syncIfMaterialized(slotId, res);
		} catch {
			patchSlot(weekday, mealType, slotId, isAcc, slot.recipe, slot.is_leftover, prevPeople);
			showError('Error al guardar para quién es la receta');
		}
	}

	/** Texto de «sin selección» en el selector de personas del hueco. */
	function allPeopleLabel(weekday: number, mealType: string, slotId: number, isAcc: number): string {
		return isAcc && parentMainId(weekday, mealType, slotId) !== null ? 'Como el plato' : 'Todos';
	}

	// Helpers for creating slot callbacks
	function makeSlotCallbacks(weekday: number, mealType: string, slotId: number, isAcc: number) {
		const key = slotKey(weekday, mealType, slotId, isAcc);
		const coord: SlotCoord = { weekday, mealType, slotId: slotId, isAcc };
		return {
			onSelectRecipe: (recipeId: number) => selectRecipe(weekday, mealType, slotId, isAcc, recipeId),
			onRemove: () => removeSlot(weekday, mealType, slotId, isAcc),
			onRandom: () => randomSlot(weekday, mealType as 'comida' | 'cena', slotId, isAcc),
			onAddTag: (tag: string) => addRequiredTag(weekday, mealType, slotId, tag),
			onRemoveTag: (tag: string) => removeRequiredTag(weekday, mealType, slotId, tag),
			onSetEditingTag: (k: string | null) => { editingTagKey = k; },
			...dnd.handlersFor(coord, key, () => !!getSlot(weekday, mealType, slotId, isAcc)?.recipe),
			onMoveClick: () => {
				if (moveSource) {
					moveCopySource = moveSource;
					moveCopyTarget = coord;
					moveCopyModalOpen = true;
					moveSource = null;
					return;
				}
				openRecipePicker(weekday, mealType, slotId, isAcc);
			},
			onTouchStart: () => {
				const slot = getSlot(weekday, mealType, slotId, isAcc);
				if (!isTouchDevice || !slot?.recipe) return;
				longPressTimer = setTimeout(() => {
					moveSource = coord;
					longPressTimer = null;
				}, 500);
			},
			onTouchEnd: () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } },
			onTouchMove: () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } },
			onSchedule: () => openScheduleModal(weekday, mealType, slotId, isAcc),
			onEdit: () => openRecipeEditModal(weekday, mealType, slotId, isAcc),
			onOpenPeople: () => { peopleSlot = { weekday, mealType, slotId: slotId, isAcc }; },
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
		onClear={() => clearPlan('week')}
		onClearFuture={() => clearPlan('future')}
		onCopyPrevious={copyPrevious}
		{people}
		{viewPerson}
		onViewPerson={(id) => viewPerson = id}
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

	{#if people.length > 0}
		<div class="sm:hidden flex items-center gap-2 px-3 pt-2 shrink-0">
			<span class="text-[10px] font-black uppercase tracking-widest" style="color: var(--text-muted);">Ver</span>
			<PersonFilter {people} value={viewPerson} onchange={(id) => viewPerson = id} size={26} />
		</div>
	{/if}

	<!-- Grid semanal -->
	<div class="flex-1 overflow-hidden flex flex-col min-h-0">
		{#if !weekData}
			<div class="text-center py-16 text-sm" style="color: var(--text-muted);">Cargando...</div>
		{:else}
		<div class="flex-1 overflow-y-auto overflow-x-hidden touch-pan-y pt-3 pb-3 sm:p-5 min-h-0"
			on:touchstart|passive={onContentTouchStart}
			on:touchend|passive={onContentTouchEnd}>
			<div class="week-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2.5rem_repeat(7,1fr)] gap-3 lg:gap-x-3 lg:gap-y-0"
				class:no-slide-anim={!slideAnim}
				style="--day-offset-px: {dayOffsetPx}px;"
				bind:clientWidth={dayTrackWidth}>
				<!-- Bandas de fondo de fila (solo desktop): pintan toda la fila de comida/cena
					detrás de las celdas; la columna de "hoy" mantiene su fondo propio encima -->
				<div class="hidden lg:block rounded-xl" style="grid-column: 1 / -1; grid-row: 2; background: var(--comida-band);"></div>
				<div class="hidden lg:block rounded-xl lg:mt-3" style="grid-column: 1 / -1; grid-row: 3; background: var(--cena-band);"></div>

				<!-- Etiquetas de fila (solo desktop) -->
				<div class="hidden lg:block" style="grid-column: 1; grid-row: 1;"></div>
				<div class="hidden lg:flex flex-col items-center justify-center gap-2 rounded-l-xl"
					style="grid-column: 1; grid-row: 2; background: var(--comida-header); border-left: 3px solid var(--comida-accent);">
					<svg viewBox="0 0 24 24" fill="none" stroke="var(--comida-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>
					<span style="writing-mode: vertical-rl; transform: rotate(180deg); color: var(--comida-accent);"
						class="text-[11px] font-black uppercase tracking-tight">Comida</span>
				</div>
				<div class="hidden lg:flex flex-col items-center justify-center gap-2 rounded-l-xl mt-2 lg:mt-3"
					style="grid-column: 1; grid-row: 3; background: var(--cena-header); border-left: 3px solid var(--cena-accent);">
					<svg viewBox="0 0 24 24" fill="none" stroke="var(--cena-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
					<span style="writing-mode: vertical-rl; transform: rotate(180deg); color: var(--cena-accent);"
						class="text-[11px] font-black uppercase tracking-tight">Cena</span>
				</div>

				{#each [1,2,3,4,5,6,7] as weekday, i}
					{@const date = weekDates[i]}
					{@const isToday = date != null && date.getTime() === todayUTC.getTime()}
					{@const dayComidaCfg = weekData?.configs[weekday]?.comida}
					{@const dayCenaCfg = weekData?.configs[weekday]?.cena}
					{@const dayFullyDisabled = dayComidaCfg?.disabled && dayCenaCfg?.disabled}

					<div id="day-{weekday}" class="day-col rounded-2xl overflow-hidden flex flex-col lg:contents max-sm:px-3"
						style="{isToday ? 'background: var(--primary-light);' : ''}">

						<!-- Cabecera del día -->
						<div class="max-sm:hidden px-2 pt-4 pb-2 shrink-0 text-center"
							style="grid-column: {i+2}; grid-row: 1; background: {isToday ? 'var(--primary-light)' : 'var(--background)'}; {isToday ? 'border-top: 3px solid var(--primary);' : ''}">
							<div class="flex flex-col items-center">
								<div class="flex items-center gap-1">
									<p class="font-semibold text-base leading-tight" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">{WEEKDAY_NAMES[i]}</p>
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
								{people}
								{slotPeopleInfo}
								{isSlotHidden}
								onAddMealSlot={(kind, parentId) => addMealSlot(weekday, meal, kind, parentId)}
								onRemoveMealSlot={(slotId) => removeMealSlot(weekday, meal, slotId)}
								onSetDisabledComment={(t) => setDisabledComment(weekday, meal, t)}
								onSetMealNote={(t) => setMealNote(weekday, meal, t)}
								onOpenPicker={(slotId, isAcc) => openRecipePicker(weekday, meal, slotId, isAcc)}
								onRemoveSlot={(slotId, isAcc) => removeSlot(weekday, meal, slotId, isAcc)}
							/>
						{/each}
					{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if weekData}
			<ViolationBanner violations={visibleViolations} />
		{/if}
		{/if}
	</div>

	{#if pickerSlot}
		<RecipePickerModal
			open={pickerOpen}
			weekKey={weekKey}
			weekday={pickerSlot.weekday}
			mealType={pickerSlot.mealType}
			slotId={pickerSlot.slotId}
			isAcc={pickerSlot.isAcc}
			{allTags}
			{people}
			initialPeople={getSlot(pickerSlot.weekday, pickerSlot.mealType, pickerSlot.slotId, pickerSlot.isAcc)?.people
				?? (viewPerson !== null ? [viewPerson] : [])}
			allPeopleLabel={allPeopleLabel(pickerSlot.weekday, pickerSlot.mealType, pickerSlot.slotId, pickerSlot.isAcc)}
			onPeopleChange={getSlot(pickerSlot.weekday, pickerSlot.mealType, pickerSlot.slotId, pickerSlot.isAcc)?.recipe
				? (ids) => setSlotPeople(pickerSlot!.weekday, pickerSlot!.mealType, pickerSlot!.slotId, pickerSlot!.isAcc, ids)
				: undefined}
			onSelect={(id, isLeftover, slotPeople) => {
				pickerOpen = false;
				selectRecipe(pickerSlot!.weekday, pickerSlot!.mealType, pickerSlot!.slotId, pickerSlot!.isAcc, id, isLeftover, slotPeople);
			}}
			onClose={() => { pickerOpen = false; }}
			onRecipeSaved={() => invalidateAll()}
		/>
	{/if}

	{#if peopleSlot}
		{@const ps = peopleSlot}
		{@const psSlot = getSlot(ps.weekday, ps.mealType, ps.slotId, ps.isAcc)}
		{#if psSlot?.recipe}
			<SlotPeopleDialog
				recipeName={psSlot.recipe.name}
				{people}
				value={psSlot.people}
				allLabel={allPeopleLabel(ps.weekday, ps.mealType, ps.slotId, ps.isAcc)}
				hint={psSlot.schedule ? 'Receta programada: el cambio solo afecta a esta semana. Para todas, edita la programación.' : undefined}
				onchange={(ids) => setSlotPeople(ps.weekday, ps.mealType, ps.slotId, ps.isAcc, ids)}
				onClose={() => peopleSlot = null}
			/>
		{/if}
	{/if}

	{#if scheduleModalSlot}
		<ScheduleModal
			open={scheduleModalOpen}
			{weekKey}
			weekday={scheduleModalSlot.weekday}
			mealType={scheduleModalSlot.mealType}
			slotId={scheduleModalSlot.slotId}
			isAccompaniment={scheduleModalSlot.isAcc}
			recipe={scheduleModalSlot.recipe}
			schedule={scheduleModalSlot.schedule}
			{people}
			slotPeople={getSlot(scheduleModalSlot.weekday, scheduleModalSlot.mealType, scheduleModalSlot.slotId, scheduleModalSlot.isAcc)?.people ?? []}
			onSaved={async () => { scheduleModalOpen = false; scheduleModalSlot = null; await invalidateAll(); }}
			onDeleted={async () => { scheduleModalOpen = false; scheduleModalSlot = null; await invalidateAll(); }}
			onClose={() => { scheduleModalOpen = false; scheduleModalSlot = null; }}
		/>
	{/if}

	{#if consolidatedInfo}
		<ConsolidatedScheduleDialog
			mode={consolidatedInfo.mode}
			recipeName={consolidatedInfo.recipeName}
			onDelay={() => handleConsolidated(true)}
			onKeep={() => handleConsolidated(false)}
			onCancel={() => { consolidatedInfo = null; }}
		/>
	{/if}

	{#if removeScheduleInfo}
		<RemoveScheduledRecipeDialog
			open={removeScheduleDialogOpen}
			recipeName={removeScheduleInfo.recipeName}
			everyNWeeks={removeScheduleInfo.everyNWeeks}
			rotationSize={removeScheduleInfo.rotationSize}
			nextInRotation={removeScheduleInfo.nextInRotation}
			onShiftRotation={handleShiftRotation}
			onOnlyThisWeek={handleRemoveOnlyThisWeek}
			onFullSchedule={handleRemoveFullSchedule}
			onCancel={() => { removeScheduleDialogOpen = false; removeScheduleInfo = null; }}
		/>
	{/if}

	<RecipeEditModal
		open={recipeEditOpen}
		recipe={recipeEditRecipe}
		allTags={data.allTags}
		onSaved={async () => { recipeEditOpen = false; await invalidateAll(); }}
		onClose={() => { recipeEditOpen = false; }}
	/>

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
				Toca el destino de «{getSlot(moveSource.weekday, moveSource.mealType, moveSource.slotId, moveSource.isAcc)?.recipe?.name}»
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
			sourceName={getSlot(moveCopySource.weekday, moveCopySource.mealType, moveCopySource.slotId, moveCopySource.isAcc)?.recipe?.name ?? ''}
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
	@media (max-width: 639px) {
		.week-grid {
			display: flex;
			flex-wrap: nowrap;
			gap: 0;
			transform: translateX(var(--day-offset-px, 0px));
			transition: transform 0.28s ease;
			will-change: transform;
		}
		.week-grid.no-slide-anim {
			transition: none;
		}
		.day-col {
			flex: 0 0 100%;
			width: 100%;
		}
	}
	@media (max-width: 639px) and (prefers-reduced-motion: reduce) {
		.week-grid {
			transition: none;
		}
	}
	.select-none {
		-webkit-touch-callout: none;
	}
</style>
