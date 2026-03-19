<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeekData, Recipe, Rule } from '$lib/types/index.js';
	import { checkRules } from '$lib/utils/ruleChecker.js';
	import { getWeekKey, getPreviousWeekKey, getWeekDates, WEEKDAY_NAMES, SHORT_MONTH_NAMES } from '$lib/utils/dates.js';

	let weekKey = $state(getWeekKey());
	let weekData = $state<WeekData | null>(null);
	let recipes = $state<Recipe[]>([]);
	let rules = $state<Rule[]>([]);
	let allTags = $state<string[]>([]);
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
		return weekData?.configs[weekday]?.[mealType] ?? { recipe_count: 1, accompaniment_per_recipe: 1, accompaniment_per_slot: 0, required_tag: null };
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

	async function setRequiredTag(weekday: number, mealType: string, tag: string) {
		const value = tag.trim().toLowerCase() || null;
		await fetch('/api/week/config', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekKey, weekday, meal_type: mealType, required_tag: value })
		});
		await loadWeek();
	}

	function closeDropdown() {
		openDropdown = null;
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</svelte:head>

<svelte:window on:click={(e) => {
	const target = e.target as HTMLElement;
	if (!target.closest('.dropdown-container')) closeDropdown();
}} />

<div class="flex flex-col h-full bg-stone-50">

	<!-- Cabecera -->
	<div class="bg-white border-b border-stone-200 px-4 py-3 shrink-0">
		<div class="flex flex-wrap items-center gap-3">
			<button on:click={prevWeek}
				class="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg text-sm font-medium transition-colors">
				← Anterior
			</button>
			<h1 class="text-xl font-bold text-gray-800" style="font-family: 'Playfair Display', serif">
				{weekKey}
			</h1>
			<button on:click={nextWeek}
				class="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg text-sm font-medium transition-colors">
				Siguiente →
			</button>

			<div class="ml-auto flex gap-2 flex-wrap">
				<button on:click={calculatePlan} disabled={calculating}
					class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
					{calculating ? 'Calculando...' : 'Calcular plan'}
				</button>
				<button on:click={clearPlan}
					class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors">
					Limpiar
				</button>
				<button on:click={copyPrevious}
					class="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg text-sm font-medium transition-colors">
					Copiar anterior
				</button>
			</div>
		</div>
	</div>

	<!-- Banner de violaciones -->
	{#if weekData?.violations && weekData.violations.length > 0}
		<div class="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl shrink-0">
			<p class="text-sm font-medium text-red-800 mb-1">Reglas incumplidas:</p>
			<ul class="list-disc list-inside space-y-0.5">
				{#each weekData.violations as v}
					<li class="text-sm text-red-700">{v.message}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Grid semanal -->
	<div class="flex-1 overflow-auto p-4">
		{#if !weekData}
			<div class="text-center py-12 text-stone-400">Cargando...</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
				{#each [1,2,3,4,5,6,7] as weekday, i}
					{@const date = weekDates[i]}
					<div class="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">

						<!-- Cabecera del día -->
						<div class="bg-indigo-50 px-3 py-2 border-b border-indigo-100">
							<p class="font-semibold text-indigo-800 text-sm">{WEEKDAY_NAMES[i]}</p>
							{#if date}
								<p class="text-xs text-indigo-400">{date.getUTCDate()} {SHORT_MONTH_NAMES[date.getUTCMonth()]}</p>
							{/if}
						</div>

						<!-- Comida & Cena -->
						{#each ['comida', 'cena'] as mealType}
							{@const cfg = getDayConfig(weekday, mealType as 'comida' | 'cena')}
							<div class="px-2 py-2 {mealType === 'cena' ? 'border-t border-stone-100' : ''}">
								<div class="flex items-center justify-between mb-1">
									<span class="text-xs font-semibold text-stone-500 uppercase tracking-wide">{mealType === 'comida' ? '🍽️ Comida' : '🌙 Cena'}</span>
									<div class="flex items-center gap-1">
										<button
											on:click={() => updateConfig(weekday, mealType, 'recipe_count', Math.max(1, cfg.recipe_count - 1))}
											class="w-5 h-5 text-xs bg-stone-100 hover:bg-stone-200 rounded flex items-center justify-center text-stone-500 transition-colors"
										>-</button>
										<span class="text-xs text-stone-500 w-4 text-center">{cfg.recipe_count}</span>
										<button
											on:click={() => updateConfig(weekday, mealType, 'recipe_count', cfg.recipe_count + 1)}
											class="w-5 h-5 text-xs bg-stone-100 hover:bg-stone-200 rounded flex items-center justify-center text-stone-500 transition-colors"
										>+</button>
									</div>
								</div>
								<div class="mb-1.5">
									<input
										type="text"
										placeholder="tag requerido…"
										list="all-tags-datalist"
										value={cfg.required_tag ?? ''}
										on:change={(e) => setRequiredTag(weekday, mealType, (e.target as HTMLInputElement).value)}
										on:blur={(e) => setRequiredTag(weekday, mealType, (e.target as HTMLInputElement).value)}
										on:keydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
										class="w-full text-xs px-1.5 py-0.5 border rounded-md outline-none {cfg.required_tag ? 'border-amber-300 bg-amber-50 text-amber-700 placeholder-amber-300' : 'border-stone-200 bg-stone-50 text-stone-400 placeholder-stone-300'}"
									/>
								</div>

								<!-- Slots de receta -->
								{#each Array(cfg.recipe_count) as _, slotIdx}
									{@const slot = getSlot(weekday, mealType, slotIdx, 0)}
									{@const key = slotKey(weekday, mealType, slotIdx, 0)}
									<div class="mb-2">
										<div class="dropdown-container relative">
											<div class="flex items-center gap-1">
												<button
													on:click|stopPropagation={() => openDropdown === key ? closeDropdown() : openSlotDropdown(weekday, mealType, slotIdx, 0)}
													class="flex-1 text-left text-xs px-2 py-1.5 rounded-lg border transition-colors truncate {slot?.recipe ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-stone-50 border-stone-200 text-stone-400'}"
												>
													{slot?.recipe?.name ?? 'Sin receta'}
												</button>
												<button
													on:click={() => randomSlot(weekday, mealType as 'comida'|'cena', slotIdx, 0)}
													disabled={busySlots.has(slotKey(weekday, mealType, slotIdx, 0))}
													class="text-xs px-1.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg disabled:opacity-50 disabled:cursor-wait transition-colors"
													title="Receta aleatoria"
												>{busySlots.has(slotKey(weekday, mealType, slotIdx, 0)) ? '⏳' : '🔄'}</button>
												{#if slot?.recipe}
													<button
														on:click={() => removeSlot(weekday, mealType, slotIdx, 0)}
														class="text-xs px-1.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
														title="Quitar"
													>✕</button>
												{/if}
											</div>

											<!-- Dropdown -->
											{#if openDropdown === key}
												<div class="absolute top-full left-0 z-50 w-72 bg-white border border-stone-200 rounded-xl shadow-xl mt-1 overflow-hidden">
													<div class="p-2 border-b border-stone-100">
														<input
															type="text"
															placeholder="Buscar receta..."
															bind:value={searchQuery}
															on:input={() => handleSearch(weekday, mealType, 0)}
															class="w-full text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-indigo-400"
															autofocus
														/>
													</div>

													{#if topRecipes.length > 0}
														<div class="px-2 py-1.5 bg-amber-50 border-b border-amber-100">
															<p class="text-xs font-semibold text-amber-700 mb-1">Top este día:</p>
															{#each topRecipes as r}
																<button
																	on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																	class="block w-full text-left text-xs px-2 py-1 hover:bg-amber-100 rounded-lg text-amber-800 transition-colors"
																>{r.name}</button>
															{/each}
														</div>
													{/if}

													<div class="max-h-48 overflow-y-auto">
														{#if searchResults.length === 0}
															<p class="text-xs text-stone-400 px-3 py-2">Sin resultados</p>
														{:else}
															{#each searchResults as r}
																<button
																	on:click|stopPropagation={() => selectRecipe(weekday, mealType, slotIdx, 0, r.id)}
																	class="block w-full text-left px-3 py-1.5 hover:bg-stone-50 border-b border-stone-50 last:border-0 transition-colors"
																>
																	<p class="text-sm text-gray-800">{r.name}</p>
																	{#if r.tags}
																		<p class="text-xs text-stone-400">{r.tags}</p>
																	{/if}
																</button>
															{/each}
														{/if}
													</div>
												</div>
											{/if}
										</div>

										<!-- Acompañamientos por receta -->
										{#if cfg.accompaniment_per_recipe > 0}
											{#each Array(cfg.accompaniment_per_recipe) as _, aIdx}
												{@const accSlotIdx = slotIdx * cfg.accompaniment_per_recipe + aIdx}
												{@const accSlot = getSlot(weekday, mealType, accSlotIdx, 1)}
												{@const accKey = slotKey(weekday, mealType, accSlotIdx, 1)}
												<div class="mt-1 ml-3 dropdown-container relative">
													<div class="flex items-center gap-1">
														<button
															on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, accSlotIdx, 1)}
															class="flex-1 text-left text-xs px-2 py-1 rounded-lg border transition-colors truncate {accSlot?.recipe ? 'bg-green-50 border-green-200 text-green-800' : 'bg-stone-50 border-stone-200 text-stone-400'}"
														>
															🥗 {accSlot?.recipe?.name ?? 'Acomp.'}
														</button>
														{#if accSlot?.recipe}
															<button
																on:click={() => removeSlot(weekday, mealType, accSlotIdx, 1)}
																class="text-xs px-1 py-1 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors"
															>✕</button>
														{/if}
													</div>

													{#if openDropdown === accKey}
														<div class="absolute top-full left-0 z-50 w-72 bg-white border border-stone-200 rounded-xl shadow-xl mt-1 overflow-hidden">
															<div class="p-2 border-b border-stone-100">
																<input
																	type="text"
																	placeholder="Buscar acompañamiento..."
																	bind:value={searchQuery}
																	on:input={() => handleSearch(weekday, mealType, 1)}
																	class="w-full text-sm px-2 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:border-indigo-400"
																	autofocus
																/>
															</div>
															<div class="max-h-48 overflow-y-auto">
																{#if searchResults.length === 0}
																	<p class="text-xs text-stone-400 px-3 py-2">Sin resultados</p>
																{:else}
																	{#each searchResults as r}
																		<button
																			on:click|stopPropagation={() => selectRecipe(weekday, mealType, accSlotIdx, 1, r.id)}
																			class="block w-full text-left px-3 py-1.5 hover:bg-stone-50 border-b border-stone-50 last:border-0 transition-colors"
																		>
																			<p class="text-sm text-gray-800">{r.name}</p>
																			{#if r.tags}
																				<p class="text-xs text-stone-400">{r.tags}</p>
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
									<div class="mt-1 pt-1 border-t border-stone-100">
										{#each Array(cfg.accompaniment_per_slot) as _, aIdx}
											{@const accSlot = getSlot(weekday, mealType, aIdx, 1)}
											{@const accKey = slotKey(weekday, mealType, aIdx, 1) + '-slot'}
											<div class="dropdown-container relative mb-1">
												<div class="flex items-center gap-1">
													<button
														on:click|stopPropagation={() => openDropdown === accKey ? closeDropdown() : openSlotDropdown(weekday, mealType, aIdx, 1)}
														class="flex-1 text-left text-xs px-2 py-1 rounded-lg border transition-colors truncate {accSlot?.recipe ? 'bg-green-50 border-green-200 text-green-800' : 'bg-stone-50 border-stone-200 text-stone-400'}"
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
</div>

<datalist id="all-tags-datalist">
	{#each allTags as tag}
		<option value={tag} />
	{/each}
</datalist>
