# Liquidación de sueldos por jugador

Rediseño del flujo de pago a jugadores: se pasa de un pago en lote a una **liquidación
jugador por jugador**, con el sueldo bruto y los descuentos como movimientos separados, y
envío del comprobante por WhatsApp.

## Contexto que hay que entender antes de tocar nada

**Cómo funciona hoy.** La pantalla Pagos Jugadores tiene tres subtabs: *Por partido*,
*Mensual* y *Transferencias*. Las dos primeras cargan filas en la hoja *Pagos Jugadores*
(un partido, un premio, un sueldo periódico, un descuento). Transferencias las junta, se
tildan jugadores, y `confirmarPagosSeleccionados` manda todo a
`confirmarPagosJugadores` (Code.gs), que genera **un EGRESO por jugador** con rubro fijo
`"19"` (SUELDO JUGADORES) por la **suma neta** de sus filas.

**Los dos problemas que este trabajo resuelve.**

1. Un descuento que tiene contrapartida real (el club le vendió una camiseta al jugador y
   se la descuenta del sueldo) hoy netea adentro del rubro 19. Resultado: el sueldo queda
   subvaluado y el ingreso de indumentaria nunca se registra. El saldo de la cuenta cierra,
   la imputación por rubro no.
2. El pago en lote no refleja cómo se trabaja: las transferencias se hacen una por una en el
   homebanking y se revisan de a un jugador. El botón 🧾 de Transferencias
   (`abrirComprobantePrevio`) ya es un parche a esa discrepancia — su propio docstring lo dice.

**El equipo usa esto desde la PC.** La liquidación se hace sentado frente a la computadora,
con el extracto bancario a la vista. El celular es la excepción, no el caso principal: los
modales nuevos se pueden diseñar anchos y a dos columnas, pero **tienen que seguir siendo
usables en el celular** (la app es una PWA y se usa en la cancha para cargar el roster).

## Invariantes que no se pueden romper

Estos son los que sostienen el diseño actual. Romperlos silenciosamente es la peor forma de
fallar en este trabajo.

1. **El comprobante emitido antes de liquidar dice exactamente lo mismo que el que sale
   después.** Por eso `pjItemsDeFila` (index.html) y el armado de `ItemsDetalle` en
   `confirmarPagosJugadores` (Code.gs) están duplicados a propósito — hay un comentario
   avisándolo arriba de `pjUltimoMovimientoDe`. Si se cambia el formato de un lado, se cambia
   del otro.
2. **La suma de `ItemsDetalle` de un movimiento es igual a su `MontoFinal`.** De esto depende
   el prorrateo de Resumen → Por Partido, y `spec/premios.js` lo verifica.
3. **Un neto negativo no genera movimiento.** `pjJugadorConNetoNegativo` (front) y su gemelo
   en `confirmarPagosJugadores` (backend) cortan antes de escribir. No se tocan.
4. **`cuenta` es única por movimiento** y el saldo por cuenta depende de eso. Un hecho
   económico que toca dos rubros son dos movimientos, no uno con dos rubros.

## Reglas de trabajo

- **Deploy en dos partes.** `index.html` se publica solo; `Code.gs` hay que **redeployarlo a
  mano** en Apps Script. Si se toca el backend, avisarlo explícitamente al terminar.
- **Migración de hojas gratis.** `getOrCreateSheet` (Code.gs) completa los headers faltantes
  cuando el catálogo de columnas creció. Por eso las columnas nuevas se agregan **siempre al
  final** del array de `_COLS`, nunca en el medio: los índices posicionales de todo el código
  se corren.
- **Tests.** No hay `package.json`; las suites corren con `node spec/<archivo>.js`. Después de
  cada fase, correr las cinco (`premios`, `frontend`, `reparto`, `entradas`, `publico`) y
  agregar casos para lo nuevo.
- **Costo de Apps Script.** Cada acción es una ejecución de ~1-3 s y corren de a una. Un solo
  POST por acción del usuario. No encadenar POSTs.
- **Commitear por fase**, con el mensaje describiendo qué quedó funcionando.

---

# Fase 1 — Celular del jugador

Independiente del resto. Se puede hacer y desplegar sola.

## Backend (`Code.gs`)

