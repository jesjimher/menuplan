<script lang="ts">
	// Recorte de una foto cualquiera: el usuario coloca un círculo sobre la cara y se devuelve el
	// cuadrado que lo contiene como JPEG (el avatar se muestra recortado en círculo).
	//  - Círculo: arrastrar para moverlo; tirador del borde o deslizador para cambiar su tamaño.
	//  - Imagen: rueda del ratón o deslizador para acercar/alejar; arrastrar el fondo para moverla.
	// Funciona con ratón y con el dedo (pointer events).
	import { onDestroy } from 'svelte';

	let { file, outputSize = 512, onconfirm, oncancel }: {
		file: File;
		outputSize?: number;
		onconfirm: (blob: Blob) => void;
		oncancel: () => void;
	} = $props();

	const MIN_SEL = 24; // px en pantalla
	const MAX_ZOOM = 8;

	let url = $derived(URL.createObjectURL(file));
	let prevUrl: string | null = null;
	$effect(() => {
		if (prevUrl && prevUrl !== url) URL.revokeObjectURL(prevUrl);
		prevUrl = url;
	});
	onDestroy(() => { if (prevUrl) URL.revokeObjectURL(prevUrl); });

	let imgEl = $state<HTMLImageElement | null>(null);
	let areaEl = $state<HTMLDivElement | null>(null);
	let failed = $state(false);
	let working = $state(false);

	// Visor: tamaño de la imagen ajustada sin zoom (se fija al cargar)
	let viewW = $state(0);
	let viewH = $state(0);
	let loaded = $state(false);
	// Zoom y desplazamiento de la imagen dentro del visor
	let zoom = $state(1);
	let ox = $state(0);
	let oy = $state(0);
	// Cuadrado que contiene el círculo, en píxeles del visor
	let sel = $state({ x: 0, y: 0, size: 100 });

	let maxSize = $derived(Math.min(viewW, viewH));

	function clamp(v: number, lo: number, hi: number) {
		return Math.max(lo, Math.min(hi, v));
	}

	function onLoad() {
		if (!imgEl) return;
		// Primero se pinta ajustada (max-width/max-height) para medir el visor
		viewW = imgEl.clientWidth;
		viewH = imgEl.clientHeight;
		const size = Math.round(Math.min(viewW, viewH) * 0.6);
		// Por defecto, centrado en horizontal y algo por encima del centro (donde suele estar la cara)
		sel = { x: Math.round((viewW - size) / 2), y: Math.round(clamp(viewH * 0.4 - size / 2, 0, viewH - size)), size };
		loaded = true;
	}

	function setSel(x: number, y: number, size: number) {
		const s = clamp(size, Math.min(MIN_SEL, maxSize), maxSize);
		sel = { x: clamp(x, 0, viewW - s), y: clamp(y, 0, viewH - s), size: s };
	}

	function resizeAround(cx: number, cy: number, size: number) {
		const s = clamp(size, Math.min(MIN_SEL, maxSize), maxSize);
		setSel(cx - s / 2, cy - s / 2, s);
	}

	/** La imagen siempre cubre el visor: el desplazamiento se limita a lo que sobra. */
	function setOffset(x: number, y: number) {
		ox = clamp(x, viewW - viewW * zoom, 0);
		oy = clamp(y, viewH - viewH * zoom, 0);
	}

	/** Cambia el zoom manteniendo fijo el punto (px, py) del visor. */
	function zoomAt(newZoom: number, px: number, py: number) {
		const z = clamp(newZoom, 1, MAX_ZOOM);
		const k = z / zoom;
		zoom = z;
		setOffset(px - (px - ox) * k, py - (py - oy) * k);
	}

	type Drag = { mode: 'move' | 'resize' | 'pan'; startX: number; startY: number; orig: typeof sel; origOx: number; origOy: number; rect: DOMRect };
	let drag: Drag | null = null;

	function startDrag(e: PointerEvent, mode: Drag['mode']) {
		if (!areaEl) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { mode, startX: e.clientX, startY: e.clientY, orig: { ...sel }, origOx: ox, origOy: oy, rect: areaEl.getBoundingClientRect() };
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		const dx = e.clientX - drag.startX;
		const dy = e.clientY - drag.startY;
		if (drag.mode === 'move') {
			setSel(drag.orig.x + dx, drag.orig.y + dy, drag.orig.size);
		} else if (drag.mode === 'pan') {
			setOffset(drag.origOx + dx, drag.origOy + dy);
		} else {
			// Tirador del borde: el centro queda fijo y el radio es la distancia al puntero
			const cx = drag.orig.x + drag.orig.size / 2;
			const cy = drag.orig.y + drag.orig.size / 2;
			const r = Math.hypot(e.clientX - drag.rect.left - cx, e.clientY - drag.rect.top - cy);
			resizeAround(cx, cy, r * 2);
		}
	}

	function endDrag() {
		drag = null;
	}

	function onWheel(e: WheelEvent) {
		if (!areaEl || !loaded) return;
		e.preventDefault();
		const rect = areaEl.getBoundingClientRect();
		zoomAt(zoom * (e.deltaY > 0 ? 1 / 1.1 : 1.1), e.clientX - rect.left, e.clientY - rect.top);
	}

	async function confirm() {
		if (!imgEl) return;
		working = true;
		try {
			// Del visor (con zoom y desplazamiento) a píxeles reales de la imagen
			const scale = imgEl.naturalWidth / (viewW * zoom);
			const sx = Math.round((sel.x - ox) * scale);
			const sy = Math.round((sel.y - oy) * scale);
			const ss = Math.round(sel.size * scale);
			const out = Math.min(outputSize, ss);
			const canvas = document.createElement('canvas');
			canvas.width = out;
			canvas.height = out;
			const ctx = canvas.getContext('2d')!;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(imgEl, sx, sy, ss, ss, 0, 0, out, out);
			const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.9));
			if (blob) onconfirm(blob);
		} finally {
			working = false;
		}
	}
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape') oncancel(); }} />

