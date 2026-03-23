<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeekData, Recipe, Rule } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, WEEKDAY_NAMES, SHORT_MONTH_NAMES } from '$lib/utils/dates.js';
	import TagInput from '$lib/components/TagInput.svelte';

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

	let weekDates = $derived(getWeekDates(weekKey));

	onMount(async () => {
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

	async function setRequiredTag(weekday: number, mealType: string, slotIdx: number, tag: string) {
		const value = tag.trim().toLowerCase() || null;
		editingTagKey = null;
		await fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, slot_index: slotIdx, required_tag: value })
		});
		await loadWeek();
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

<svelte:window on:click={(e) => {
	const target = e.target as HTMLElement;
	if (!target.closest('.dropdown-container')) closeDropdown();
}} />

<div class="flex flex-col h-full" style="background: var(--bg);">

	<!-- Cabecera -->
	<header class="px-3 sm:px-5 py-2.5 sm:py-3 shrink-0" style="background: var(--surface); border-bottom: 1px solid var(--border);">
		<div class="flex flex-wrap items-center gap-1 sm:gap-2">
			<button on:click={prevWeek}
				class="px-2 sm:px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
				style="color: var(--text-secondary);"
				on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
				on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
				<span class="sm:hidden">&larr;</span>
				<span class="hidden sm:inline">&larr; Anterior</span>
			</button>
			<h1 class="text-lg sm:text-xl font-semibold tracking-tight" style="font-family: 'Lora', serif; color: var(--text);">
				<span class="sm:hidden">{weekKey}</span>
				<span class="hidden sm:inline">Semana {weekKey}</span>
			</h1>
			<button on:click={nextWeek}
				class="px-2 sm:px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
				style="color: var(--text-secondary);"
				on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
				on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}>
				<span class="sm:hidden">&rarr;</span>
				<span class="hidden sm:inline">Siguiente &rarr;</span>
			</button>

			<div class="ml-auto flex gap-1 sm:gap-1.5 flex-wrap items-center">
				<button on:click={calculatePlan} disabled={calculating}
					class="px-2 sm:px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
					style="background: var(--primary); color: white;"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--primary-hover)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'var(--primary)'}
					title="Completar huecos">
					{#if calculating}
						<span class="sm:hidden">...</span>
						<span class="hidden sm:inline">Calculando...</span>
					{:else}
						<svg class="sm:hidden w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
						<span class="hidden sm:inline">Completar huecos</span>
					{/if}
				</button>
				<button on:click={recalculatePlan} disabled={calculating}
					class="px-2 sm:px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
					style="background: var(--comida-accent); color: white;"
					title="Recalcular plan completo">
					{#if calculating}
						<span class="sm:hidden">...</span>
						<span class="hidden sm:inline">Calculando...</span>
					{:else}
						<svg class="sm:hidden w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
						<span class="hidden sm:inline">Recalcular</span>
					{/if}
				</button>
				<button on:click={copyPrevious}
					class="px-2 sm:px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
					style="color: var(--text-secondary);"
					on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
					on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
					title="Copiar semana anterior">
					<svg class="sm:hidden w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					<span class="hidden sm:inline">Copiar anterior</span>
				</button>
				<button on:click={clearPlan}
					class="px-2 sm:px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
					style="color: var(--error);"
					title="Limpiar">
					<svg class="sm:hidden w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
					<span class="hidden sm:inline">Limpiar</span>
				</button>
			</div>
		</div>
	</header>

	<!-- Banner de violaciones -->
	<div class="mx-3 sm:mx-5 mt-3 px-4 h-10 flex items-center rounded-xl shrink-0 overflow-hidden"
		style="{weekData?.violations && weekData.violations.length > 0
			? `background: var(--error-bg); border: 1px solid var(--error-border);`
			: `background: var(--success-bg); border: 1px solid var(--success-border);`}">
		{#if weekData?.violations && weekData.violations.length > 0}
			<span class="text-xs font-semibold uppercase tracking-wide mr-3 shrink-0" style="color: var(--error);">Reglas incumplidas:</span>
			<span class="text-sm truncate" style="color: var(--error);">{weekData.violations.map(v => v.message).join(' · ')}</span>
		{:else}
			<span class="text-sm" style="color: var(--success);">Se cumplen todas las reglas</span>
		{/if}
	</div>

	<!-- Grid semanal -->
	<div class="flex-1 overflow-auto p-3 sm:p-4">
		{#if !weekData}
			<div class="text-center py-16 text-sm" style="color: var(--text-muted);">Cargando...</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 lg:gap-y-0">
				{#each [1,2,3,4,5,6,7] as weekday, i}
					{@const date = weekDates[i]}
					{@const isWeekend = i >= 5}

					<div class="rounded-2xl overflow-hidden flex flex-col lg:contents"
						style="background: var(--surface); border: 1px solid var(--border);">

						<!-- Cabecera del día -->
						<div class="px-3 py-2.5 shrink-0 lg:rounded-t-2xl lg:overflow-hidden lg:border lg:border-b-0"
							style="background: {isWeekend ? 'var(--weekend-bg)' : 'var(--day-bg)'}; border-color: var(--border); grid-column: {i+1}; grid-row: 1;">
							<p class="font-semibold text-base" style="font-family: 'Lora', serif; color: var(--day-text);">{WEEKDAY_NAMES[i]}</p>
							{#if date}
								<p class="text-xs" style="color: {isWeekend ? 'var(--weekend-date)' : 'var(--day-date)'};">{date.getUTCDate()} {SHORT_MONTH_NAMES[date.getUTCMonth()]}</p>
							{/if}
						</div>

						<!-- Comida y Cena -->
						{#each ['comida', 'cena'] as mealType, j}
							{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
							{@const isComida = mealType === 'comida'}

							<div class="flex-1 flex flex-col lg:flex-none {isComida ? 'lg:border-l lg:border-r' : 'lg:rounded-b-2xl lg:overflow-hidden lg:border lg:border-t-0'}"
								style="background: {isComida ? 'var(--comida-bg)' : 'var(--cena-bg)'}; border-color: var(--border); {isComida ? `border-bottom: 1px solid var(--border);` : ''} grid-column: {i+1}; grid-row: {j+2};">

								<!-- Encabezado de franja -->
								<div class="flex items-center gap-1 px-3 py-2"
									style="background: {isComida ? 'var(--comida-header)' : 'var(--cena-header)'};">
									<span class="flex-1 text-xs font-semibold uppercase tracking-wider"
										style="color: var(--text);">
										{isComida ? 'Comida' : 'Cena'}
									</span>
									<button
										on:click={() => updateConfig(weekday, mealType, 'recipe_count', Math.max(1, cfg.recipe_count - 1))}
										class="w-5 h-5 flex items-center justify-center rounded text-sm leading-none transition-opacity hover:opacity-60"
										style="color: var(--text-secondary);"
									>&minus;</button>
									<span class="text-xs w-4 text-center tabular-nums"
										style="color: var(--text-secondary);">{cfg.recipe_count}</span>
									<button
										on:click={() => updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1)}
										class="w-5 h-5 flex items-center justify-center rounded text-sm leading-none transition-opacity hover:opacity-60"
										style="color: var(--text-secondary);"
									>+</button>
								</div>

								<!-- Slots -->
								<div class="px-2.5 pb-2.5 pt-1 space-y-1.5 flex-1">
									{#each Array(cfg.recipe_count) as _, slotIdx}
										{@const slot = getSlot(weekday, mealType, slotIdx, 0)}
										{@const key = slotKey(weekday, mealType, slotIdx, 0)}
										{@const slotTag = cfg.required_tags[slotIdx] ?? null}
										{@const slotTagEditKey = `tag-${weekday}-${mealType}-${slotIdx}`}

										<div>
											<!-- Receta principal -->
											<div class="dropdown-container relative">
												<div class="relative group/slot">
													<button
														on:click|stopPropagation={() => openDropdown === key ? closeDropdown() : openSlotDropdown(weekday, mealType, slotIdx, 0)}
														class="w-full text-left text-xs transition-colors min-h-[2rem] pr-14 flex items-start {slot?.recipe ? 'px-1 py-1.5' : 'px-2.5 py-2 rounded-xl'}"
														style="{slot?.recipe
															? `color: var(--text);`
															: `background: var(--surface); border: 2px dashed #b5a898; color: var(--text-muted);`}"
													>
														<span class="line-clamp-2 leading-snug {slot?.recipe ? 'font-medium' : 'italic'}">
															{slot?.recipe?.name ?? 'Sin receta'}
														</span>
													</button>
													<div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/slot:opacity-100 transition-opacity">
														{#if !slotTag && editingTagKey !== slotTagEditKey}
															<button
																on:click|stopPropagation={() => editingTagKey = slotTagEditKey}
																class="w-6 h-6 flex items-center justify-center rounded-lg shadow-sm transition-colors"
																style="background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary);"
																title="Añadir tag requerido"
															><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg></button>
														{/if}
														<button
															on:click|stopPropagation={() => randomSlot(weekday, mealType as 'comida'|'cena', slotIdx, 0)}
															disabled={busySlots.has(slotKey(weekday, mealType, slotIdx, 0))}
															class="w-6 h-6 flex items-center justify-center rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-wait transition-colors text-sm"
															style="background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary);"
															title="Receta aleatoria"
														>{busySlots.has(slotKey(weekday, mealType, slotIdx, 0)) ? '...' : '↻'}</button>
														{#if slot?.recipe}
															<a
																href="/recipes?edit={slot.recipe.id}"
																on:click|stopPropagation
																class="w-6 h-6 flex items-center justify-center rounded-lg shadow-sm transition-colors text-sm"
																style="background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary);"
																title="Editar receta"
															>
																<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
															</a>
															<button
																on:click|stopPropagation={() => removeSlot(weekday, mealType, slotIdx, 0)}
																class="w-6 h-6 flex items-center justify-center rounded-lg shadow-sm transition-colors text-sm"
																style="background: var(--surface); border: 1px solid var(--border); color: var(--error);"
																title="Quitar"
															>&times;</button>
														{/if}
													</div>
												</div>

												<!-- Dropdown búsqueda receta -->
												{#if openDropdown === key}
													<div class="fixed z-[9999] w-72 rounded-xl shadow-xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);" use:fixedDropdown>
														<div class="p-2" style="border-bottom: 1px solid var(--border);">
															<input
																type="text"
																placeholder="Buscar receta..."
																bind:value={searchQuery}
																on:input={() => handleSearch(weekday, mealType, 0)}
																class="w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none"
																style="border: 1px solid var(--border); color: var(--text);"
																use:focusOnMount
															/>
														</div>
														{#if topRecipes.length > 0 && !searchQuery}
															<div class="px-2 py-1.5"
																style="background: {isComida ? 'var(--comida-header)' : 'var(--cena-header)'}; border-bottom: 1px solid var(--border);">
																<p class="text-xs font-semibold mb-1" style="color: var(--text);">Top este día:</p>
																{#each topRecipes as r}
																	<button
																		on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																		class="block w-full text-left text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
																		style="color: var(--text);"
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
																		class="block w-full text-left px-3 py-2 transition-colors"
																		style="border-bottom: 1px solid var(--border); color: var(--text);"
																		on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
																		on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
																	>
																		<p class="text-sm" style="color: var(--text);">{r.name}</p>
																		{#if r.tags}
																			<p class="text-xs mt-0.5" style="color: var(--text-secondary);">{r.tags}</p>
																		{/if}
																	</button>
																{/each}
															{/if}
														</div>
													</div>
												{/if}
											</div>

											<!-- Tag requerido del slot -->
											{#if editingTagKey === slotTagEditKey}
												<div class="mt-1">
													<TagInput
														autofocus
														value={slotTag ?? ''}
														tags={allTags}
														placeholder="tag requerido..."
														class="w-full text-xs px-2 py-1 rounded-lg outline-none"
														on:change={(e) => setRequiredTag(weekday, mealType, slotIdx, e.detail)}
														on:keydown={(e) => {
															if (e.key === 'Escape') editingTagKey = null;
															if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
														}}
														--tag-border="var(--border-hover)"
													/>
												</div>
											{:else if slotTag}
												<div class="mt-1">
													<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
														style="background: {isComida ? 'var(--comida-slot-filled)' : 'var(--cena-slot-filled)'}; color: var(--text);">
														{slotTag}
														<button
															on:click|stopPropagation={() => { editingTagKey = slotTagEditKey; }}
															class="hover:opacity-60 transition-opacity"
															title="Editar"
														>
															<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
														</button>
														<button
															on:click|stopPropagation={() => setRequiredTag(weekday, mealType, slotIdx, '')}
															class="hover:opacity-60 transition-opacity font-bold"
															title="Quitar"
														>&times;</button>
													</span>
												</div>
											{/if}

											<!-- Acompañamientos por receta -->
											{#if cfg.accompaniment_per_recipe > 0}
												{#each Array(cfg.accompaniment_per_recipe) as _, aIdx}
													{@const accSlotIdx = slotIdx * cfg.accompaniment_per_recipe + aIdx}
													{@const accSlot = getSlot(weekday, mealType, accSlotIdx, 1)}
													{@const accKey = slotKey(weekday, mealType, accSlotIdx, 1)}
													<div class="dropdown-container relative mt-1">
														<div class="relative group/acc">
															<button
																on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, accSlotIdx, 1)}
																class="w-full text-left text-xs transition-colors pr-8 {accSlot?.recipe ? 'px-1 py-1' : 'px-2 py-1.5 rounded-lg'}"
																style="{accSlot?.recipe
																	? `color: var(--text-secondary);`
																	: `background: var(--surface); border: 2px dashed #b5a898; color: var(--text-muted);`}"
															>
																<span class="leading-snug {accSlot?.recipe ? '' : 'italic'}" style="font-size: 0.7rem;">
																	{accSlot?.recipe?.name ?? '+ acomp.'}
																</span>
															</button>
															{#if accSlot?.recipe}
																<div class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/acc:opacity-100 transition-opacity">
																	<button
																		on:click|stopPropagation={() => removeSlot(weekday, mealType, accSlotIdx, 1)}
																		class="w-5 h-5 flex items-center justify-center rounded-lg shadow-sm transition-colors text-xs"
																		style="background: var(--surface); border: 1px solid var(--border); color: var(--error);"
																	>&times;</button>
																</div>
															{/if}
														</div>

														{#if openDropdown === accKey}
															<div class="fixed z-[9999] w-72 rounded-xl shadow-xl overflow-hidden" style="background: var(--surface); border: 1px solid var(--border);" use:fixedDropdown>
																<div class="p-2" style="border-bottom: 1px solid var(--border);">
																	<input
																		type="text"
																		placeholder="Buscar acomp..."
																		bind:value={searchQuery}
																		on:input={() => handleSearch(weekday, mealType, 1)}
																		class="w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none"
																		style="border: 1px solid var(--border); color: var(--text);"
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
																				style="border-bottom: 1px solid var(--border); color: var(--text);"
																				on:mouseenter={(e) => e.currentTarget.style.background = 'var(--surface-warm)'}
																				on:mouseleave={(e) => e.currentTarget.style.background = 'transparent'}
																			>
																				<p class="text-sm" style="color: var(--text);">{r.name}</p>
																				{#if r.tags}
																					<p class="text-xs mt-0.5" style="color: var(--text-secondary);">{r.tags}</p>
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
										<div class="pt-1 space-y-1"
											style="border-top: 1px solid var(--border);">
											{#each Array(cfg.accompaniment_per_slot) as _, aIdx}
												{@const accSlot = getSlot(weekday, mealType, aIdx, 1)}
												{@const accKey = slotKey(weekday, mealType, aIdx, 1) + '-slot'}
												<div class="dropdown-container relative">
													<button
														on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, aIdx, 1)}
														class="w-full text-left text-xs transition-colors {accSlot?.recipe ? 'px-1 py-1' : 'px-2 py-1.5 rounded-lg'}"
														style="{accSlot?.recipe
															? `color: var(--text-secondary);`
															: `background: var(--surface); border: 2px dashed #b5a898; color: var(--text-muted);`}"
													>
														<span class="{accSlot?.recipe ? '' : 'italic'}" style="font-size: 0.7rem;">
															{accSlot?.recipe?.name ?? '+ acomp. franja'}
														</span>
													</button>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
