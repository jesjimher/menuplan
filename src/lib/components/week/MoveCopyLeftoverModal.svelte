<script lang="ts">
	let {
		open = false,
		sourceName = '',
		canLeftover = false,
		onConfirm,
		onClose,
	}: {
		open?: boolean;
		sourceName: string;
		canLeftover: boolean;
		onConfirm: (action: 'move' | 'copy' | 'leftover') => void;
		onClose: () => void;
	} = $props();

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="dialog"
	aria-modal="true"
	aria-label="Opciones de movimiento"
	class="backdrop"
	onclick={handleBackdrop}
	onkeydown={handleKeydown}
>
	<div class="panel" onclick={(e) => e.stopPropagation()}>
		<div class="header">
			<span class="title">¿Qué hacer con <em class="recipe-name">«{sourceName}»</em>?</span>
			<button class="close-btn" onclick={onClose} aria-label="Cerrar">&times;</button>
		</div>
		<div class="actions">
			<button class="action-btn" onclick={() => onConfirm('move')}>
				<span class="action-icon">⇄</span>
				<span class="action-label">Mover</span>
				<span class="action-desc">Intercambiar con el destino</span>
			</button>
			<button class="action-btn" onclick={() => onConfirm('copy')}>
				<span class="action-icon">⊕</span>
				<span class="action-label">Copiar</span>
				<span class="action-desc">Dejar también en el origen</span>
			</button>
			{#if canLeftover}
				<button class="action-btn action-btn-leftover" onclick={() => onConfirm('leftover')}>
					<span class="action-icon">♻</span>
					<span class="action-label">Restos</span>
					<span class="action-desc">Marcar el destino como restos del origen</span>
				</button>
			{/if}
		</div>
	</div>
</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.panel {
		background: var(--surface);
		border-radius: 1.25rem;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		border: 1px solid var(--border);
		width: min(400px, 92vw);
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem 1rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.4;
	}

	.recipe-name {
		font-style: normal;
		color: var(--primary);
	}

	.close-btn {
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 1.1rem;
		color: var(--text-muted);
		flex-shrink: 0;
		transition: background 0.15s;
	}

	.close-btn:hover {
		background: var(--surface-container-low);
	}

	.actions {
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.25rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.875rem;
		border-radius: 0.75rem;
		text-align: left;
		transition: background 0.12s;
		width: 100%;
	}

	.action-btn:hover {
		background: var(--surface-container-low);
	}

	.action-icon {
		font-size: 1.2rem;
		width: 1.75rem;
		text-align: center;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.action-label {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text);
		min-width: 4rem;
	}

	.action-desc {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.action-btn-leftover .action-icon {
		color: var(--secondary);
	}

	.action-btn-leftover .action-label {
		color: var(--secondary);
	}
</style>
