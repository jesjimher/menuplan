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

<div class="flex h-screen bg-gray-50 overflow-hidden">
	<!-- Sidebar overlay for mobile -->
	{#if sidebarOpen}
		<div class="fixed inset-0 z-20 bg-black/50 lg:hidden" on:click={() => sidebarOpen = false}></div>
	{/if}

	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-30 w-64 bg-indigo-700 text-white transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
		<div class="flex items-center justify-between h-16 px-4 bg-indigo-800">
			<span class="text-xl font-bold">MenuPlan</span>
			<button class="lg:hidden text-white" on:click={() => sidebarOpen = false}>✕</button>
		</div>
		<nav class="mt-4 px-2">
			{#each navItems as item}
				<a
					href={item.href}
					class="flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors {currentPath.startsWith(item.href) ? 'bg-indigo-900 text-white' : 'text-indigo-100 hover:bg-indigo-600'}"
					on:click={() => sidebarOpen = false}
				>
					<span>{item.icon}</span>
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</aside>

	<!-- Main content -->
	<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
		<!-- Top bar (mobile) -->
		<header class="flex items-center h-16 px-4 bg-white border-b border-gray-200 lg:hidden">
			<button class="text-gray-500 hover:text-gray-700" on:click={() => sidebarOpen = true}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<span class="ml-3 text-lg font-semibold text-gray-800">MenuPlan</span>
		</header>

		<main class="flex-1 overflow-auto">
			<slot />
		</main>
	</div>
</div>
