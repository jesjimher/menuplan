<script lang="ts">
	// Texto editable in-place (contenteditable) con placeholder; guarda al perder el foco.
	let { value = null, placeholder = '', ariaLabel, variant = 'reason', onSave }: {
		value?: string | null;
		placeholder?: string;
		ariaLabel: string;
		variant?: 'reason' | 'note';
		onSave: (text: string) => void;
	} = $props();
</script>

<div
	contenteditable="true"
	role="textbox"
	aria-multiline="true"
	aria-label={ariaLabel}
	on:blur={(e) => { const el = e.currentTarget as HTMLDivElement; const t = el.innerText.trim(); if (!t) el.innerHTML = ''; onSave(t); }}
	data-placeholder={placeholder}
	class="editable-note focus:outline-none {variant === 'reason'
		? 'reason w-full text-center text-sm'
		: 'note flex-1 text-[11px] px-1 py-0.5 rounded focus:bg-[var(--surface)] cursor-text'}"
	style="color: var(--text);{variant === 'note' ? ' font-weight: 600;' : ''}"
>{value ?? ''}</div>

<style>
	.editable-note.reason {
		font-weight: 600;
	}
	.editable-note:empty::before {
		content: attr(data-placeholder);
		color: var(--text-muted);
		font-weight: 400;
		font-style: italic;
		pointer-events: none;
	}
	.editable-note:focus::before {
		content: none;
	}
</style>
