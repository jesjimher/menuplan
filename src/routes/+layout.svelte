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
	<link href="https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
</svelte:head>

<div class="flex h-screen overflow-hidden" style="background: #f0ebe3; font-family: 'DM Sans', sans-serif;">
	<!-- Sidebar overlay para móvil -->
	{#if sidebarOpen}
		<div class="fixed inset-0 z-20 bg-black/30 lg:hidden" on:click={() => sidebarOpen = false}></div>
	{/if}

	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-stone-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">

		<!-- Logo -->
		<div class="flex items-center justify-between h-16 px-5 border-b border-stone-100 shrink-0">
			<span class="text-xl font-bold text-stone-900" style="font-family: 'Lora', serif">MenuPlan</span>
			<button class="lg:hidden text-stone-700 hover:text-stone-900" on:click={() => sidebarOpen = false}>✕</button>
		</div>

		<!-- Navegación -->
		<nav class="flex-1 px-3 py-4 space-y-0.5">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
						{currentPath.startsWith(item.href)
							? 'bg-stone-900 text-white'
							: 'text-stone-800 hover:bg-stone-100'}"
					on:click={() => sidebarOpen = false}
				>
					<span class="text-base leading-none">{item.icon}</span>
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</aside>

	<!-- Contenido principal -->
	<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
		<!-- Top bar (móvil) -->
		<header class="flex items-center h-16 px-4 bg-white border-b border-stone-200 lg:hidden shrink-0">
			<button class="text-stone-700 hover:text-stone-900" on:click={() => sidebarOpen = true}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<span class="ml-3 text-lg font-bold text-stone-900" style="font-family: 'Lora', serif">MenuPlan</span>
		</header>

		<main class="flex-1 overflow-auto">
			<slot />
		</main>
	</div>
</div>