- `CFGJ_COLS` → agregar `"Celular"` **al final** (queda en el índice 9, después de `Premios`).
- `listConfigJugadores`: mapear `celular: String(r[9]||"")`.
- `saveConfigJugador`: escribirlo en las dos ramas (update y append).

## Frontend (`index.html`)

- `openConfigJugadorModal` / su función de guardado: campo de texto "Celular (WhatsApp)".
- Guardar **tal cual lo escribe el usuario**. La normalización se hace recién al armar el
  link, no al guardar: si se normaliza al guardar, un número mal tipeado queda corrupto y no
  se puede corregir mirando la celda.

## Helper de normalización

Agregar una función que convierta lo que sea que haya escrito el usuario al formato que pide
`wa.me` (sólo dígitos, con código de país). Para Argentina:

- Sacar espacios, guiones, paréntesis y `+`.
- Si empieza con `0`, sacarlo (es el prefijo de larga distancia nacional).
- Sacar el `15` cuando aparece después del código de área (formato viejo de celular).
- Si no empieza con `54`, anteponerlo.
- Si después del `54` no viene un `9`, insertarlo (WhatsApp lo exige para celulares argentinos).

Ejemplos que tienen que funcionar — usarlos como casos de test en `spec/frontend.js`:

| Escrito por el usuario | Link |
|---|---|
| `3492 123456` | `5493492123456` |
| `03492 15 123456` | `5493492123456` |
| `+54 9 3492 123456` | `5493492123456` |
| `5493492123456` | `5493492123456` |

Si el resultado no tiene entre 12 y 14 dígitos, tratarlo como inválido: el botón de WhatsApp
queda deshabilitado con un tooltip que diga que el celular no es válido, en vez de abrir un
link roto.

---

# Fase 2 — Columna `CodRubroContra` en *Pagos Jugadores* (backend, invisible)

No cambia nada visible. Deja el dato disponible.

## Qué es

Un descuento sobre el sueldo puede ser de dos naturalezas distintas, y hoy se tratan igual:

- **Adelanto ya entregado** — el 1/8 le diste $20 en efectivo y lo registraste como EGRESO
  rubro 19 ese día. Al liquidar el mes, el egreso correcto es el neto: los otros $20 ya están
  contabilizados. **El neteo actual es correcto.** `CodRubroContra` va vacío.
- **Descuento con contrapartida** — el club le vendió o le cobró algo (camiseta, multa,
  vianda, alquiler). Hay un ingreso real que hoy no se registra en ningún lado. **El neteo
  actual está mal.** `CodRubroContra` lleva el código del rubro del ingreso.

Vacío = comportamiento idéntico al de hoy. Por eso no hay backfill ni riesgo de regresión.

## Cambios

- `PJ_COLS` → agregar `"CodRubroContra"` **al final**.
- `listPagosJugadores` → mapear el campo.
- `savePagoJugador` → escribirlo en las **dos** ramas (update por id y append).

---

# Fase 3 — Cargar el descuento con su rubro (frontend)

## 3a. Selector de rubro en el modal de descuento

En `abrirDescuentoModal` (index.html), agregar un `<select>` opcional debajo del motivo:

```
Imputar a rubro
  [— Solo descontar (adelanto ya entregado) —]   ← opción por defecto, value ""
  [INDUMENTARIA Y MERCH.]
  [LIGA - FICHAJES Y MULTAS]
  [Vianda]
  …todas las de RUBROS
```

`guardarDescuento` manda `codRubroContra` en el objeto `pago`.

Reemplazar el texto de la nota de abajo por uno que explique la diferencia — es lo que va a
recordar la distinción dentro de seis meses:

> Dejalo vacío si es un adelanto que ya le entregaste y ya registraste como egreso. Elegí un
> rubro si el club le vendió o le cobró algo (camiseta, multa, vianda): además del descuento
> se va a registrar el ingreso en ese rubro.

## 3b. El botón de descuento también en *Por partido*

Hoy `− Descuento` vive sólo en `renderPagoMensual`, que filtra `frecuencia === "mensual"`. Un
jugador que cobra por partido no puede cargar un descuento tipado — sólo tiene la columna
*Ajuste*, que es otra cosa (una corrección del monto del partido, no un cobro del club).

