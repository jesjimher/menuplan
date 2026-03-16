<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeekData, Recipe, Rule } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, WEEKDAY_NAMES, SHORT_MONTH_NAMES } from '$lib/utils/dates.js';

	let weekKey = $state(getWeekKey());
	let weekData = $state<WeekData | null>(null);
	let recipes = $state<Recipe[]>([]);
	let rules = $state<Rule[]>([]);
	let calculating = $state(false);
	let busySlots = $state(new Set<string>());

	// Recipe search state per slot
	let openDropdown = $state<string | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<Recipe[]>([]);
	let topRecipes = $state<Recipe[]>([]);
	let searchTimeout: ReturnType<typeof setTimeout>;

	let weekDates = $derived(getWeekDates(weekKey));

	onMount(async () => {
		await Promise.all([loadWeek(), loadRecipes(), loadRules()]);
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
		return weekData?.configs[weekday]?.[mealType] ?? { recipe_count: 1, accompaniment_per_recipe: 1, accompaniment_per_slot: 0 };
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

	// Actualiza un slot localmente y recalcula violaciones — crea siempre referencias nuevas
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

	// Recalcula UNA receta en el servidor y actualiza solo ese slot
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

	function closeDropdown() {
		openDropdown = null;
	}
</script>

<svelte:window on:click={(e) => {
	const target = e.target as HTMLElement;
	if (!target.closest('.dropdown-container')) closeDropdown();
}} />

<div class="p-4 max-w-full">
	<!-- Header -->
	<div class="flex flex-wrap items-center gap-3 mb-4">
		<button on:click={prevWeek} class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">← Anterior</button>
		<h1 class="text-xl font-bold text-gray-800">{weekKey}</h1>
		<button on:click={nextWeek} class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-sm">Siguiente →</button>

		<div class="ml-auto flex gap-2 flex-wrap">
			<button on:click={calculatePlan} disabled={calculating} class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-50">
				{calculating ? 'Calculando...' : 'Calcular plan'}
			</button>
			<button on:click={clearPlan} class="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm">Limpiar</button>
			<button on:click={copyPrevious} class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm">Copiar anterior</button>
		</div>
	</div>

	<!-- Rule violations banner -->
	{#if weekData?.violations && weekData.violations.length > 0}
		<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
			<p class="text-sm font-medium text-red-800 mb-1">Reglas incumplidas:</p>
			<ul class="list-disc list-inside space-y-1">
				{#each weekData.violations as v}
					<li class="text-sm text-red-700">{v.message}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Week grid -->
	{#if !weekData}
		<div class="text-center py-12 text-gray-500">Cargando...</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
			{#each [1,2,3,4,5,6,7] as weekday, i}
				{@const date = weekDates[i]}
				<div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
					<!-- Day header -->
					<div class="bg-indigo-50 px-3 py-2 border-b border-indigo-100">
						<p class="font-semibold text-indigo-800 text-sm">{WEEKDAY_NAMES[i]}</p>
						{#if date}
							<p class="text-xs text-indigo-500">{date.getUTCDate()} {SHORT_MONTH_NAMES[date.getUTCMonth()]}</p>
						{/if}
					</div>

					<!-- Comida & Cena -->
					{#each ['comida', 'cena'] as mealType}
						{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
						<div class="px-2 py-2 {mealType === 'cena' ? 'border-t border-gray-100' : ''}">
							<div class="flex items-center justify-between mb-1.5">
								<span class="text-xs font-semibold text-gray-500 uppercase">{mealType === 'comida' ? '🍽️ Comida' : '🌙 Cena'}</span>
								<div class="flex items-center gap-1">
									<button
										on:click={() => updateConfig(weekday, mealType, 'recipe_count', Math.max(1, cfg.recipe_count - 1))}
										class="w-5 h-5 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
									>-</button>
									<span class="text-xs text-gray-600 w-4 text-center">{cfg.recipe_count}</span>
									<button
										on:click={() => updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1)}
										class="w-5 h-5 text-xs bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
									>+</button>
								</div>
							</div>

							<!-- Recipe slots -->
							{#each Array(cfg.recipe_count) as _, slotIdx}
								{@const slot = getSlot(weekday, mealType, slotIdx, 0)}
								{@const key = slotKey(weekday, mealType, slotIdx, 0)}
								<div class="mb-2">
									<div class="dropdown-container relative">
										<div class="flex items-center gap-1">
											<button
												on:click|stopPropagation={() => openDropdown === key ? closeDropdown() : openSlotDropdown(weekday, mealType, slotIdx, 0)}
												class="flex-1 text-left text-xs px-2 py-1.5 rounded border {slot?.recipe ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-gray-50 border-gray-200 text-gray-400'} truncate"
											>
												{slot?.recipe?.name ?? 'Sin receta'}
											</button>
											<button
												on:click={() => randomSlot(weekday, mealType as 'comida'|'cena', slotIdx, 0)}
												disabled={busySlots.has(slotKey(weekday, mealType, slotIdx, 0))}
												class="text-xs px-1.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded disabled:opacity-50 disabled:cursor-wait"
												title="Receta aleatoria"
											>{busySlots.has(slotKey(weekday, mealType, slotIdx, 0)) ? '⏳' : '🔄'}</button>
											{#if slot?.recipe}
												<button
													on:click={() => removeSlot(weekday, mealType, slotIdx, 0)}
													class="text-xs px-1.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded"
													title="Quitar"
												>✕</button>
											{/if}
										</div>

										<!-- Dropdown -->
										{#if openDropdown === key}
											<div class="absolute top-full left-0 z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-xl mt-1 overflow-hidden">
												<div class="p-2 border-b">
													<input
														type="text"
														placeholder="Buscar receta..."
														bind:value={searchQuery}
														on:input={() => handleSearch(weekday, mealType, 0)}
														class="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:border-indigo-400"
														autofocus
													/>
												</div>

												{#if topRecipes.length > 0}
													<div class="px-2 py-1.5 bg-amber-50 border-b">
														<p class="text-xs font-semibold text-amber-700 mb-1">Top este día:</p>
														{#each topRecipes as r}
															<button
																on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																class="block w-full text-left text-xs px-2 py-1 hover:bg-amber-100 rounded text-amber-800"
															>{r.name}</button>
														{/each}
													</div>
												{/if}

												<div class="max-h-48 overflow-y-auto">
													{#if searchResults.length === 0}
														<p class="text-xs text-gray-400 px-3 py-2">Sin resultados</p>
													{:else}
														{#each searchResults as r}
															<button
																on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																class="block w-full text-left px-3 py-1.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
															>
																<p class="text-sm text-gray-800">{r.name}</p>
																{#if r.tags}
																	<p class="text-xs text-gray-400">{r.tags}</p>
																{/if}
															</button>
														{/each}
													{/if}
												</div>
											</div>
										{/if}
									</div>

									<!-- Accompaniments per recipe -->
									{#if cfg.accompaniment_per_recipe > 0}
										{#each Array(cfg.accompaniment_per_recipe) as _, aIdx}
											{@const accSlotIdx = slotIdx * cfg.accompaniment_per_recipe + aIdx}
											{@const accSlot = getSlot(weekday, mealType, accSlotIdx, 1)}
											{@const accKey = slotKey(weekday, mealType, accSlotIdx, 1)}
											<div class="mt-1 ml-3 dropdown-container relative">
												<div class="flex items-center gap-1">
													<button
														on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, accSlotIdx, 1)}
														class="flex-1 text-left text-xs px-2 py-1 rounded border {accSlot?.recipe ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-400'} truncate"
													>
														🥗 {accSlot?.recipe?.name ?? 'Acomp.'}
													</button>
													{#if accSlot?.recipe}
														<button
															on:click={() => removeSlot(weekday, mealType, accSlotIdx, 1)}
															class="text-xs px-1 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded"
														>✕</button>
													{/if}
												</div>

												{#if openDropdown === accKey}
													<div class="absolute top-full left-0 z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-xl mt-1 overflow-hidden">
														<div class="p-2 border-b">
															<input
																type="text"
																placeholder="Buscar acompañamiento..."
																bind:value={searchQuery}
																on:input={() => handleSearch(weekday, mealType, 1)}
																class="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:border-indigo-400"
																autofocus
															/>
														</div>
														<div class="max-h-48 overflow-y-auto">
															{#if searchResults.length === 0}
																<p class="text-xs text-gray-400 px-3 py-2">Sin resultados</p>
															{:else}
																{#each searchResults as r}
																	<button
																		on:click|stopPropagation={() => selectRecipe(weekday, mealType, accSlotIdx, 1, r.id)}
																		class="block w-full text-left px-3 py-1.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
																	>
																		<p class="text-sm text-gray-800">{r.name}</p>
																		{#if r.tags}
																			<p class="text-xs text-gray-400">{r.tags}</p>
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

							<!-- Accompaniments per slot -->
							{#if cfg.accompaniment_per_slot > 0}
								<div class="mt-1 pt-1 border-t border-gray-100">
									{#each Array(cfg.accompaniment_per_slot) as _, aIdx}
										{@const accSlot = getSlot(weekday, mealType, aIdx, 1)}
										{@const accKey = slotKey(weekday, mealType, aIdx, 1) + '-slot'}
										<div class="dropdown-container relative mb-1">
											<div class="flex items-center gap-1">
												<button
													on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, aIdx, 1)}
													class="flex-1 text-left text-xs px-2 py-1 rounded border {accSlot?.recipe ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-400'} truncate"
												>
													🥗 {accSlot?.recipe?.name ?? 'Acomp. franja'}
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