<div class="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6" style="background: rgba(0,0,0,0.6);">
	<div class="w-full max-w-lg rounded-2xl p-4 sm:p-5 flex flex-col gap-3" role="dialog" aria-modal="true" aria-label="Recortar foto"
		style="background: var(--surface); box-shadow: 0 20px 60px rgba(0,0,0,0.35); max-height: 100%;">
		<div>
			<h2 class="text-base font-black" style="font-family: 'Epilogue', sans-serif; color: var(--primary);">Elige la cara</h2>
			<p class="text-xs" style="color: var(--text-secondary);">Arrastra el círculo hasta la cara y ajusta su tamaño con el tirador del borde. Con la rueda del ratón acercas o alejas la foto, y arrastrando el fondo la mueves.</p>
		</div>

		<div class="flex justify-center min-h-0">
			{#if failed}
				<p class="text-sm py-10" style="color: var(--error);">No se pudo abrir la imagen.</p>
			{:else}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div bind:this={areaEl}
					class="crop-area relative inline-block select-none touch-none overflow-hidden rounded-lg"
					class:cursor-grab={loaded && zoom > 1}
					style={loaded ? `width: ${viewW}px; height: ${viewH}px;` : ''}
					on:pointerdown={(e) => { if (loaded) startDrag(e, 'pan'); }}
					on:pointermove={onPointerMove}
					on:pointerup={endDrag}
					on:pointercancel={endDrag}
					on:wheel={onWheel}>
					<img bind:this={imgEl} src={url} alt="Foto a recortar" draggable="false"
						class="block max-w-full"
						style={loaded
							? `position: absolute; max-width: none; left: ${ox}px; top: ${oy}px; width: ${viewW * zoom}px; height: ${viewH * zoom}px;`
							: 'max-height: min(60vh, 520px);'}
						on:load={onLoad}
						on:error={() => failed = true} />
					{#if loaded}
						<div class="selection absolute cursor-move"
							style="left: {sel.x}px; top: {sel.y}px; width: {sel.size}px; height: {sel.size}px;"
							on:pointerdown={(e) => startDrag(e, 'move')}
							role="slider" aria-label="Zona de la cara" aria-valuenow={Math.round(sel.size)} tabindex="0">
							<div class="handle" on:pointerdown={(e) => startDrag(e, 'resize')} aria-hidden="true"></div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if loaded}
			<div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs font-bold" style="color: var(--text-secondary);">
				<span>Zoom</span>
				<input type="range" class="accent-[var(--primary)]" aria-label="Zoom de la imagen"
					min="1" max={MAX_ZOOM} step="0.05" value={zoom}
					on:input={(e) => zoomAt(+(e.currentTarget as HTMLInputElement).value, sel.x + sel.size / 2, sel.y + sel.size / 2)} />
				<span>Círculo</span>
				<input type="range" class="accent-[var(--primary)]" aria-label="Tamaño del círculo"
					min={Math.min(MIN_SEL, maxSize)} max={maxSize} step="1" value={sel.size}
					on:input={(e) => resizeAround(sel.x + sel.size / 2, sel.y + sel.size / 2, +(e.currentTarget as HTMLInputElement).value)} />
			</div>
		{/if}

		<div class="flex justify-end gap-2">
			<button on:click={oncancel} class="px-4 py-2 rounded-xl text-sm" style="background: var(--surface-container-low); color: var(--text-secondary);">Cancelar</button>
			<button on:click={confirm} disabled={!loaded || working}
				class="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40" style="background: var(--primary); color: white;">
				{working ? 'Guardando…' : 'Usar esta zona'}
			</button>
		</div>
	</div>
</div>

<style>
	.crop-area { background: #111; }
	.selection {
		border-radius: 50%;
		border: 2px solid white;
		/* Oscurece todo lo que queda fuera del círculo */
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
		touch-action: none;
	}
	.handle {
		/* Sobre el borde del círculo, abajo a la derecha (45°) */
		position: absolute;
		left: 85.36%;
		top: 85.36%;
		transform: translate(-50%, -50%);
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
		cursor: nwse-resize;
	}
</style>
