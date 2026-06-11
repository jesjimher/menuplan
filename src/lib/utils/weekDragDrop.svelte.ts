// Estado y handlers de drag & drop de la página de semana (runes en módulo .svelte.ts).
export type SlotCoord = { weekday: number; mealType: string; slotIndex: number; isAcc: number };

export class WeekDragDrop {
	dragSource = $state<SlotCoord | null>(null);
	dragOver = $state<string | null>(null);
	dragModifier = $state(false);
	ctrlHeld = false; // seguimiento por keydown/keyup, más fiable que DragEvent.ctrlKey

	#onDropSlot: (source: SlotCoord, target: SlotCoord, withModifier: boolean) => void;

	constructor(onDropSlot: (source: SlotCoord, target: SlotCoord, withModifier: boolean) => void) {
		this.#onDropSlot = onDropSlot;
	}

	reset(): void {
		this.dragSource = null;
		this.dragOver = null;
		this.dragModifier = false;
	}

	// Listeners a nivel de documento: estado de Ctrl/Meta y comportamiento de drop fuera de slots.
	attachDocumentListeners(): () => void {
		const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') this.ctrlHeld = true; };
		const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') this.ctrlHeld = false; };
		// Fires for every dragover on the page — only engage when Ctrl held so we don't
		// suppress the native no-drop cursor when dragging over non-slot areas without Ctrl.
		const onDocDragOver = (e: DragEvent) => {
			if (!this.dragSource) return;
			if (this.ctrlHeld) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; }
		};
		// Prevent the browser from navigating when the user drops on an empty area.
		const onDocDrop = (e: DragEvent) => { if (this.dragSource) e.preventDefault(); };
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('keyup', onKeyUp);
		document.addEventListener('dragover', onDocDragOver);
		document.addEventListener('drop', onDocDrop);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('keyup', onKeyUp);
			document.removeEventListener('dragover', onDocDragOver);
			document.removeEventListener('drop', onDocDrop);
		};
	}

	// Handlers de drag para un slot concreto.
	handlersFor(coord: SlotCoord, key: string, hasRecipe: () => boolean) {
		return {
			onDragStart: (e: DragEvent) => {
				if (!hasRecipe()) return;
				this.dragSource = coord;
				this.dragModifier = this.ctrlHeld || e.ctrlKey || e.metaKey;
				e.dataTransfer!.effectAllowed = 'copyMove';
				e.dataTransfer!.setData('text/plain', key);
			},
			onDragEnd: () => this.reset(),
			onDragOver: (e: DragEvent) => {
				if (!this.dragSource) return;
				this.dragModifier = this.ctrlHeld || e.ctrlKey || e.metaKey;
				e.dataTransfer!.dropEffect = this.dragModifier ? 'copy' : 'move';
				this.dragOver = key;
			},
			onDragLeave: (e: DragEvent) => {
				if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) this.dragOver = null;
			},
			onDrop: (e: DragEvent) => {
				if (!this.dragSource) return;
				const src = this.dragSource;
				const mod = this.ctrlHeld || e.ctrlKey || e.metaKey || this.dragModifier;
				this.reset();
				this.#onDropSlot(src, coord, mod);
			}
		};
	}
}
