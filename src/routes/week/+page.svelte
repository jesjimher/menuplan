<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeekData, Recipe, Rule } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, WEEKDAY_NAMES, SHORT_MONTH_NAMES } from '$lib/utils/dates.js';
	import TagInput from '$lib/components/TagInput.svelte';
	import { sidebarOpen } from '$lib/stores/ui.js';

	let weekKey = $state(getWeekKey());
	let weekData = $state<WeekData | null>(null);
	let recipes = $state<Recipe[]>([]);
	let rules = $state<Rule[]>([]);
	let allTags = $state<string[]>([]);
	let calculating = $state(false);
	let busySlots = $state(new Set<string>());
	let editingTagKey = $state<string | null>(null);

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

	onMount(async () => {
		isTouchDevice = 'ontouchstart' in window;
		await Promise.all([loadWeek(), loadRecipes(), loadRules(), loadTags()]);
	});

	async function loadWeek() {
		const res = await fetch(`/api/week?weekKey=${weekKey}`);
		weekData = await res.json();
	}

	async function loadRecipes() {
		const res = await fetch('/api/recipes');
		recipes = await res.json();
	}

	async function loadRules() {
		const res = await fetch('/api/rules');
		rules = await res.json();
	}

	async function loadTags() {
		const res = await fetch('/api/recipes?tags=1');
		allTags = await res.json();
	}

	function prevWeek() {
		weekData = null;
		weekKey = getPreviousWeekKey(weekKey);
		loadWeek();
	}

	function nextWeek() {
		const [year, weekStr] = weekKey.split('-W');
		let wn = parseInt(weekStr) + 1;
		let yn = parseInt(year);
		if (wn > 52) { wn = 1; yn++; }
		weekData = null;
		weekKey = `${yn}-W${String(wn).padStart(2, '0')}`;
		loadWeek();
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
		patchSlot(weekday, mealType, slotIndex, isAcc, recipes.find(r => r.id === recipeId) ?? null);
		fetch('/api/week/assign', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc, recipe_id: recipeId, member_id: null })
		});
	}

	async function removeSlot(weekday: number, mealType: string, slotIndex: number, isAcc: number) {
		patchSlot(weekday, mealType, slotIndex, isAcc, null);
		fetch('/api/week/remove', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIndex, is_accompaniment: isAcc })
		});
	}

	function moveRecipe(from: SlotCoord, to: SlotCoord) {
		if (slotKey(from.weekday, from.mealType, from.slotIndex, from.isAcc) ===
			slotKey(to.weekday, to.mealType, to.slotIndex, to.isAcc)) return;
		const fromRecipe = getSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc)?.recipe ?? null;
		const toRecipe   = getSlot(to.weekday, to.mealType, to.slotIndex, to.isAcc)?.recipe ?? null;
		if (!fromRecipe) return;
		patchSlot(to.weekday,   to.mealType,   to.slotIndex,   to.isAcc,   fromRecipe);
		patchSlot(from.weekday, from.mealType, from.slotIndex, from.isAcc, toRecipe);
		const doAssign = (coord: SlotCoord, recipe: Recipe | null) => {
			if (recipe) {
				fetch('/api/week/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, weekday: coord.weekday, meal_type: coord.mealType,
						slot_index: coord.slotIndex, is_accompaniment: coord.isAcc, recipe_id: recipe.id, member_id: null }) });
			} else {
				fetch('/api/week/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ weekKey, weekday: coord.weekday, meal_type: coord.mealType,
						slot_index: coord.slotIndex, is_accompaniment: coord.isAcc }) });
			}
		};
		doAssign(to, fromRecipe);
		doAssign(from, toRecipe);
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
			}
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
			weekData = await res.json();
		} finally {
			calculating = false;
		}
	}

	async function recalculatePlan() {
		if (!confirm('¿Limpiar todo el plan y recalcular desde cero?')) return;
		calculating = true;
		try {
			await fetch('/api/week/clear', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			const res = await fetch('/api/week/calculate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ weekKey })
			});
			weekData = await res.json();
		} finally {
			calculating = false;
		}
	}

	async function clearPlan() {
		if (!confirm('¿Limpiar todo el plan de esta semana?')) return;
		await fetch('/api/week/clear', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey })
		});
		const res = await fetch(`/api/week?weekKey=${weekKey}`);
		weekData = await res.json();
	}

	async function copyPrevious() {
		if (!confirm('¿Copiar el plan de la semana anterior?')) return;
		await fetch('/api/week/copy-previous', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey })
		});
		await loadWeek();
	}

	async function updateConfig(weekday: number, mealType: string, field: string, value: number) {
		await fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, [field]: value })
		});
		await loadWeek();
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
		await loadWeek();
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
</script>

