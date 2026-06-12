# Playwright — Gotchas y soluciones

> **Regla general:** cuando un test Playwright requiere varios intentos para funcionar, añadir aquí el problema y la solución para no repetir el camino.

## Configuración básica

- Los scripts deben ejecutarse desde el directorio del proyecto (`/home/jesus/git/menuplan`), no desde `/tmp`, porque `playwright` es devDependency local.
- El binario de Chromium se instala una vez con `npx playwright install chromium` (queda en `~/.cache/ms-playwright`).

```js
// Plantilla de script de verificación
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5173/ruta');
await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
await browser.close();
```

## Media queries y capacidades del dispositivo

**`@media (hover: none)` aplica en Chromium headless.** Playwright headless no declara capacidad de hover del puntero, así que `@media (hover: hover)` **no** aplica y `@media (hover: none)` **sí** aplica. Consecuencias en `RecipeSlot`:

- Los `circ-btn` (botones circulares de escritorio) tienen `display: none !important` y Playwright no puede interactuar con ellos.
- El menú vertical (`vert-menu` / `vert-btn`) sí es visible, y el botón trigger `⋮` (`aria-label="Opciones"`) siempre está visible (por `[@media(hover:none)]:opacity-100`).
- **Para abrir el menú de un slot y clicar una acción:**
  ```js
  await page.locator('button[aria-label="Opciones"]').first().click({ force: true });
  await page.locator('button[aria-label="Editar receta"]').first().click();
  ```

## Selectores y visibilidad

**Selector `.overflow-auto` atrapa `<main>` antes que el div Svelte.** Usar:
```js
[...document.querySelectorAll('.overflow-auto')].find(e => e.tagName === 'DIV')
```

**El día seleccionado en la tira de días móvil** se detecta por el estilo inline `background: var(--primary)` **sin** `border` (el día de hoy sin seleccionar tiene `border: 1.5px solid var(--primary)` pero fondo distinto). No hay clase CSS para esto.

**Orden de los botones `.nav-btn` en la página semana:** `nth(0)`=semana anterior (←), `nth(1)`=Hoy, `nth(2)`=semana siguiente (→), `nth(3)`=Recalcular (oculto en móvil). Usar `nth(2)` para navegar adelante, **no** `nth(1)`.

## Eventos táctiles

**Simular swipe táctil:** `page.touchscreen` no tiene API de swipe. Usar `page.evaluate()` con `new Touch()` + `new TouchEvent('touchstart'/'touchend', ...)`. Despachar `touchstart` y `touchend` en un mismo `evaluate` usando `setTimeout` para que compartan la misma referencia al elemento:

```js
await page.evaluate((dx) => {
  const el = [...document.querySelectorAll('.overflow-auto')].find(e => e.tagName === 'DIV');
  const cx = 200, cy = 400;
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true,
    touches: [new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })] }));
  setTimeout(() => el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true,
    changedTouches: [new Touch({ identifier: 1, target: el, clientX: cx + dx, clientY: cy })] })), 30);
}, deltaX);
await page.waitForTimeout(400);
```

## Svelte

**`<svelte:window>` no puede estar dentro de bloques `{#if}` ni de otros elementos.** Debe colocarse en el nivel raíz del template. Si se necesita un handler de teclado condicional (p.ej. solo cuando un modal está abierto), condicionar la lógica dentro del handler:

```js
// ✗ Incorrecto — error de compilación
{#if open}
  <svelte:window onkeydown={handleKeydown} />
{/if}

// ✓ Correcto
function handleKeydown(e) { if (open && e.key === 'Escape') onClose(); }
// ...en el template, fuera de cualquier bloque:
<svelte:window onkeydown={handleKeydown} />
```
