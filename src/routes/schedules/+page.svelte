<script lang="ts">
	import type { ScheduleWithRecipe, ScheduleConflictMode } from '$lib/types/index.js';
	import { weekKeyToIndex, indexToWeekKey, getWeekKey, getWeekDates, WEEKDAY_NAMES } from '$lib/utils/dates.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { sidebarOpen } from '$lib/stores/ui.js';
	const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

	const CONFLICT_LABELS: Record<ScheduleConflictMode, string> = {
		skip: 'Saltar si ocupado',
		overwrite: 'Sobreescribir',
		add: 'Añadir junto',
	};

	let { data } = $props();
	let schedules = $state<ScheduleWithRecipe[]>(data.schedules);
	$effect(() => { schedules = data.schedules; });

	// ---- Modal state ----
	let editScheduleId = $state<number | null>(null);
	let editN = $state(1);
	let editOnConflict = $state<ScheduleConflictMode>('skip');
	let editPriority = $state(5);

	let editSchedule = $derived(
		editScheduleId !== null ? (schedules.find(s => s.id === editScheduleId) ?? null) : null
	);

	function openModal(s: ScheduleWithRecipe) {
		editScheduleId = s.id;
		editN = s.every_n_weeks;
		editOnConflict = s.on_conflict ?? 'skip';
		editPriority = s.priority ?? 5;
	}

	function closeModal() {
		editScheduleId = null;
	}

	async function saveModal() {
		if (!editSchedule) return;
		await fetch('/api/schedules', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				recipe_id: editSchedule.recipe_id, weekday: editSchedule.weekday, meal_type: editSchedule.meal_type,
				is_accompaniment: editSchedule.is_accompaniment,
				every_n_weeks: editN, anchor_week_key: editSchedule.anchor_week_key,
				on_conflict: editOnConflict, priority: editPriority,
			})
		});
		closeModal();
		await invalidateAll();
	}

	async function deleteSchedule(id: number) {
		if (!confirm('¿Eliminar esta programación?')) return;
		closeModal();
		await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function deleteException(scheduleId: number, weekKey: string) {
		await fetch(`/api/schedules/${scheduleId}/exceptions`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ week_key: weekKey })
		});
		await invalidateAll();
	}

	// ---- Color palette (stable by recipe_id) ----
	const PALETTE = ['#3B82F6','#EC4899','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#84CC16','#F97316','#6366F1'];

	let recipeColorMap = $derived.by(() => {
		const ids = [...new Set(schedules.map(s => s.recipe_id))].sort((a, b) => a - b);
		return new Map(ids.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
	});

	function rc(id: number): string { return recipeColorMap.get(id) ?? '#94A3B8'; }
	function rgba(hex: string, a: number): string {
		return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
	}

	// ---- Weekly grid ----
	const DAY_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
	const MEAL_TYPES: ('comida'|'cena')[] = ['comida','cena'];

	function dayMealSchedules(wd: number, mt: string): ScheduleWithRecipe[] {
		return schedules.filter(s => s.weekday === wd && s.meal_type === mt);
	}

	// ---- Simulation ----
	const SIM_N = 9;
	const currentWeek = getWeekKey();
	const baseIdx = weekKeyToIndex(currentWeek);
	const simWeeks = Array.from({length: SIM_N}, (_, i) => indexToWeekKey(baseIdx + i));

	function isActive(s: ScheduleWithRecipe, wk: string): boolean {
		const diff = weekKeyToIndex(wk) - weekKeyToIndex(s.anchor_week_key);
		return diff >= 0 && diff % s.every_n_weeks === 0 && !s.exceptions.includes(wk);
	}

	function cellActive(wd: number, mt: string, wk: string): ScheduleWithRecipe[] {
		return previewSchedules.filter(s => s.weekday === wd && s.meal_type === mt && isActive(s, wk));
	}

	function wkLabel(wk: string): string {
		const d = getWeekDates(wk)[0];
		return `${d.getUTCDate()}/${d.getUTCMonth()+1}`;
	}

	const STOP_WORDS = new Set(['el','la','los','las','un','una','unos','unas','con','al','a','de','del','en','y','e','o','u','lo','sin','por','para','sobre','bajo','ante','tras']);

	function simplifyName(name: string): string {
		const words = name.split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()));
		return words.slice(0, 3).join(' ') || name;
	}

	// ---- Drag & drop (vista semanal -> mover a otro día) ----
	let draggedSchedule = $state<ScheduleWithRecipe | null>(null);
	let dragOverDay = $state<number | null>(null);

	let previewSchedules = $derived.by(() => {
		if (!draggedSchedule || dragOverDay === null || dragOverDay === draggedSchedule.weekday) return schedules;
		return schedules.map(s => s.id === draggedSchedule!.id ? { ...s, weekday: dragOverDay! } : s);
	});

	function handleDragStart(e: DragEvent, s: ScheduleWithRecipe) {
		draggedSchedule = s;
		e.dataTransfer?.setData('text/plain', String(s.id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function handleDragEnd() {
		draggedSchedule = null;
		dragOverDay = null;
	}

	function handleDragOver(e: DragEvent, wd: number, mt: string) {
		if (!draggedSchedule || draggedSchedule.meal_type !== mt) return;
		e.preventDefault();
		dragOverDay = wd;
	}

	async function handleDrop(e: DragEvent, wd: number, mt: string) {
		e.preventDefault();
		const s = draggedSchedule;
		draggedSchedule = null;
		dragOverDay = null;
		if (!s || s.meal_type !== mt || s.weekday === wd) return;
		const res = await fetch(`/api/schedules/${s.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ weekday: wd })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			alert(body?.message ?? 'No se pudo mover la programación a ese día.');
			return;
		}
		await invalidateAll();
	}
</script>

{#snippet chip(s: ScheduleWithRecipe)}
	<div class="mb-1.5" draggable="true"
		on:dragstart={(e) => handleDragStart(e, s)}
		on:dragend={handleDragEnd}>
		<div class="flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-opacity"
			style="background:{rgba(rc(s.recipe_id),0.12)};border:1px solid {rgba(rc(s.recipe_id),0.28)};opacity:{draggedSchedule?.id === s.id ? 0.4 : 1};">
			<button class="text-[11px] font-semibold flex-1 min-w-0 truncate text-left hover:underline"
				style="color:var(--text);" title={s.recipe.name}
				on:click={() => openModal(s)}>
				{s.recipe.name}
			</button>
			<span class="text-[10px] font-bold shrink-0 px-1 rounded"
				style="background:{rgba(rc(s.recipe_id),0.18)};color:{rc(s.recipe_id)};"
				title="Prioridad: {s.priority ?? 5}">
				{s.every_n_weeks}s
			</span>
			{#if (s.on_conflict ?? 'skip') !== 'skip'}
				<span class="text-[9px] font-bold shrink-0 px-1 rounded"
					style="background:var(--surface-container-highest);color:var(--text-muted);"
					title="Conflicto: {CONFLICT_LABELS[s.on_conflict ?? 'skip']}">
					{s.on_conflict === 'overwrite' ? '↑' : '+'}
				</span>
			{/if}
			<button on:click={() => openModal(s)}
				class="w-4 h-4 flex items-center justify-center rounded transition-opacity opacity-50 hover:opacity-100"
				style="color:var(--text-muted);" title="Editar">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3">
					<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
					<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
				</svg>
			</button>
			<button on:click={() => deleteSchedule(s.id)}
				class="w-4 h-4 flex items-center justify-center rounded transition-opacity opacity-50 hover:opacity-100"
				style="color:var(--error);" title="Eliminar">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3 h-3">
					<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>
	</div>
{/snippet}

<!-- Cabecera -->
<header class="sticky top-0 z-10 px-4 sm:px-6 py-3 shrink-0" style="background: rgba(255,248,243,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--surface-container-highest);">
	<div class="max-w-4xl mx-auto flex items-center gap-3">
		<button class="lg:hidden p-1.5 rounded-lg transition-colors shrink-0"
			style="color: var(--primary);"
			on:click={() => $sidebarOpen = true}>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		<div class="flex-1 min-w-0">
			<h1 class="text-xl sm:text-2xl font-black tracking-tight leading-none" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">Programaciones</h1>
			<p class="text-xs mt-0.5" style="color: var(--text-secondary);">Recetas que se planifican automáticamente en intervalos regulares.</p>
		</div>
	</div>
</header>

<div class="px-3 sm:px-4 py-6">

	{#if schedules.length === 0}
		<div class="text-center py-16 rounded-2xl" style="background:var(--surface-container-low);color:var(--text-muted);">
			<svg class="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="4" width="18" height="18" rx="2"/>
				<line x1="16" y1="2" x2="16" y2="6"/>
				<line x1="8" y1="2" x2="8" y2="6"/>
				<line x1="3" y1="10" x2="21" y2="10"/>
			</svg>
			<p class="font-semibold">No hay programaciones activas</p>
			<p class="text-xs mt-1">Usa el icono de calendario en los slots de la vista semanal para programar recetas.</p>
		</div>
	{:else}

		<!-- ===== VISTA SEMANAL ===== -->
		<section class="mb-10">
			<h2 class="text-[11px] font-bold uppercase tracking-wider mb-3" style="color:var(--text-muted);">
				Vista semanal
			</h2>
			<div class="grid gap-2" style="grid-template-columns:repeat(7,1fr);">
				{#each [1,2,3,4,5,6,7] as wd, i}
					<div class="rounded-xl overflow-hidden flex flex-col min-w-0" style="background:var(--surface);">
							<div class="py-2 text-center text-xs font-bold"
								style="background:var(--surface-container);color:var(--text);">
								{DAY_SHORT[i]}
							</div>
							{#each MEAL_TYPES as mt, mi}
								{#if mi > 0}
									<div class="mx-2 border-t" style="border-color:var(--surface-container-low);"></div>
								{/if}
								<div class="px-2 py-2 rounded-lg transition-colors"
									style="background:{draggedSchedule && draggedSchedule.meal_type === mt && dragOverDay === wd ? 'var(--primary-container, #e8f0fe)' : 'transparent'};"
									on:dragover={(e) => handleDragOver(e, wd, mt)}
									on:drop={(e) => handleDrop(e, wd, mt)}>
									<p class="text-[9px] font-bold uppercase tracking-widest mb-1.5" style="color:var(--text-muted);">
										{mt}
									</p>
									{#each dayMealSchedules(wd, mt) as s (s.id)}
										{@render chip(s)}
									{/each}
									{#if dayMealSchedules(wd, mt).length === 0}
										<div class="h-7 rounded opacity-20" style="background:var(--surface-container-low);"></div>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
		</section>

		<!-- ===== SIMULACIÓN ===== -->
		<section>
			<h2 class="text-[11px] font-bold uppercase tracking-wider mb-1" style="color:var(--text-muted);">
				Simulación · próximas 9 semanas
			</h2>
			<p class="text-xs mb-4" style="color:var(--text-secondary);">
				Cada fila es una semana. En cada celda, la parte superior es comida y la inferior es cena.
			</p>

			<div class="rounded-xl px-4 py-3" style="background:var(--surface);">
					<div class="mb-2 pb-2" style="display:grid;grid-template-columns:52px repeat(7,1fr);gap:8px;border-bottom:1px solid var(--surface-container);">
						<div class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted);">Semana</div>
						{#each DAY_SHORT as day}
							<div class="text-center text-xs font-bold" style="color:var(--text-secondary);">{day}</div>
						{/each}
					</div>

					{#each simWeeks as wk, wi}
						{@const mon = getWeekDates(wk)[0]}
						{@const prevMon = wi > 0 ? getWeekDates(simWeeks[wi - 1])[0] : null}
						{@const isNewMonth = wi === 0 || mon.getUTCMonth() !== prevMon!.getUTCMonth()}
						{#if isNewMonth}
							<div class="flex items-center gap-2 {wi > 0 ? 'mt-2' : ''} mb-1">
								<div class="h-px" style="width:52px;"></div>
								<div class="h-px flex-1" style="background:var(--text-muted);opacity:0.35;"></div>
								<span class="text-[10px] font-bold uppercase tracking-wider shrink-0" style="color:var(--text-muted);">
									{MONTH_NAMES[mon.getUTCMonth()]}
								</span>
								<div class="h-px flex-1" style="background:var(--text-muted);opacity:0.35;"></div>
							</div>
						{/if}
						<div class="py-0.5 rounded-md" style="display:grid;grid-template-columns:52px repeat(7,1fr);gap:8px;background:{wk === currentWeek ? 'var(--primary-container, #e8f0fe)' : 'transparent'};">
							<div class="text-[11px] text-right pr-1 flex items-center justify-end"
								style="color:{wk === currentWeek ? 'var(--primary)' : 'var(--text-muted)'};font-weight:{wk === currentWeek ? '700' : '400'};">
								{wkLabel(wk)}
							</div>
							{#each [1,2,3,4,5,6,7] as wd}
								{@const comida = cellActive(wd, 'comida', wk)}
								{@const cena = cellActive(wd, 'cena', wk)}
								<div class="relative group rounded overflow-hidden flex flex-col min-w-0">
									<button class="absolute top-0.5 right-0.5 z-10 w-5 h-5 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
										style="background:var(--primary);color:white;"
										title="Ir a la semana del {wkLabel(wk)}"
										on:click|stopPropagation={() => goto(`/week?weekKey=${wk}`)}>
										<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
										</svg>
									</button>
									<div class="px-1.5 py-1 flex flex-col gap-0.5" style="background:var(--surface-container-low);min-height:22px;">
										{#each comida as s}
											<button class="text-[11px] font-semibold leading-tight truncate text-left hover:underline"
												style="color:{rc(s.recipe_id)};" title={s.recipe.name}
												on:click={() => openModal(s)}>
												{simplifyName(s.recipe.name)}
											</button>
										{/each}
									</div>
									<div class="px-1.5 py-1 flex flex-col gap-0.5" style="background:var(--surface-container);min-height:22px;">
										{#each cena as s}
											<button class="text-[11px] font-semibold leading-tight truncate text-left hover:underline"
												style="color:{rc(s.recipe_id)};" title={s.recipe.name}
												on:click={() => openModal(s)}>
												{simplifyName(s.recipe.name)}
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
		</section>
	{/if}
</div>

<!-- ===== MODAL DE EDICIÓN ===== -->
{#if editSchedule}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background:rgba(0,0,0,0.45);"
		on:click|self={closeModal}
		role="dialog" aria-modal="true">
		<div class="rounded-2xl shadow-2xl w-full max-w-sm" style="background:var(--surface);">

			<!-- Header -->
			<div class="flex items-start gap-3 px-5 pt-5 pb-4" style="border-bottom:1px solid var(--surface-container-low);">
				<div class="w-3 h-3 rounded-full mt-1 shrink-0" style="background:{rc(editSchedule.recipe_id)};"></div>
				<div class="flex-1 min-w-0">
					<p class="font-bold text-base leading-tight" style="color:var(--text);">{editSchedule.recipe.name}</p>
					<p class="text-xs mt-0.5" style="color:var(--text-secondary);">
						{WEEKDAY_NAMES[editSchedule.weekday - 1]}, {editSchedule.meal_type}
					</p>
				</div>
				<button on:click={closeModal}
					class="w-7 h-7 flex items-center justify-center rounded-full shrink-0 text-lg leading-none"
					style="color:var(--text-muted);background:var(--surface-container-low);">&times;</button>
			</div>

			<!-- Frecuencia -->
			<div class="px-5 py-4" style="border-bottom:1px solid var(--surface-container-low);">
				<p class="text-[11px] font-bold uppercase tracking-wider mb-3" style="color:var(--text-muted);">Frecuencia</p>
				<div class="flex items-center gap-3">
					<span class="text-sm" style="color:var(--text);">Cada</span>
					<input type="number" min="1" max="52" bind:value={editN}
						class="w-16 px-2 py-1.5 rounded-lg text-center text-sm font-bold border-2 outline-none"
						style="background:var(--surface-container-low);color:var(--text);border-color:var(--primary);"/>
					<span class="text-sm" style="color:var(--text);">semanas</span>
				</div>
			</div>

			<!-- Conflicto y prioridad -->
			<div class="px-5 py-4" style="border-bottom:1px solid var(--surface-container-low);">
				<p class="text-[11px] font-bold uppercase tracking-wider mb-3" style="color:var(--text-muted);">Si el slot ya tiene receta</p>
				<div class="flex flex-col gap-1.5 mb-4">
					{#each ([['skip','Saltar'],['overwrite','Sobreescribir'],['add','Añadir junto']] as const) as [val, label]}
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="radio" name="edit_on_conflict" value={val} bind:group={editOnConflict} class="accent-[var(--primary)]" />
							<span class="text-sm" style="color:var(--text);">{label}</span>
						</label>
					{/each}
				</div>
				<p class="text-[11px] font-bold uppercase tracking-wider mb-2" style="color:var(--text-muted);">Prioridad</p>
				<input type="range" min="1" max="10" bind:value={editPriority}
					class="w-full accent-[var(--primary)]"/>
				<div class="flex justify-between text-xs mt-1" style="color:var(--text-muted);">
					<span>Menos prioritaria</span>
					<span>Más prioritaria</span>
				</div>
			</div>

			<!-- Excepciones -->
			{#if editSchedule.exceptions.length > 0}
				<div class="px-5 py-4" style="border-bottom:1px solid var(--surface-container-low);">
					<p class="text-[11px] font-bold uppercase tracking-wider mb-2" style="color:var(--text-muted);">Semanas excluidas</p>
					<div class="flex flex-wrap gap-1.5">
						{#each editSchedule.exceptions as ex}
							<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
								style="background:var(--surface-container-highest);color:var(--text-secondary);">
								{ex}
								<button on:click={() => deleteException(editSchedule!.id, ex)}
									class="font-bold hover:opacity-60 leading-none">&times;</button>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Acciones -->
			<div class="flex items-center gap-2 px-5 py-4">
				<button on:click={() => deleteSchedule(editSchedule!.id)}
					class="text-sm font-semibold px-3 py-1.5 rounded-lg"
					style="color:var(--error);background:var(--error-container,#fce8e8);">
					Eliminar
				</button>
				<div class="flex-1"></div>
				<button on:click={closeModal}
					class="text-sm px-3 py-1.5 rounded-lg"
					style="color:var(--text-secondary);background:var(--surface-container-low);">
					Cancelar
				</button>
				<button on:click={saveModal}
					class="text-sm font-bold px-4 py-1.5 rounded-lg"
					style="background:var(--primary);color:white;">
					Guardar
				</button>
			</div>
		</div>
	</div>
{/if}
