# Prompt para Claude Code — Comprobantes de pago multi-partido

## Contexto

En la app de tesorería (`index.html` + `Code.gs`), el módulo **Pagos a Jugadores** tiene tres subtabs: "Por partido", "Mensual" y "Transferencias".

Hoy, al confirmar pagos, el backend `confirmarPagosJugadores` (Code.gs) agrupa las filas por **jugador + partido**. Consecuencia: si en "Transferencias" se seleccionan 2 partidos, se crean **2 movimientos** para el mismo jugador → 2 comprobantes. Además, los premios/ajustes (filas de `pagosJugadores` con `partidosIncluidos` vacío) sólo se pliegan dentro de un partido si hay **exactamente uno** en el lote; con 2 o más quedan como un tercer movimiento suelto.

En la realidad, cuando se le paga a un jugador se hace **una sola transferencia** que cubre varios partidos más sus premios y descuentos. Eso tiene que ser **un solo movimiento** y **un solo comprobante**.

## Objetivo

Un **lote de pago** = los partidos seleccionados en "Transferencias" + los jugadores tildados. Confirmar el lote debe crear **un movimiento por jugador**, con el detalle itemizado (una línea por partido, una por premio, una por ajuste/descuento), y ese movimiento genera **un comprobante único** con todo ese detalle.

---

## Cambios a implementar

### 1. Backend — `Code.gs`, case `"confirmarPagosJugadores"`

- **Agrupar por `jugadorId` solamente** (hoy la clave es `f.jugadorId + "|" + f.partidoId`).
- **Eliminar el paso 2** ("plegado de sueltos dentro del único partido del lote"): deja de ser necesario, porque las filas sin partido ya caen en el mismo grupo del jugador.
- **`itemsDetalle`**: cada ítem suma un campo nuevo `partidoId` (string vacío para premios y ajustes sin partido). Mantener `desc` y `monto` como están.
  - Para filas con partido: `desc = "<numeroFecha> vs <rival>"`, y si hay `motivoAjuste` se le concatena `" — <motivo>"` (igual que hoy).
  - Para filas sin partido: `desc = etiqueta || "Ajuste"`, `partidoId = ""`.
- **`concepto` del movimiento**: hoy concatena todos los `desc` con `" + "` y con 3 partidos queda kilométrico. Acortarlo a algo legible, p. ej. `Pago jugador <Nombre> — F5, F6 + premios` (los `numeroFecha` de los partidos incluidos, y el sufijo `+ premios` sólo si hay ítems sin partido). Si no hay partidos en el grupo, mantener el formato actual con las etiquetas.
- **`partidoId` del movimiento**: guardar el del partido más reciente del grupo (por compatibilidad con filtros y tags existentes), pero el Resumen por Partido ya no dependerá de este campo cuando haya `itemsDetalle`.
- **Serialización**: `stringifyItemsDetalle` y su parseo correspondiente tienen que incluir `partidoId`, y **tolerar ítems viejos que no lo traen** (leerlos como `partidoId: ""`).

### 2. Frontend — Resumen > Por Partido (`calcPartidoResumenRows()` en `index.html`, ~línea 2949)

Hoy imputa el movimiento entero a `m.partidoId`. Cambiar a:

1. Si el movimiento trae `itemsDetalle` con al menos un ítem con `partidoId` no vacío → imputar **cada ítem a su partido**.
2. Los ítems **sin** `partidoId` (premios, ajustes) → **prorratear proporcionalmente** entre los partidos que aparecen en ese mismo movimiento, de modo que la suma imputada siempre iguale el `egreso`/`ingreso` total del movimiento.
3. Si no hay `itemsDetalle` o ningún ítem tiene `partidoId` (movimientos históricos, o cargados a mano desde "Nuevo movimiento") → **fallback al comportamiento actual**: todo a `m.partidoId`.

Importante: el histórico ya guardado no debe cambiar de valores. Verificar que la clasificación por `codRubro` (buffet / gastosCancha / entradas / otros) siga aplicándose igual a nivel movimiento — los ítems heredan el `codRubro` del movimiento padre.

