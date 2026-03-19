<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let sidebarOpen = false;

	const navItems = [
		{ href: '/week', label: 'Semana', icon: '📅' },
		{ href: '/recipes', label: 'Recetas', icon: '🍳' },
		{ href: '/members', label: 'Miembros', icon: '👥' },
		{ href: '/rules', label: 'Reglas', icon: '📋' },
		{ href: '/history', label: 'Histórico', icon: '📚' },
		{ href: '/options', label: 'Opciones', icon: '⚙️' },
	];

	$: currentPath = $page.url.pathname;
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="flex h-screen bg-stone-50 overflow-hidden">
	<!-- Sidebar overlay para móvil -->
	{#if sidebarOpen}
		<div class="fixed inset-0 z-20 bg-black/30 lg:hidden" on:click={() => sidebarOpen = false}></div>
	{/if}

	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-stone-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">

		<!-- Logo -->
		<div class="flex items-center justify-between h-16 px-5 border-b border-stone-100 shrink-0">
			<span class="text-xl font-bold text-gray-900" style="font-family: 'Playfair Display', serif">MenuPlan</span>
			<button class="lg:hidden text-stone-400 hover:text-stone-600" on:click={() => sidebarOpen = false}>✕</button>
		</div>

		<!-- Navegación -->
		<nav class="flex-1 px-3 py-4 space-y-0.5">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
						{currentPath.startsWith(item.href)
							? 'bg-indigo-50 text-indigo-700'
							: 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'}"
					on:click={() => sidebarOpen = false}
				>
					<span class="text-base leading-none">{item.icon}</span>
					<span>{item.label}</span>
					{#if currentPath.startsWith(item.href)}
						<span class="ml-auto w-1 h-4 bg-indigo-500 rounded-full"></span>
					{/if}
				</a>
			{/each}
		</nav>
	</aside>

	<!-- Contenido principal -->
	<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
		<!-- Top bar (móvil) -->
		<header class="flex items-center h-16 px-4 bg-white border-b border-stone-200 lg:hidden shrink-0">
			<button class="text-stone-400 hover:text-stone-700" on:click={() => sidebarOpen = true}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<span class="ml-3 text-lg font-bold text-gray-900" style="font-family: 'Playfair Display', serif">MenuPlan</span>
		</header>

		<main class="flex-1 overflow-auto">
			<slot />
		</main>
	</div>
</div>
