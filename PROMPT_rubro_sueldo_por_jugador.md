# Fase 8 — El rubro del sueldo sale de la ficha del jugador

Continúa el trabajo de `PROMPT_liquidacion_por_jugador.md` (fases 1-7, ya implementadas).

## Problema

`confirmarPagosJugadores` (Code.gs, ≈1787) hardcodea el rubro del egreso:

```js
codRubro: "19", rubro: "SUELDO JUGADORES", categoria: "Jugadores y Cuerpo Técnico",
```

Pero parte del plantel es cuerpo técnico —DT, preparador físico, ayudante de campo— y su
sueldo va imputado al rubro **18 (SUELDO DT Y CT)**. Hoy todo cae en el 19 y hay que corregirlo
a mano en la planilla después de liquidar, o directamente queda mal.

## Decisión de diseño

El rubro se guarda **en la ficha del jugador** (hoja *Config Jugadores*), no se elige en cada
liquidación. Un DT es siempre un DT: si hay que decidirlo en cada pago, tarde o temprano se
pasa uno.

Se guarda **el código de rubro directamente** (`CodRubroSueldo`), no un campo `tipo:
jugador | CT`. El rubro 18 vs 19 *ya es* esa distinción, y Reportes filtra por rubro — o sea
que "cuánto cuesta el CT" ya se responde sin agregar nada. Un campo `tipo` sería dato
duplicado que puede divergir del rubro efectivamente imputado, y además obligaría a mantener
una tabla de mapeo `tipo → rubro` en el código.

Se agrega igual un **override en el modal de liquidación**, pero como salida de emergencia:
arranca siempre con el valor de la ficha.

## Por qué no rompe nada

Verificado antes de escribir esto:

- `jugadorResCategoria` (index.html, ≈5941) ya mapea `"18"` y `"19"` juntos a `"sueldos"`.
- Los dos rubros comparten la categoría *Jugadores y Cuerpo Técnico*, que es la que excluyen
  `PARTIDO_RES_CATS_EXCLUIDAS` (front) y `PUB_CATS_FUERA_PARTIDO` (Code.gs). Resumen → Por
  Partido y el balance público siguen dejando los sueldos afuera exactamente igual.

---

## 1. La columna

- `CFGJ_COLS` (Code.gs:44) → agregar `"CodRubroSueldo"` **al final**, después de `"Celular"`.
  Queda en el índice 10. `getOrCreateSheet` completa el header solo; no hay migración que
  correr.
- `listConfigJugadores` → mapear `codRubroSueldo: String(r[10]||"")`.
- `saveConfigJugador` → escribirlo en las **dos** ramas (update y append).

**Vacío significa 19.** No hay backfill: son tres personas y se cambian a mano desde la app.

## 2. La ficha del jugador

En `openConfigJugadorModal` (index.html), agregar un select **"Rubro del sueldo"**.

Limitarlo a los rubros de la categoría *Jugadores y Cuerpo Técnico* — ofrecer los sesenta del
catálogo no ayuda a nadie y habilita errores. Filtrar `RUBROS` por `cat`, no hardcodear la
lista: si mañana se agrega un rubro a esa categoría, aparece solo.

Default para un jugador nuevo o sin el campo: `"19"`.

## 3. El backend

En `confirmarPagosJugadores` (Code.gs), reemplazar el hardcodeo del rubro:

- Leer la hoja *Config Jugadores* una vez, arriba, junto a la lectura de *Partidos* que ya está
  ahí. Armar un índice `idJugador → codRubroSueldo`. Una sola llamada a `getDataRange()`, igual
  que las demás — no leer por jugador adentro del loop.
- Para cada grupo, resolver el rubro: el de la ficha, o `"19"` si está vacío o si el código no
  existe en `RUBROS_MAP`. Sacar `rubro` y `categoria` de `RUBROS_MAP`, nunca escribirlos a mano.
- **Sólo aplica al EGRESO.** Los INGRESOS de contrapartida (fase 4) mantienen su propio rubro.

### El override

Aceptar un parámetro opcional `data.codRubroSueldo`. Aplicarlo **sólo si el lote tiene un único
grupo de jugador** — desde la fase 7 el front siempre manda uno solo, pero el backend sigue
soportando lotes multi-jugador y un override global ahí sería ambiguo. Si llega con más de un
grupo, ignorarlo y usar el de cada ficha. Dejarlo comentado en el código.

Validar que el código recibido exista en `RUBROS_MAP`; si no, caer al de la ficha.

## 4. La previsualización del front

`pjLiqMovimientosPreview` (index.html, ≈8637) también hardcodea `codRubro: "19"`. Su propio
docstring dice: *"Es una previsualización, no la fuente de verdad — pero si difiere de lo que
termina grabando el backend, es un bug."* Hay que actualizarla en el mismo cambio.

- Resolver desde `configJugadores`, que ya está cargado en el front — sin llamadas nuevas.
- Misma regla de fallback que el backend: ficha → `"19"`.

## 5. El override en el modal de liquidación

En `renderLiquidacionModal`, en la sección de previsualización de movimientos, convertir el
rubro de la **fila del EGRESO** en un select editable:

- Arranca con el valor resuelto de la ficha.
- Mismas opciones que el de la ficha (categoría *Jugadores y Cuerpo Técnico*).
- Cambiarlo actualiza `pjLiqData.codRubroSueldo` y repinta la previsualización.
- `pjLiquidar` lo manda al backend.

**No** persistirlo entre jugadores como se hace con `cuenta` y `fechaPago`: esos se repiten en
una liquidación, el rubro no. Al abrir el modal del jugador siguiente tiene que volver a salir
de su ficha.

Las filas de INGRESO de la previsualización siguen sin ser editables.

---

## Tests

**`spec/premios.js`**

- Jugador con `CodRubroSueldo = "18"` → el EGRESO sale con rubro 18, nombre `"SUELDO DT Y CT"`
  y categoría *Jugadores y Cuerpo Técnico*.
- Jugador sin el campo → rubro 19, exactamente como antes de este cambio.
- Jugador con un código basura (ej. `"999"`) → cae a 19, no escribe un rubro inexistente.
- Con contrapartida: el EGRESO toma el rubro de la ficha y el INGRESO mantiene el suyo.
- Override: `data.codRubroSueldo = "18"` sobre un jugador con ficha en 19 → sale 18. El mismo
  override con un lote de dos jugadores → se ignora y cada uno usa su ficha.

**`spec/frontend.js`**

- `pjLiqMovimientosPreview` devuelve el mismo `codRubro` que termina grabando el backend, para
  los tres casos (ficha en 18, ficha vacía, override).

## Verificación final

1. Correr las cinco suites (`premios`, `frontend`, `reparto`, `entradas`, `publico`).
2. Confirmar que no queda ningún `"19"` hardcodeado como rubro de sueldo fuera de los
   fallbacks — buscar `SUELDO JUGADORES` en los dos archivos.
3. **`Code.gs` necesita redeploy manual** en Apps Script.