Mecánicamente ya funciona: `pjFilasAcumuladoPendiente` levanta las filas sin mirar la
frecuencia y `pjIdsDeSeleccion` las arrastra. Falta el botón.

- Agregar `− Descuento` en la celda de premios de `renderPagoPartido`, al lado del 🏆.
  `abrirDescuentoModal` ya recibe `(jugadorId, nombre, mes)`; se reusa tal cual.
- Renombrar el encabezado de esa columna de **"Premios"** a **"Otros"**. Muestra
  `pjAcumuladoPendiente`, que incluye descuentos (negativos): el nombre actual va a mentir en
  cuanto empiecen a existir.

---

# Fase 4 — Generar sueldo bruto y contrapartidas por separado (backend)

El corazón del cambio. En `confirmarPagosJugadores` (Code.gs).

## Qué cambia

Dentro del loop `for (const g of Object.values(grupos))`, partir las filas del jugador:

- **`filasContra`** — las que traen `CodRubroContra`.
- **el resto** — arma el EGRESO exactamente como hoy.

Al sacar las contrapartidas del cálculo del egreso, **éste queda por el bruto solo**, sin
ninguna lógica especial. Los adelantos (sin rubro) siguen neteando adentro, como corresponde.

Después, **un INGRESO por cada fila de `filasContra`**:

| campo | valor |
|---|---|
| `codRubro` / `rubro` / `categoria` | el elegido, resuelto contra `RUBROS_MAP` |
| `tipo` / `ingreso` / `egreso` | `"INGRESO"` / `Math.abs(montoFinal)` / `0` |
| `cuenta` / `fecha` / `modoPago` | los mismos del egreso |
| `concepto` | etiqueta + " — " + nombre del jugador (ej. `"Camiseta — Juan Pérez"`) |
| `observacion` | algo que deje claro que salió del sueldo, ej. `"Descontado del sueldo"` |
| `jugadorId` / `jugadorCT` | los del jugador, **ambos completos** |
| `partidoId` | **vacío** — ver abajo, es importante |
| `vinculos` | `[{ egresoId: <id del egreso>, monto }]` |
| `itemsDetalle` | vacío |

El egreso se escribe primero para tener su `movId`. Devolver todos los movimientos creados en
`movimientos` del response, como hoy.

## Por qué `partidoId` vacío

`Resumen → Por Partido` excluye las categorías `["Movilidad", "Jugadores y Cuerpo Técnico"]`
(constante `PARTIDO_RES_CATS_EXCLUIDAS` en el front, `PUB_CATS_FUERA_PARTIDO` en Code.gs). El
sueldo bruto queda afuera correctamente. Pero *Indumentaria y Equipamiento* **no** está
excluida: si el ingreso de la camiseta hereda un `partidoId`, esos $20 se suman a la
recaudación de esa fecha, que no tiene nada que ver con la jornada. Lo mismo contamina el
balance público.

## Por qué `jugadorCT` sí se completa

El Top 10 de jugadores del Resumen agrupa por `jugadorCT` y calcula `egr − ing` — el neteo es
el comportamiento buscado, está en el comentario de esa sección. Y el filtro por jugador de
Reportes busca por `normStr(m.jugadorCT).includes(...)`: si el campo va vacío, el ingreso
desaparece del filtro y se pierde justo la trazabilidad que se busca.

## Sobre `Vinculos`

El array vive **siempre en el movimiento de tipo INGRESO**, apuntando al egreso — misma
convención que el reintegro de seguro (rubro 21), que ya usa este mecanismo. Respetarla hace
que la pantalla de vínculos existente muestre el par emparejado sin tocarla, y que
`checkIntegridad` (que ya valida vínculos colgados) cubra el caso nuevo gratis.

## Tests (`spec/premios.js`)

- Jugador con sueldo 100 y descuento 20 **con** `CodRubroContra` → dos movimientos: EGRESO 100
  rubro 19 e INGRESO 20 en el rubro elegido, con `Vinculos` apuntando al egreso.