### 3. Frontend — pantalla "Por partido" (`renderPagoPartido()`)

Esta pantalla pasa a ser **sólo de carga**, no de pago.

- **Quitar el botón ✓** (`marcarBtn` → `abrirMedioPagoModal`) de las filas de jugadores por-partido.
- **Quitar el botón ✓** de las filas de jugadores **quincenales** del pie de la tabla (`marcarAcumuladoPagado`). Los quincenales cobran por quincena o cada dos partidos, así que se pagan desde "Transferencias" junto con los partidos.
- El badge de Estado (Pendiente / Pagado) **se mantiene**, ahora sólo informativo.
- Las filas ya pagadas siguen con los inputs deshabilitados, como hoy.
- Se mantienen: selector de rol, ajuste, motivo, botón 🏆 de premios, "+ Agregar monto" y el botón "Guardar".
- Ajustar el `<th>` vacío de la última columna y los `colspan` si quedan columnas huérfanas.

### 4. Frontend — pantalla "Mensual" (`renderPagoMensual()`)

**Sin cambios.** Conserva su botón ✓ (`marcarMesPagado`): los jugadores con frecuencia mensual se siguen pagando desde ahí.

### 5. Frontend — pantalla "Transferencias" (`renderTransferencias()`)

Es el único lugar donde se paga lo por-partido y lo quincenal.

- **Agregar una columna "Premios/Ajustes"** entre las columnas de partidos y la de Total. Hoy `info.premios` se suma dentro del Total pero no se muestra en ninguna parte, y ahora el comprobante sí lo va a listar. Mostrar `—` cuando es 0.
- Verificar que `pjFilasSeleccionadas()` siga juntando correctamente los ids (filas de partido pendientes + `pjIdsAcumuladoPendiente`). No debería requerir cambios.
- La pantalla de confirmación (`mostrarConfirmacionPagosModal`) ya lista un botón de comprobante por movimiento creado — con el nuevo agrupamiento pasa a ser **uno por jugador**, que es lo buscado. Sin cambios.

### 6. Comprobante

**No requiere cambios en el generador.** `movToComprobante()` ya mapea `mov.itemsDetalle` a los conceptos del documento, así que el comprobante saldrá automáticamente con una línea por partido, una por premio y una por descuento, más el total.

Único ajuste a revisar: el campo **Período** se precarga desde `mov.mes` (el mes del pago). Verificar que sigue teniendo sentido con varios partidos; si los partidos del movimiento caen en un solo mes está bien como está. Es un campo editable, así que no bloquea.

---

## Versionado (importante)

Al terminar, **subir `SW_VERSION` en `sw.js`** (actualmente `"53"` → `"54"`). Sin esto, los otros dispositivos no detectan la versión nueva y siguen con el `index.html` cacheado.

---

## Restricciones

- No romper la compatibilidad con los movimientos y pagos ya guardados en la planilla.
- Mantener el estilo del código existente: sin frameworks, todo en `index.html`, funciones en el mismo tono y con comentarios en castellano explicando el *porqué* de las decisiones no obvias.
- No agregar dependencias nuevas.

## Verificación antes de dar por terminado

1. Con **1 partido** seleccionado y un jugador con premios: se crea **1 movimiento**, y el comprobante lista partido + premios por separado.
2. Con **2 o más partidos** seleccionados: se crea **1 solo movimiento por jugador**, con una línea por partido en el comprobante.
3. Un jugador con **descuento/ajuste negativo**: aparece como línea negativa en el comprobante y el total cierra.
4. **Resumen > Por Partido**: el total de egresos de jugadores imputado a los partidos coincide con la suma de los movimientos, y los valores del histórico previo no cambiaron.
5. Un movimiento **viejo** (guardado antes del cambio) sigue abriendo bien su comprobante y sigue apareciendo en el Resumen por Partido.
6. La pantalla "Por partido" ya no tiene botones de pago, pero "Guardar" sigue funcionando y los premios se siguen pudiendo cargar.
