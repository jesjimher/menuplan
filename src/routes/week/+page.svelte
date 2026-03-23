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

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
</svelte:head>

<svelte:window on:click={(e) => {
	const target = e.target as HTMLElement;
	if (!target.closest('.dropdown-container')) closeDropdown();
}} />

<div class="flex flex-col h-full" style="background: #f0ebe3; font-family: 'DM Sans', sans-serif;">

	<!-- Cabecera -->
	<header class="bg-white border-b border-stone-200 px-5 py-3 shrink-0">
		<div class="flex flex-wrap items-center gap-2">
			<button on:click={prevWeek}
				class="px-3 py-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors">
				← Anterior
			</button>
			<h1 class="text-lg font-semibold text-stone-900 tracking-tight" style="font-family: 'Lora', serif;">
				Semana {weekKey}
			</h1>
			<button on:click={nextWeek}
				class="px-3 py-1.5 text-sm font-medium text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors">
				Siguiente →
			</button>

			<div class="ml-auto flex gap-1.5 flex-wrap items-center">
				<button on:click={calculatePlan} disabled={calculating}
					class="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors">
					{calculating ? 'Calculando…' : 'Completar huecos'}
				</button>
				<button on:click={recalculatePlan} disabled={calculating}
					class="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors">
					{calculating ? 'Calculando…' : 'Recalcular plan completo'}
				</button>
				<button on:click={copyPrevious}
					class="px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors">
					Copiar semana anterior
				</button>
				<button on:click={clearPlan}
					class="px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors">
					Limpiar
				</button>
			</div>
		</div>
	</header>

	<!-- Banner de violaciones -->
	<div class="mx-5 mt-3 px-4 h-10 flex items-center rounded-xl shrink-0 overflow-hidden {weekData?.violations && weekData.violations.length > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}">
		{#if weekData?.violations && weekData.violations.length > 0}
			<span class="text-xs font-semibold text-red-700 uppercase tracking-wide mr-3 shrink-0">Reglas incumplidas:</span>
			<span class="text-sm text-red-700 truncate">{weekData.violations.map(v => v.message).join(' · ')}</span>
		{:else}
			<span class="text-sm text-green-700">Se cumplen todas las reglas</span>
		{/if}
	</div>

	<!-- Grid semanal -->
	<div class="flex-1 overflow-auto p-4">
		{#if !weekData}
			<div class="text-center py-16 text-stone-500 text-sm">Cargando…</div>
		{:else}
			<!--
				Móvil/tablet: grid de tarjetas (gap-2.5 en todas direcciones).
				Desktop lg: gap-x-2.5 entre columnas, gap-y-0 entre las 3 filas de cada columna.

				Cada wrapper de día usa lg:contents → sus 3 hijos (header, comida, cena) se
				convierten en items directos del grid. Con grid-column/grid-row explícitos,
				cada celda queda en su columna (i+1) y fila (1, 2 o 3), garantizando que
				todas las cenas del grid queden alineadas horizontalmente.

				En móvil/tablet, grid-column y grid-row en hijos de flex son ignorados.
			-->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 lg:gap-y-0">
				{#each [1,2,3,4,5,6,7] as weekday, i}
					{@const date = weekDates[i]}
					{@const isWeekend = i >= 5}
					{@const cardBorder = isWeekend ? 'rgba(100,20,20,0.16)' : 'rgba(0,0,0,0.07)'}
					{@const headerBg = isWeekend ? '#7c2828' : '#1c1814'}
					{@const headerDateColor = isWeekend ? '#d8a090' : '#a09080'}

					<!-- Móvil: tarjeta flex-col. Desktop lg: display:contents (transparente) -->
					<div class="bg-white rounded-2xl overflow-hidden shadow-sm border flex flex-col lg:contents"
						style="border-color: {cardBorder};">

						<!-- Fila 1 en lg: cabecera del día -->
						<div class="px-3 py-2.5 shrink-0 lg:rounded-t-2xl lg:overflow-hidden lg:border lg:border-b-0"
							style="background: {headerBg}; border-color: {cardBorder}; grid-column: {i+1}; grid-row: 1;">
							<p class="font-semibold text-white text-sm" style="font-family: 'Lora', serif;">{WEEKDAY_NAMES[i]}</p>
							{#if date}
								<p class="text-xs" style="color: {headerDateColor};">{date.getUTCDate()} {SHORT_MONTH_NAMES[date.getUTCMonth()]}</p>
							{/if}
						</div>

						<!-- Filas 2 y 3 en lg: comida (j=0 → row 2) y cena (j=1 → row 3) -->
						{#each ['comida', 'cena'] as mealType, j}
							{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
							{@const isComida = mealType === 'comida'}

							<div class="flex-1 flex flex-col lg:flex-none {isComida ? 'lg:border-l lg:border-r' : 'lg:rounded-b-2xl lg:overflow-hidden lg:border lg:border-t-0'}"
								style="background: {isComida ? '#edf3f8' : '#fdf4e6'}; border-color: {cardBorder}; {isComida ? 'border-bottom: 1px solid #c8dce8;' : ''} grid-column: {i+1}; grid-row: {j+2};">

								<!-- Encabezado de franja -->
								<div class="flex items-center gap-1 px-3 py-2"
									style="background: {isComida ? '#d6e6f2' : '#f0deba'};">
									<span class="flex-1 text-xs font-semibold uppercase tracking-wider"
										style="color: {isComida ? '#1e3d5c' : '#6a3008'};">
										{isComida ? '☀ Comida' : '☾ Cena'}
									</span>
									<!-- Contador -->
									<button
										on:click={() => updateConfig(weekday, mealType, 'recipe_count', Math.max(1, cfg.recipe_count - 1))}
										class="w-5 h-5 flex items-center justify-center rounded text-sm leading-none transition-opacity hover:opacity-60"
										style="color: {isComida ? '#2a5070' : '#7a3808'};"
									>−</button>
									<span class="text-xs w-4 text-center tabular-nums"
										style="color: {isComida ? '#2a5070' : '#7a3808'};">{cfg.recipe_count}</span>
									<button
										on:click={() => updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1)}
										class="w-5 h-5 flex items-center justify-center rounded text-sm leading-none transition-opacity hover:opacity-60"
										style="color: {isComida ? '#2a5070' : '#7a3808'};"
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
														class="w-full text-left px-2.5 py-2 rounded-xl text-xs border transition-colors min-h-[2.75rem] pr-14 flex items-start"
														style="{slot?.recipe
															? (isComida
																? 'background:#bdd8ee; border-color:#5a9dc0; color:#0e2840;'
																: 'background:#f0d090; border-color:#c88030; color:#3a1800;')
															: (isComida
																? 'background:transparent; border-style:dashed; border-color:#7aaabf; color:#2a5878;'
																: 'background:transparent; border-style:dashed; border-color:#c89040; color:#7a4408;')}"
													>
														<span class="line-clamp-2 leading-snug {slot?.recipe ? 'font-semibold' : 'italic'}"
															style="{slot?.recipe ? 'font-family: Lora, serif;' : ''}">
															{slot?.recipe?.name ?? 'Sin receta'}
														</span>
													</button>
													<div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/slot:opacity-100 transition-opacity">
														{#if !slotTag && editingTagKey !== slotTagEditKey}
															<button
																on:click|stopPropagation={() => editingTagKey = slotTagEditKey}
																class="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow-sm border border-stone-300 text-stone-600 hover:text-stone-900 hover:border-stone-400 transition-colors text-sm"
																title="Añadir tag requerido"
															>🏷</button>
														{/if}
														<button
															on:click|stopPropagation={() => randomSlot(weekday, mealType as 'comida'|'cena', slotIdx, 0)}
															disabled={busySlots.has(slotKey(weekday, mealType, slotIdx, 0))}
															class="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow-sm border border-stone-300 text-stone-600 hover:text-stone-900 hover:border-stone-400 disabled:opacity-40 disabled:cursor-wait transition-colors text-sm"
															title="Receta aleatoria"
														>{busySlots.has(slotKey(weekday, mealType, slotIdx, 0)) ? '⏳' : '↻'}</button>
														{#if slot?.recipe}
															<a
																href="/recipes?edit={slot.recipe.id}"
																on:click|stopPropagation
																class="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow-sm border border-stone-300 text-stone-500 hover:text-stone-900 hover:border-stone-400 transition-colors text-sm"
																title="Editar receta"
															>✎</a>
															<button
																on:click|stopPropagation={() => removeSlot(weekday, mealType, slotIdx, 0)}
																class="w-6 h-6 flex items-center justify-center rounded-lg bg-white shadow-sm border border-stone-300 text-stone-500 hover:text-red-600 hover:border-red-300 transition-colors text-sm"
																title="Quitar"
															>×</button>
														{/if}
													</div>
												</div>

												<!-- Dropdown búsqueda receta -->
												{#if openDropdown === key}
													<div class="fixed z-[9999] w-72 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden" use:fixedDropdown>
														<div class="p-2 border-b border-stone-100">
															<input
																type="text"
																placeholder="Buscar receta..."
																bind:value={searchQuery}
																on:input={() => handleSearch(weekday, mealType, 0)}
																class="w-full text-sm px-2.5 py-1.5 border border-stone-300 rounded-lg focus:outline-none focus:border-stone-500 text-stone-900 placeholder-stone-500"
																use:focusOnMount
															/>
														</div>
														{#if topRecipes.length > 0 && !searchQuery}
															<div class="px-2 py-1.5 border-b"
																style="background: {isComida ? '#d6e6f2' : '#f0deba'}; border-color: {isComida ? '#b8d0e8' : '#e0c08a'};">
																<p class="text-xs font-semibold mb-1 text-stone-900">Top este día:</p>
																{#each topRecipes as r}
																	<button
																		on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																		class="block w-full text-left text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70 text-stone-900"
																	>{r.name}</button>
																{/each}
															</div>
														{/if}
														<div class="max-h-64 overflow-y-auto">
															{#if searchResults.length === 0}
																<p class="text-xs text-stone-900 px-3 py-3">Sin resultados</p>
															{:else}
																{#each searchResults as r}
																	<button
																		on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																		class="block w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-100 last:border-0 transition-colors"
																	>
																		<p class="text-sm text-stone-900">{r.name}</p>
																		{#if r.tags}
																			<p class="text-xs text-stone-900 mt-0.5">{r.tags}</p>
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
														placeholder="tag requerido…"
														class="w-full text-xs px-2 py-1 border border-stone-400 rounded-lg outline-none bg-white text-stone-900 placeholder-stone-500 focus:border-stone-600"
														on:change={(e) => setRequiredTag(weekday, mealType, slotIdx, e.detail)}
														on:keydown={(e) => {
															if (e.key === 'Escape') editingTagKey = null;
															if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
														}}
													/>
												</div>
											{:else if slotTag}
												<div class="mt-1">
													<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
														style="background: {isComida ? '#a8cce4' : '#e8b860'}; color: {isComida ? '#102840' : '#4a2000'};">
														🏷 {slotTag}
														<button
															on:click|stopPropagation={() => { editingTagKey = slotTagEditKey; }}
															class="hover:opacity-60 transition-opacity"
															title="Editar"
														>✎</button>
														<button
															on:click|stopPropagation={() => setRequiredTag(weekday, mealType, slotIdx, '')}
															class="hover:opacity-60 transition-opacity font-bold"
															title="Quitar"
														>×</button>
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
																class="w-full text-left px-2.5 py-1.5 rounded-xl text-xs border transition-colors pr-8"
																style="{accSlot?.recipe
																	? (isComida
																		? 'background:#cde3f3; border-color:#7ab5d4; color:#182e44;'
																		: 'background:#f5e0b0; border-color:#d4a050; color:#3a2000;')
																	: (isComida
																		? 'background:transparent; border-style:dashed; border-color:#7aaabf; color:#2a5878;'
																		: 'background:transparent; border-style:dashed; border-color:#c89040; color:#7a4408;')}"
															>
																<span class="leading-snug {accSlot?.recipe ? '' : 'italic'}">
																	{accSlot?.recipe?.name ?? '+ acompañamiento'}
																</span>
															</button>
															{#if accSlot?.recipe}
																<div class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/acc:opacity-100 transition-opacity">
																	<button
																		on:click|stopPropagation={() => removeSlot(weekday, mealType, accSlotIdx, 1)}
																		class="w-5 h-5 flex items-center justify-center rounded-lg bg-white shadow-sm border border-stone-300 text-stone-500 hover:text-red-600 hover:border-red-300 transition-colors text-xs"
																	>×</button>
																</div>
															{/if}
														</div>

														{#if openDropdown === accKey}
															<div class="fixed z-[9999] w-72 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden" use:fixedDropdown>
																<div class="p-2 border-b border-stone-100">
																	<input
																		type="text"
																		placeholder="Buscar acompañamiento..."
																		bind:value={searchQuery}
																		on:input={() => handleSearch(weekday, mealType, 1)}
																		class="w-full text-sm px-2.5 py-1.5 border border-stone-300 rounded-lg focus:outline-none focus:border-stone-500 text-stone-900 placeholder-stone-500"
																		use:focusOnMount
																	/>
																</div>
																<div class="max-h-64 overflow-y-auto">
																	{#if searchResults.length === 0}
																		<p class="text-xs text-stone-900 px-3 py-3">Sin resultados</p>
																	{:else}
																		{#each searchResults as r}
																			<button
																				on:click|stopPropagation={() => selectRecipe(weekday, mealType, accSlotIdx, 1, r.id)}
																				class="block w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-100 last:border-0 transition-colors"
																			>
																				<p class="text-sm text-stone-900">{r.name}</p>
																				{#if r.tags}
																					<p class="text-xs text-stone-900 mt-0.5">{r.tags}</p>
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
										<div class="pt-1 border-t space-y-1"
											style="border-color: {isComida ? '#a8c8e0' : '#d0a048'};">
											{#each Array(cfg.accompaniment_per_slot) as _, aIdx}
												{@const accSlot = getSlot(weekday, mealType, aIdx, 1)}
												{@const accKey = slotKey(weekday, mealType, aIdx, 1) + '-slot'}
												<div class="dropdown-container relative">
													<button
														on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, aIdx, 1)}
														class="w-full text-left px-2.5 py-1.5 rounded-xl text-xs border transition-colors"
														style="{accSlot?.recipe
															? (isComida
																? 'background:#cde3f3; border-color:#7ab5d4; color:#182e44;'
																: 'background:#f5e0b0; border-color:#d4a050; color:#3a2000;')
															: (isComida
																? 'background:transparent; border-style:dashed; border-color:#7aaabf; color:#2a5878;'
																: 'background:transparent; border-style:dashed; border-color:#c89040; color:#7a4408;')}"
													>
														<span class="{accSlot?.recipe ? '' : 'italic'}">
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