- El mismo caso **sin** `CodRubroContra` → un solo EGRESO de 80, exactamente como hoy.
- El `ItemsDetalle` del egreso suma 100 (invariante 2).
- El INGRESO no tiene `partidoId`, ni siquiera cuando el lote incluye partidos.
- Neto negativo sigue cortando antes de escribir (invariante 3).

---

# Fase 5 — El comprobante muestra los descuentos con contrapartida

Con la Fase 4, el egreso vale 100 y su `ItemsDetalle` tiene una sola línea de 100. Si no se
toca nada, `movToComprobante` emite un comprobante de $100 — cuando lo que el jugador recibió
fueron $80.

**No** meter las dos líneas en `ItemsDetalle`: rompe el invariante 2.

En cambio, `movToComprobante` (index.html) tiene que buscar los movimientos de tipo INGRESO
cuyo array `vinculos` apunte a este egreso, y agregarlos como **líneas negativas** al final
de los ítems, con `desc` = el concepto del ingreso. El total del comprobante pasa a ser
100 − 20 = 80, que es lo que el jugador recibió.

`abrirComprobantePrevio` **no necesita cambios**: se arma de las filas de *Pagos Jugadores*,
donde el descuento ya es una fila con monto negativo. Verificar que ambos caminos produzcan
los mismos ítems para el mismo caso — es el invariante 1.

---

# Fase 6 — Enviar el comprobante por WhatsApp

## La limitación técnica, primero

`wa.me/<numero>?text=<mensaje>` abre WhatsApp con el texto pre-cargado pero **no permite
adjuntar imágenes**: no hay forma de hacerlo desde una URL. Y `navigator.share` con archivos
no funciona de manera confiable en Chrome de escritorio, que es donde se hace la liquidación.

El flujo que sí funciona en PC es de dos pasos:

1. Copiar la imagen del comprobante al portapapeles
   (`navigator.clipboard.write` con un `ClipboardItem` de tipo `image/png` — Chrome de
   escritorio lo soporta; requiere PNG, no JPG).
2. Abrir `wa.me/<numero>?text=<mensaje>` en una pestaña nueva.
3. El usuario pega con Ctrl+V en WhatsApp Web y manda.

## Implementación

En el modal del comprobante, cuando el receptor es un jugador **con celular válido cargado**,
agregar un botón **"Enviar por WhatsApp"** que haga los pasos 1 y 2 y muestre en
`comp-status` un mensaje breve explicando que la imagen está en el portapapeles y hay que
pegarla (Ctrl+V).

- Si el navegador no soporta escribir imágenes al portapapeles, hacer fallback a descargar la
  imagen y abrir el link igual, avisando que hay que adjuntarla a mano.
- **Llamar a `compConfirmarNumero` también en este camino**, o la numeración se saltea. Hoy
  sólo se llama desde `compExportar`.
- Mantener los botones actuales (`Descargar`, y el share nativo para cuando se usa desde el
  celular). El nuevo no los reemplaza.

## El mensaje pre-formateado

Plantilla, con los datos del comprobante interpolados:

```
Hola {nombre}, te paso el comprobante de la liquidación de {período}.
Total transferido: {total}.
Cualquier cosa avisame. — Club Deportivo Mitre
```

Ponerla en una constante arriba del bloque de comprobantes, junto a `COMP_FIRMAS`, para que se
pueda ajustar sin buscarla. Recordar `encodeURIComponent` sobre el texto armado.

---

# Fase 7 — La pantalla de Liquidación

Reemplaza el pago en lote por uno jugador por jugador.

## Qué se saca y qué se deja en *Transferencias*

- **Se saca** el botón "Confirmar pagos seleccionados" y los checkboxes de jugador. Los
  checkboxes de premio individuales **se quedan**: siguen decidiendo qué premios entran.
- **Se deja** "Exportar listado de transferencias" tal cual. Es el paso previo del flujo real:
  se exporta el listado, se hacen las transferencias en el homebanking, y recién después se
  vuelve a liquidar de a uno con el extracto a la vista.
- **Se dejan** los chips de selección de partidos (`pjPartidosSel`): son de la pantalla, no del
  jugador, y reflejan "estoy liquidando la fecha 12".
- **Se agrega** un botón **"Liquidar"** por fila de jugador.
- El botón 🧾 actual se puede retirar: la previsualización del comprobante pasa a estar
  adentro del modal de liquidación.

