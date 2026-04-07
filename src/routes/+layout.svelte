<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { sidebarOpen, sidebarCollapsed } from '$lib/stores/ui.js';
	import type { Options } from '$lib/types/index.js';

	interface LayoutData {
		options?: Options;
	}

	let { data } = $props<{ data: LayoutData }>();

	$effect(() => {
		if (data.options?.sidebar_collapsed_by_default !== undefined) {
			sidebarCollapsed.set(data.options.sidebar_collapsed_by_default);
		}
	});

	const navItems = [
		{ href: '/week', label: 'Semana', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
		{ href: '/recipes', label: 'Recetas', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
		{ href: '/members', label: 'Miembros', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
		{ href: '/rules', label: 'Reglas', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
		{ href: '/history', label: 'Histórico', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
		{ href: '/options', label: 'Opciones', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
	];

	const currentPath = $derived($page.url.pathname);
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--background);">
	<!-- Sidebar overlay para móvil -->
	{#if $sidebarOpen}
		<div class="fixed inset-0 z-20 bg-black/20 lg:hidden" on:click={() => $sidebarOpen = false}></div>
	{/if}

	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-30 flex flex-col transform transition-all duration-200 ease-in-out lg:relative lg:translate-x-0 {$sidebarOpen ? 'translate-x-0' : '-translate-x-full'} {$sidebarCollapsed ? 'lg:w-20' : 'w-64'}"
		style="background: var(--surface-container-low);">

		<!-- Logo -->
		<div class="flex items-center justify-between h-20 px-6 shrink-0">
			<div class:hidden={$sidebarCollapsed}>
				<h1 class="text-xl font-black tracking-tight leading-none" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">MenuPlan</h1>
				<p class="text-[10px] font-bold tracking-widest uppercase mt-1" style="color: var(--text-secondary);">Planificador culinario</p>
			</div>
			<button class="p-2 rounded-lg hover:bg-white/5 transition-colors" 
				style="color: var(--text-secondary);"
				on:click={() => $sidebarCollapsed = !$sidebarCollapsed}
				aria-label={$sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}>
				<svg class="w-5 h-5 transition-transform {$sidebarCollapsed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
				</svg>
			</button>
		</div>

		<!-- Navegación -->
		<nav class="flex-1 px-3 py-2 space-y-0.5">
			{#each navItems as item}
				<div class="relative group">
					<a
						href={item.href}
						class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors {$sidebarCollapsed ? 'justify-center' : ''}"
						style="{currentPath.startsWith(item.href)
							? `background: var(--surface-container); color: var(--primary);`
							: `color: var(--text-secondary);`}"
						on:click={() => $sidebarOpen = false}
						on:mouseenter={(e) => { if (!currentPath.startsWith(item.href)) e.currentTarget.style.background = 'var(--surface-container)'; }}
						on:mouseleave={(e) => { if (!currentPath.startsWith(item.href)) e.currentTarget.style.background = 'transparent'; }}
					>
						<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={item.icon} />
						</svg>
						<span class:hidden={$sidebarCollapsed} style="font-family: 'Epilogue', sans-serif;">{item.label}</span>
					</a>
					{#if $sidebarCollapsed}
						<span class="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded bg-slate-800 text-white text-xs whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
							{item.label}
						</span>
					{/if}
				</div>
			{/each}
		</nav>
	</aside>

	<!-- Contenido principal -->
	<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
		<main class="flex-1 overflow-auto">
			<slot />
		</main>
	</div>
</div>
