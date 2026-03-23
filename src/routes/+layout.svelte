<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let sidebarOpen = false;

	const navItems = [
		{ href: '/week', label: 'Semana', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
		{ href: '/recipes', label: 'Recetas', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
		{ href: '/members', label: 'Miembros', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
		{ href: '/rules', label: 'Reglas', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
		{ href: '/history', label: 'Histórico', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
		{ href: '/options', label: 'Opciones', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
	];

	$: currentPath = $page.url.pathname;
</script>

<div class="flex h-screen overflow-hidden" style="background: var(--bg);">
	<!-- Sidebar overlay para móvil -->
	{#if sidebarOpen}
		<div class="fixed inset-0 z-20 bg-black/25 lg:hidden" on:click={() => sidebarOpen = false}></div>
	{/if}

	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-30 w-56 flex flex-col transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
		style="background: var(--surface); border-right: 1px solid var(--border);">

		<!-- Logo -->
		<div class="flex items-center justify-between h-16 px-5 shrink-0"
			style="border-bottom: 1px solid var(--border);">
			<span class="text-xl font-bold" style="font-family: 'Merriweather', serif; color: var(--text);">MenuPlan</span>
			<button class="lg:hidden" style="color: var(--text-secondary);" on:click={() => sidebarOpen = false}>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
			</button>
		</div>

		<!-- Navegación -->
		<nav class="flex-1 px-3 py-4 space-y-0.5">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
					style="{currentPath.startsWith(item.href)
						? `background: var(--nav-active); color: var(--day-text);`
						: `color: var(--text); hover: var(--surface-warm);`}"
					on:click={() => sidebarOpen = false}
					on:mouseenter={(e) => { if (!currentPath.startsWith(item.href)) e.currentTarget.style.background = 'var(--surface-warm)'; }}
					on:mouseleave={(e) => { if (!currentPath.startsWith(item.href)) e.currentTarget.style.background = 'transparent'; }}
				>
					<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={item.icon} />
					</svg>
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</aside>

	<!-- Contenido principal -->
	<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
		<!-- Top bar (móvil) -->
		<header class="flex items-center h-14 px-4 lg:hidden shrink-0"
			style="background: var(--surface); border-bottom: 1px solid var(--border);">
			<button style="color: var(--text);" on:click={() => sidebarOpen = true}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<span class="ml-3 text-lg font-bold" style="font-family: 'Merriweather', serif; color: var(--text);">MenuPlan</span>
		</header>

		<main class="flex-1 overflow-auto">
			<slot />
		</main>
	</div>
</div>