`confirmarPagosJugadores` del backend **no se toca por esto**: recibe N ids y agrupa por
jugador. El front simplemente le manda siempre los de uno solo. Si algún día hace falta volver
al lote, el backend lo sigue soportando.

Retirar también `marcarMesPagado` de la subtab *Mensual*: era el segundo camino al mismo
backend y ahora los jugadores mensuales liquidan por el mismo botón que los de partido. Dos
caminos al mismo lugar son dos lugares donde la lógica puede divergir.

## El modal de liquidación

**Uno solo, con todo a la vista.** No encadenar modales: es donde se pierde el contexto y se
confirma sin leer. Y un solo POST al final, por el costo de Apps Script.

Diseñado para pantalla ancha (dos columnas si ayuda), pero que colapse a una sola en pantallas
angostas.

Secciones, de arriba a abajo:

**1. Qué se está liquidando.** Nombre del jugador y la lista explícita de los partidos
incluidos. Con el flujo de a uno ya no es obvio cuáles son: hay que decirlo.

**2. Desglose editable.** Una línea por concepto: partidos, premios, sueldo periódico,
descuentos (con su rubro si lo tienen). Con botones para **agregar, quitar o editar un
descuento ahí mismo**, y el neto a transferir abajo.

> **Esto es lo importante de esta fase.** Hoy el modal del comprobante permite editar los
> ítems libremente (`compAgregarItem`), pero esas ediciones **no vuelven a los datos**: son
> sólo del papel. Editar el descuento ahí y después liquidar produciría un movimiento que no
> coincide con el comprobante que el jugador tiene en la mano. La edición tiene que operar
> sobre las **filas de *Pagos Jugadores***, y el comprobante repintarse a partir de ellas. Es
> el invariante 1.
>
> En consecuencia: **la lista de ítems del comprobante deja de ser editable a mano cuando se
> lo abre desde el flujo de liquidación.** Se puede seguir editando el receptor, la fecha, el
> período y el mensaje, que no afectan montos.

**3. Datos del pago.** Medio de pago, cuenta y fecha (mismos campos que
`abrirMedioPagoModalGenerico`).

**4. Previsualización de lo que se va a registrar.** La lista de movimientos que se van a
crear, con rubro y monto: el EGRESO por el bruto y un INGRESO por cada contrapartida. Que se
vea antes de apretar, no después.

**5. Previsualización del comprobante**, como está hoy en el modal de comprobante.

**6. Botonera.** `Emitir comprobante` (abre el flujo de la Fase 6, sin registrar nada) y
`Liquidar` (registra). Que se puedan usar en cualquier orden: lo normal es emitir primero,
mandarlo por WhatsApp, y liquidar cuando el jugador confirmó que le llegó.

## Estado y robustez

**Feedback en la tabla.** Después de liquidar, la fila muestra un badge `Liquidado ✓` y
desaparece del filtro "solo pendientes". Con 15 jugadores de a uno hay que poder ver por dónde
se va sin contar de memoria.

**Idempotencia.** Se pasa de 1 POST a N. Si uno se corta después de escribir pero antes de
responder (señal intermitente), reintentar duplicaría el movimiento. Antes de reintentar la
liquidación de un jugador, refrescar `listPagosJugadores` y verificar si sus filas ya quedaron
en `pagado`; si ya están, mostrar el resultado en vez de volver a mandar.

## Tests (`spec/frontend.js`)

- La selección que arma el modal para un jugador da los mismos ids que daba
  `pjIdsDeSeleccion` para ese jugador (la regla de que un premio no se cobra solo tiene que
  sobrevivir al rediseño).
- Un jugador mensual y uno por partido producen la misma estructura de liquidación.
- Los ítems del comprobante previo coinciden con los del comprobante armado del movimiento ya
  liquidado, para el mismo caso con descuento con contrapartida (invariante 1).

---

# Verificación final

Después de la última fase:

1. Correr las cinco suites de `spec/`.
2. Mostrar el diff completo agrupado por fase.
3. Repasar explícitamente los cuatro invariantes de arriba y decir dónde quedó verificado cada
   uno.
4. Recordar que **`Code.gs` necesita redeploy manual** en Apps Script.