<svelte:window
	on:click={(e) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.dropdown-container')) closeDropdown();
	}}
	on:keydown={(e) => { if (e.key === 'Escape') { moveSource = null; dragSource = null; } }}
/>

<div class="flex flex-col h-full" style="background: var(--background);">

	<!-- Cabecera -->
	<header class="px-4 sm:px-6 py-3 shrink-0" style="background: rgba(255,248,243,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-container-highest);">
		<div class="flex items-center gap-2 sm:gap-3">
			<button class="lg:hidden p-1.5 rounded-lg transition-colors shrink-0"
				style="color: var(--primary);"
				on:click={() => $sidebarOpen = true}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<h1 class="text-xl sm:text-2xl font-black tracking-tight" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">
				<span class="sm:hidden">{weekKey}</span>
				<span class="hidden sm:inline">Semana {weekKey}</span>
			</h1>
			<nav class="flex items-center gap-1 sm:gap-2 text-sm font-bold">
				<button on:click={prevWeek}
					class="flex items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors"
					style="color: var(--text-secondary);"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
					<span class="sm:hidden">&larr;</span>
					<span class="hidden sm:inline">&larr; Anterior</span>
				</button>
				<button on:click={nextWeek}
					class="flex items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors"
					style="color: var(--text-secondary);"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
					<span class="sm:hidden">&rarr;</span>
					<span class="hidden sm:inline">Siguiente &rarr;</span>
				</button>
			</nav>

			<div class="ml-auto flex gap-1 sm:gap-2 items-center">
				<!-- Icono copiar + limpiar -->
				<div class="hidden sm:flex items-center gap-1 pr-2 mr-1" style="border-right: 1px solid var(--surface-container-highest);">
					<button on:click={copyPrevious}
						class="p-2 rounded-lg transition-colors"
						style="color: var(--text-secondary);"
						on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
						on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
						title="Copiar semana anterior">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					</button>
					<button on:click={clearPlan}
						class="p-2 rounded-lg transition-colors"
						style="color: var(--text-secondary);"
						on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
						on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
						title="Limpiar plan">
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
					</button>
				</div>
				<button on:click={recalculatePlan} disabled={calculating}
					class="hidden sm:inline-flex px-3 py-1.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
					style="color: var(--text-secondary);"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
					title="Recalcular plan completo">
					{calculating ? 'Calculando...' : 'Recalcular'}
				</button>
				<button on:click={calculatePlan} disabled={calculating}
					class="px-4 sm:px-5 py-2 rounded-full text-sm font-bold disabled:opacity-40 transition-all shadow-sm"
					style="background: var(--primary); color: white;"
					on:mouseenter={(e) => { if (!calculating) e.currentTarget.style.background = 'var(--primary-hover)'; }}
					on:mouseleave={(e) => { if (!calculating) e.currentTarget.style.background = 'var(--primary)'; }}
					title="Completar huecos">
					{#if calculating}
						<span class="sm:hidden">...</span>
						<span class="hidden sm:inline">Calculando...</span>
					{:else}
						<svg class="sm:hidden w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
						<span class="hidden sm:inline">Completar huecos</span>
					{/if}
				</button>
			</div>
		</div>
	</header>

	<!-- Banner de violaciones -->
	{#if weekData}
		<div class="mx-4 sm:mx-6 mt-4 px-4 py-3 flex items-center gap-3 rounded-xl shrink-0"
			style="{weekData.violations && weekData.violations.length > 0
				? `background: var(--error-bg); border-left: 4px solid var(--error);`
				: `background: var(--success-bg); border-left: 4px solid var(--success);`}">
			{#if weekData.violations && weekData.violations.length > 0}
				<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style="background: rgba(186,26,26,0.1);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--error);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-xs font-black uppercase tracking-wide" style="font-family: 'Epilogue', sans-serif; color: var(--error);">Reglas incumplidas</p>
					<p class="text-sm truncate mt-0.5" style="color: var(--error);">{weekData.violations.map(v => v.message).join(' · ')}</p>
				</div>
			{:else}
				<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style="background: rgba(45,106,62,0.1);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--success);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
				</div>
				<p class="text-sm font-medium" style="color: var(--success);">Se cumplen todas las reglas</p>
			{/if}
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
					{@const dayComidaCfg = weekData?.configs[weekday]?.comida}
					{@const dayCenaCfg = weekData?.configs[weekday]?.cena}
					{@const dayFullyDisabled = dayComidaCfg?.disabled && dayCenaCfg?.disabled}

					<div class="rounded-2xl overflow-hidden flex flex-col lg:contents"
						style="background: var(--surface-container-low);">

						<!-- Cabecera del día -->
						<div class="px-2 pt-4 pb-2 shrink-0 text-center"
							style="grid-column: {i+1}; grid-row: 1; background: var(--background);">
							<div class="flex flex-col items-center">
								<div class="flex items-center gap-1">
									<p class="font-black text-base leading-tight" style="font-family: 'Epilogue', sans-serif; color: {isWeekend ? 'var(--primary-hover)' : 'var(--primary)'};">{WEEKDAY_NAMES[i]}</p>
									<button
										on:click={() => disableDay(weekday)}
										title={dayFullyDisabled ? 'Planificar este día' : 'No planificar este día'}
										class="w-4 h-4 inline-flex items-center justify-center rounded-full transition-all hover:scale-125 hover:rotate-90"
										style="color: {dayFullyDisabled ? 'var(--error)' : 'var(--text-muted)'};"
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
									</button>
								</div>
								{#if date}
									<p class="text-[10px] uppercase tracking-widest font-bold mt-0.5" style="color: var(--secondary);">{date.getUTCDate()} {SHORT_MONTH_NAMES[date.getUTCMonth()]}</p>
								{/if}
							</div>
						</div>

						<!-- Comida y Cena -->
						{#if dayFullyDisabled}
							<!-- Día completo sin planificar: un único bloque con comentario -->
							<div class="flex-1 flex flex-col lg:flex-none"
								style="background: var(--surface-container-low); grid-column: {i+1}; grid-row: 2 / 4;">
								<div class="px-2.5 py-3 flex-1">
									<input
										type="text"
										placeholder="Motivo (ej. Vacaciones en París)..."
										value={dayComidaCfg?.disabled_comment ?? ''}
										on:change={(e) => setDayComment(weekday, (e.target as HTMLInputElement).value)}
										class="w-full text-xs px-2.5 py-2 rounded-xl italic focus:outline-none"
										style="background: var(--surface); border: 2px dashed var(--border); color: var(--text-muted);"
										/>
								</div>
							</div>
						{:else}
						{#each ['comida', 'cena'] as mealType, j}
							{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
							{@const isComida = mealType === 'comida'}

							<div class="flex-1 flex flex-col lg:flex-none"
								style="background: {isComida ? 'var(--surface-container-low)' : 'var(--background)'}; grid-column: {i+1}; grid-row: {j+2};">

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
										class="w-5 h-5 flex items-center justify-center rounded transition-opacity hover:opacity-70"
										style="color: {cfg.disabled ? 'var(--error)' : 'var(--text-muted)'};"
									>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
									</button>
								</div>

								{#if cfg.disabled}
									<!-- Comida desactivada: mostrar campo de comentario -->
									<div class="px-2.5 pb-2.5 pt-2 flex-1">
										<input
											type="text"
											placeholder="Motivo (ej. Cenamos fuera)..."
											value={cfg.disabled_comment ?? ''}
											on:change={(e) => setDisabledComment(weekday, mealType, (e.target as HTMLInputElement).value)}
											class="w-full text-xs px-2.5 py-2 rounded-xl italic focus:outline-none"
											style="background: var(--surface); border: 2px dashed var(--border); color: var(--text-muted);"
										/>
									</div>
								{:else}

								<!-- Slots -->
								<div class="px-2 pb-3 pt-2 space-y-2 flex-1">
									{#each Array(cfg.recipe_count) as _, slotIdx}
										{@const slot = getSlot(weekday, mealType, slotIdx, 0)}
										{@const key = slotKey(weekday, mealType, slotIdx, 0)}
										{@const slotTags = cfg.required_tags[slotIdx] ?? []}
										{@const slotTagEditKey = `tag-${weekday}-${mealType}-${slotIdx}`}
										{@const imgH = cfg.recipe_count === 1 ? 'min-h-[100px]' : cfg.recipe_count === 2 ? 'min-h-[52px]' : 'min-h-[40px]'}
										{@const emptyH = cfg.recipe_count === 1 ? 'min-h-[3.5rem]' : cfg.recipe_count === 2 ? 'min-h-[1.75rem]' : 'min-h-[1.25rem]'}

										<div>
											<!-- Receta principal -->
											<div class="dropdown-container relative"
												style:box-shadow={dragOver === key ? '0 0 0 2px var(--primary)' : undefined}
												style:outline={moveSource ? '2px dashed var(--primary)' : undefined}
												style:outline-offset={moveSource ? '2px' : undefined}
												on:dragover|preventDefault={(e) => { if (!dragSource) return; e.dataTransfer!.dropEffect = 'move'; dragOver = key; }}
												on:dragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver = null; }}
												on:drop|preventDefault={() => {
													if (!dragSource) return;
													moveRecipe(dragSource, { weekday, mealType, slotIndex: slotIdx, isAcc: 0 });
													dragSource = null; dragOver = null;
												}}
											>
												<div class="relative group/slot">
													<button
														draggable={!isTouchDevice && !!slot?.recipe ? 'true' : 'false'}
														class:opacity-40={dragSource && slotKey(weekday, mealType, slotIdx, 0) === slotKey(dragSource.weekday, dragSource.mealType, dragSource.slotIndex, dragSource.isAcc)}
														on:click|stopPropagation={() => {
															if (moveSource) {
																moveRecipe(moveSource, { weekday, mealType, slotIndex: slotIdx, isAcc: 0 });
																moveSource = null;
																return;
															}
															openDropdown === key ? closeDropdown() : openSlotDropdown(weekday, mealType, slotIdx, 0);
														}}
														on:dragstart={(e) => {
															if (!slot?.recipe) return;
															dragSource = { weekday, mealType, slotIndex: slotIdx, isAcc: 0 };
															openDropdown = null;
															e.dataTransfer!.effectAllowed = 'move';
															e.dataTransfer!.setData('text/plain', key);
														}}
														on:dragend={() => { dragSource = null; dragOver = null; }}
														on:touchstart|passive={() => {
															if (!isTouchDevice || !slot?.recipe) return;
															longPressTimer = setTimeout(() => {
																moveSource = { weekday, mealType, slotIndex: slotIdx, isAcc: 0 };
																openDropdown = null;
																longPressTimer = null;
															}, 500);
														}}
														on:touchend={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }}
														on:touchmove={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }}
														on:contextmenu|preventDefault={() => {}}
														class="w-full text-left text-xs transition-all select-none {slot?.recipe?.image_type ? `relative overflow-hidden rounded-xl shadow-sm hover:shadow-md ${imgH}` : slot?.recipe ? 'px-3 py-2.5 rounded-xl shadow-sm min-h-[2.5rem] flex items-start' : `px-2.5 py-3 rounded-xl ${emptyH} flex flex-col items-center justify-center gap-1`}"
														style="{slot?.recipe
															? (slot.recipe.image_type ? 'background: var(--surface);' : `background: var(--surface); color: var(--text);`)
															: `background: var(--surface-container-low); border: 2px dashed var(--border); color: var(--text-muted);`}"
													>
														{#if slot?.recipe?.image_type}
															<img src="/api/recipes/{slot.recipe.id}/image" alt=""
																class="absolute inset-0 w-full h-full object-cover group-hover/slot:scale-105 transition-transform duration-500"
																on:error={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'} />
															<span class="absolute bottom-0 left-0 right-0 px-2.5 py-2 font-bold text-[11px] leading-tight"
																style="background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%); color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
																{slot.recipe.name}
															</span>
														{:else if slot?.recipe}
															<span class="leading-snug font-semibold text-[11px]">{slot.recipe.name}</span>
														{:else}
															<span class="text-lg leading-none" style="color: var(--text-muted);">+</span>
														{/if}
													</button>
													<div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/slot:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
														{#if editingTagKey !== slotTagEditKey}
															<button
																on:click|stopPropagation={() => editingTagKey = slotTagEditKey}
																class="w-6 h-6 flex items-center justify-center rounded-full shadow-sm transition-colors"
																style="background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); color: var(--primary);"
																title="Añadir tag requerido"
															><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg></button>
														{/if}
														<button
															on:click|stopPropagation={() => randomSlot(weekday, mealType as 'comida'|'cena', slotIdx, 0)}
															disabled={busySlots.has(slotKey(weekday, mealType, slotIdx, 0))}
															class="w-6 h-6 flex items-center justify-center rounded-full shadow-sm disabled:opacity-40 disabled:cursor-wait transition-colors text-sm"
															style="background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); color: var(--primary);"
															title="Receta aleatoria"
														>{busySlots.has(slotKey(weekday, mealType, slotIdx, 0)) ? '...' : '↻'}</button>
														{#if slot?.recipe}
															<a
																href="/recipes?edit={slot.recipe.id}"
																on:click|stopPropagation
																class="w-6 h-6 flex items-center justify-center rounded-full shadow-sm transition-colors text-sm"
																style="background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); color: var(--primary);"
																title="Editar receta"
															>
																<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
															</a>
															<button
																on:click|stopPropagation={() => removeSlot(weekday, mealType, slotIdx, 0)}
																class="w-6 h-6 flex items-center justify-center rounded-full shadow-sm transition-colors text-sm"
																style="background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); color: var(--error);"
																title="Quitar"
															>&times;</button>
														{/if}
													</div>
												</div>

												<!-- Dropdown búsqueda receta -->
												{#if openDropdown === key}
													<div class="fixed z-[9999] w-72 rounded-xl shadow-2xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--surface-container-highest);" use:fixedDropdown>
														<div class="p-2" style="border-bottom: 1px solid var(--surface-container-highest);">
															<input
																type="text"
																placeholder="Buscar receta..."
																bind:value={searchQuery}
																on:input={() => handleSearch(weekday, mealType, 0)}
																class="w-full text-sm px-2.5 py-2 rounded-lg focus:outline-none"
																style="background: var(--surface-container-low); color: var(--text);"
																use:focusOnMount
															/>
														</div>
														{#if topRecipes.length > 0 && !searchQuery}
															<div class="px-3 py-2"
																style="background: var(--surface-container-low); border-bottom: 1px solid var(--surface-container-highest);">
																<p class="text-[10px] font-black uppercase tracking-tighter mb-1.5" style="color: var(--text-muted);">Top este día</p>
																{#each topRecipes as r}
																	<button
																		on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																		class="block w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors font-medium"
																		style="color: var(--primary);"
																		on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container)'}
																		on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
																	>{r.name}</button>
																{/each}
															</div>
														{/if}
														<div class="max-h-64 overflow-y-auto">
															{#if searchResults.length === 0}
																<p class="text-xs px-3 py-3" style="color: var(--text-muted);">Sin resultados</p>
															{:else}
																{#each searchResults as r}
																	<button
																		on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																		class="block w-full text-left px-3 py-2.5 transition-colors"
																		style="border-bottom: 1px solid var(--surface-container-highest); color: var(--text);"
																		on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container-low)'}
																		on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
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
																on:click|stopPropagation={() => removeRequiredTag(weekday, mealType, slotIdx, tag)}
																class="hover:opacity-60 transition-opacity font-bold"
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
															on:change={(e) => addRequiredTag(weekday, mealType, slotIdx, e.detail)}
															on:keydown={(e) => {
																if (e.key === 'Escape') editingTagKey = null;
																if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
															}}
															--tag-border="var(--border-hover)"
														/>
													{/if}
												</div>
											{/if}

											<!-- Acompañamientos por receta -->
											{#if cfg.accompaniment_per_recipe > 0}
												{#each Array(cfg.accompaniment_per_recipe) as _, aIdx}
													{@const accSlotIdx = slotIdx * cfg.accompaniment_per_recipe + aIdx}
													{@const accSlot = getSlot(weekday, mealType, accSlotIdx, 1)}
													{@const accKey = slotKey(weekday, mealType, accSlotIdx, 1)}
													<div class="dropdown-container relative mt-1.5"
														style:box-shadow={dragOver === accKey ? '0 0 0 2px var(--primary)' : undefined}
														style:outline={moveSource ? '2px dashed var(--primary)' : undefined}
														style:outline-offset={moveSource ? '2px' : undefined}
														on:dragover|preventDefault={(e) => { if (!dragSource) return; e.dataTransfer!.dropEffect = 'move'; dragOver = accKey; }}
														on:dragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver = null; }}
														on:drop|preventDefault={() => {
															if (!dragSource) return;
															moveRecipe(dragSource, { weekday, mealType, slotIndex: accSlotIdx, isAcc: 1 });
															dragSource = null; dragOver = null;
														}}
													>
														<div class="relative group/acc">
															<button
																draggable={!isTouchDevice && !!accSlot?.recipe ? 'true' : 'false'}
																class:opacity-40={dragSource && slotKey(weekday, mealType, accSlotIdx, 1) === slotKey(dragSource.weekday, dragSource.mealType, dragSource.slotIndex, dragSource.isAcc)}
																on:click|stopPropagation={() => {
																	if (moveSource) {
																		moveRecipe(moveSource, { weekday, mealType, slotIndex: accSlotIdx, isAcc: 1 });
																		moveSource = null;
																		return;
																	}
																	openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, accSlotIdx, 1);
																}}
																on:dragstart={(e) => {
																	if (!accSlot?.recipe) return;
																	dragSource = { weekday, mealType, slotIndex: accSlotIdx, isAcc: 1 };
																	openDropdown = null;
																	e.dataTransfer!.effectAllowed = 'move';
																	e.dataTransfer!.setData('text/plain', accKey);
																}}
																on:dragend={() => { dragSource = null; dragOver = null; }}
																on:touchstart|passive={() => {
																	if (!isTouchDevice || !accSlot?.recipe) return;
																	longPressTimer = setTimeout(() => {
																		moveSource = { weekday, mealType, slotIndex: accSlotIdx, isAcc: 1 };
																		openDropdown = null;
																		longPressTimer = null;
																	}, 500);
																}}
																on:touchend={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }}
																on:touchmove={() => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }}
																on:contextmenu|preventDefault={() => {}}
																class="w-full text-left text-[10px] transition-colors select-none pr-6 px-2 py-1.5 rounded-lg"
																style="{accSlot?.recipe
																	? `background: var(--secondary-container); color: var(--secondary);`
																	: `background: transparent; border: 1px dashed var(--border); color: var(--text-muted);`}"
															>
																<span class="leading-snug {accSlot?.recipe ? 'font-semibold' : 'italic'}">
																	{accSlot?.recipe?.name ?? '+ acomp.'}
																</span>
															</button>
															{#if accSlot?.recipe}
																<div class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/acc:opacity-100 transition-opacity">
																	<button
																		on:click|stopPropagation={() => removeSlot(weekday, mealType, accSlotIdx, 1)}
																		class="w-5 h-5 flex items-center justify-center rounded-full shadow-sm transition-colors text-xs"
																		style="background: rgba(255,255,255,0.9); color: var(--error);"
																	>&times;</button>
																</div>
															{/if}
														</div>

														{#if openDropdown === accKey}
															<div class="fixed z-[9999] w-72 rounded-xl shadow-xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);" use:fixedDropdown>
																<div class="p-2" style="border-bottom: 1px solid var(--surface-container-highest);">
																	<input
																		type="text"
																		placeholder="Buscar acomp..."
																		bind:value={searchQuery}
																		on:input={() => handleSearch(weekday, mealType, 1)}
																		class="w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none"
																		style="background: var(--surface-container-low); color: var(--text);"
																		use:focusOnMount
																	/>
																</div>
																<div class="max-h-64 overflow-y-auto">
																	{#if searchResults.length === 0}
																		<p class="text-xs px-3 py-3" style="color: var(--text-muted);">Sin resultados</p>
																	{:else}
																		{#each searchResults as r}
																			<button
																				on:click|stopPropagation={() => selectRecipe(weekday, mealType, accSlotIdx, 1, r.id)}
																				class="block w-full text-left px-3 py-2 transition-colors"
																				style="border-bottom: 1px solid var(--surface-container-highest); color: var(--text);"
																				on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-container-low)'}
																				on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
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
												{/each}
											{/if}
										</div>
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
