# Tesorería Fútbol Mayor — Funcionalidades

Catálogo de todo lo que hace la app, pensado como especificación para el día que haya que
migrarla (app nativa + base de datos). Describe **qué** hace y **qué reglas** sigue; el
**cómo** está en el código y en las pruebas de `spec/`.

> **Regla de mantenimiento:** cada cambio funcional actualiza este archivo en el mismo commit:
> la sección que corresponda y una línea en el [Historial](#historial-de-cambios).
> Ver `CLAUDE.md`.

Última revisión completa: 2026-10-14.

---

## 1. Arquitectura

| Capa | Hoy | Notas para migrar |
|---|---|---|
| Front | `index.html` único (HTML + CSS + JS sin framework), PWA, GitHub Pages | ~14.500 líneas; todo el estado vive en memoria y en `localStorage` |
| Back | Google Apps Script (`Code.gs`) como Web App, una acción por `action` | ~3.500 líneas; `handleAction(data)` es el despachador |
| Datos | Google Sheet (una hoja por entidad, ver §2) | Las hojas se crean y completan solas (`getOrCreateSheet`) |
| Archivos | Google Drive (comprobantes adjuntos, backups) | |
| Sitio público | Repo aparte `futbol-mayor`, lee `?action=publico` (GET) | Sólo agregados, nada nominal |

Convenciones transversales:
- **IDs como vínculo, nombre como copia legible.** Cada referencia entre hojas va por ID; la
  columna de texto con el nombre es para leer la planilla a ojo. Renombrar reescribe el texto en
  cascada por ID (`cascadeNombre_`). Aplica a jugadores, grupos, adherentes y cuentas.
- **Rubros y métodos de pago están en código** (`RUBROS` en index.html y `RUBROS_MAP` en
  Code.gs, sincronizados a mano), no en hojas. `CodRubro` es la referencia; `Rubro` y
  `Categoria` se completan solos al guardar (`normalizeMovFields`).
- **Montos siempre brutos.** Lo que se carga es lo que se cobró o pagó; netos e impuestos se
  calculan.
- **JSON dentro de celdas** (en una base serían tablas intermedias): `Grupos.Miembros`,
  `Config Jugadores.Premios`, `Pagos Jugadores.PartidosIncluidos`, `Movimientos.Vinculos`,
  `Movimientos.ItemsDetalle`, `Movimientos.Adjuntos`, `Cuentas.InternosExentos`.

---

## 2. Modelo de datos (hojas)

| Hoja | Columnas |
|---|---|
| **Movimientos** | ID, MES (`YYYYMM`), Fecha, CodRubro, Rubro, Categoria, Concepto, Egreso, Ingreso, MontoFinal, Cuenta, CuentaDestino, ModoPago, JugadorCT, Adherente, Observacion, Comprobante, SeguroReintegro, Tipo, timestamp, PartidoID, EventoID, Vinculos, ItemsDetalle, JugadorID, AdherenteID, Adjuntos, ImpDC, CuentaID, CuentaDestinoID, MiembrosGrupo |
| **Cuentas** | ID, Nombre, Activa, Orden, AlicImpDC, InternosExentos |
| **Jugadores** | ID, Nombre, Activo |
| **Grupos** | ID, Nombre, Miembros (JSON de IDs de jugadores), Activo |
| **Adherentes** | ID, Nombre, Activo, CuotaMensual, CuotasAnuales |
| **Pagos_Adh** | ID, AdherenteID, AdherenteNombre, Mes, Estado (PAGADO/PENDIENTE), MovimientoID, timestamp |
| **Partidos** | ID, Fecha, Rival, NumeroFecha, Condicion (LOCAL/VISITANTE), Activo, Torneo, EntradasDamas, EntradasCaballeros |
| **Eventos** | ID, Nombre, Fecha, Activo |
| **Config Jugadores** | IdJugador, Nombre, MontoTitular, MontoSuplenteConMin, MontoSuplente, Frecuencia (partido/quincenal/mensual), Alias, Activo, Premios (JSON), Celular, CodRubroSueldo, Apodo, DiaPago |
| **Pagos Jugadores** | ID, JugadorId, JugadorNombre, PartidosIncluidos (JSON), MontoBase, Ajuste, MotivoAjuste, MontoFinal, Estado, FechaPago, MedioPago, Etiqueta, MovimientoID, Mes, Tipo, PartidoID, CodRubroContra, MovimientoOrigenID, Fecha |
| **Roster Partidos** | IdPartido, JugadorId, JugadorNombre, Rol (titular/suplenteConMin/suplente/noJugo) |
| **Reservas** (granos) | ID, Fecha, Grano, Tipo (COSECHA/VENTA/AJUSTE/PEDIDO), Kg, Nota, MovimientoID, timestamp, PrecioTn, PedidoID |
| **Config** | Clave, Valor (pares sueltos: métodos de pago, precios de granos, último comprobante, marcas de seed; `cuentas` se mantiene como respaldo para apps viejas) |
| **Migracion_Log** | timestamp, BatchId, MovId, Campo, ValorOriginal, ValorNuevo |
| Mapeo público / Config sitio | Las edita M a mano; alimentan el sitio público |

Tipos de movimiento: **INGRESO**, **EGRESO**, **INTERNO** (transferencia entre cuentas: sale de
`Cuenta`, entra a `CuentaDestino`, no cambia el total del club) y **AJUSTE** (diferencia de
conciliación contra el saldo real, con signo en `MontoFinal`).

Categorías padre: Ingresos de cancha · Ingresos varios · Publicidad, Aportes y Sponsors ·
Jugadores y Cuerpo Técnico · Gastos Médicos · Gastos Operativos Cancha · Obras y Mant. Cancha ·
Indumentaria y Equipamiento · Administrativos y Financieros · Movilidad · Peñas y Eventos ·
Otros / Internos · Internos.

---

## 3. Pantallas

### 3.1 Nuevo movimiento (formulario de alta y edición)
- Tipo (Ingreso / Egreso / Interno / Ajuste), fecha (el mes se deriva), rubro con buscador
  insensible a tildes y manejable con teclado, concepto, monto, cuenta, método de pago (se
  sugiere según la cuenta: EFECTIVO → EFECTIVO, el resto → TRANSFERENCIA), jugador/CT o grupo,
  partido, evento, adherente, observación, nro. de comprobante, adjuntos.
- Rubro 49 fuerza tipo Interno; Interno pide cuenta destino distinta de la de origen.
- **Ajuste:** se ingresa el saldo real de la cuenta y la app registra la diferencia contra el
  saldo calculado.
- **Cobro dividido:** un cobro que entró por varias cuentas se guarda como un movimiento por
  cuenta (clones que comparten rubro, concepto, partido y evento).
- **Partido → entradas vendidas:** con un rubro de entradas y un partido elegido, se cargan
  damas/caballeros y se guardan en el partido.
- **Reintegro del seguro** (rubro 21, egreso): casilla "Tiene reintegro del seguro".
- **Descontar del sueldo** (rubros 18/19, egreso a un jugador): marca el egreso como adelanto que
  se netea en la liquidación del mes elegido (crea la fila en Pagos Jugadores en la misma acción).
- **Imp. débitos y créditos:** si toca una cuenta con alícuota, casilla "Paga imp. déb/créd" con
  el neto del extracto (ver §4.1).
- **Avisos antes de guardar** (sólo en altas; con "¿Guardar igual?"): fecha futura · gasto
  médico sin marca de reintegro · gasto médico sin comprobante adjunto · rubro 6 sin adherente ·
  rubro de partido sin partido (1, 2, 3, 4, 14a, 12, 13, 36, 14b).
- Al guardar muestra un modal con el resumen del movimiento.

### 3.2 Movimientos del mes
- Navegación por mes; KPIs de ingresos, egresos, saldo del mes y saldo acumulado del año (con
  filtro de cuenta, los internos cuentan como ingreso/egreso de esa cuenta).
- Filtros: tipo, rubro, categoría, cuenta, adherente, jugador/CT, partido, evento, texto;
  filtros por columna estilo Excel en la vista tabla. Todo insensible a tildes/mayúsculas.
- Vista tabla (columnas configurables, con "Neto extracto") o tarjetas; orden por fecha
  (desempata por orden de carga) o monto.
- Tarjeta **Imp. débitos y créditos del mes** por cuenta gravada, con botón para cargar el
  egreso.
- **Vista Cards (pensada para el celular)** con encabezado propio; la vista Tabla no cambia:
  mes + íconos de exportar y actualizar en una fila; KPIs 2×2 con el monto completo; imp.
  déb/créd en una sola línea (pendiente total y cantidad de cuentas, o "✓ cargado") que se
  despliega con una fila por cuenta y su botón; buscador + botón **Filtros** (con la cantidad
  activa) que abre una hoja con cuenta, rubro, categoría, adherente, jugador/CT, partido, evento
  y el cambio de vista (también a la vista junto al orden); tipo como chips; filtros activos como chips con ✕. Lista en filas
  compactas agrupadas por día con el neto del día (ordenada por monto, sin agrupar y con la
  fecha en cada fila).
- Detalle del movimiento: editar, eliminar (con confirmación), comprobante imprimible, adjuntos.
- Exportar a Excel el mes (respeta filtros y vista).

### 3.3 Resumen (sub-pestañas)
- **Mensual:** totales, saldo por cuenta, tabla por categoría → rubro.
- **Por partido:** entradas (rubros 1 y 4), buffet (2, ingreso/egreso), gastos de cancha
  (12, 13, 14b, 36), otros; excluye Movilidad y Jugadores y CT. Los movimientos con
  `ItemsDetalle` se prorratean entre partidos. Placa para redes (JSON, o botón que abre el generador de placas con los datos ya cargados;
  la bajada lleva "(Visitante)" si el partido es de visitante) y balance del partido.
- **Adherentes:** planilla mes a mes de cuotas, deudores, buscador, exportación.
  Rubros de aporte de adherente: 5, 6 y 42. Aportes de combustible sin adherente se agrupan.
- **Jugadores:** gasto por jugador/grupo por mes (multi-mes), columnas por tipo de gasto
  (viandas, almacén, alquiler y gastos casa, movilidad = rubros 15, 22, 40, 41), totales y
  promedios, orden por columna, exportación.
- **Reintegros:** gastos médicos con reintegro, vínculo egreso ↔ ingreso de reintegro
  (`Vinculos`), pendientes, diferencia cuando el reintegro supera lo abonado, exportación a
  Excel y PDF.
- **Patrimonio:** saldo de cuentas + valor de los granos en stock.
- **Reportes:** tabla Categoría → Rubro → Movimiento (o sólo categoría, o sólo rubro), filtros
  por mes y cuenta, exportación.
  Vista Tabla o **Cards** (pensada para el celular, con el mismo cambio Tabla/Cards que
  Movimientos): período + exportar en una fila, meses como chips, buscador + hoja de **Filtros**
  (cuentas, categorías, rubros, conceptos, jugador/CT, adherente) con los activos como chips,
  totales Ingresos/Egresos/Neto arriba, "Ver por" como selector y cada grupo como tarjeta con el
  nombre a lo ancho e Ing./Egr./Neto en columnas fijas; los montos achican la letra según el
  espacio en vez de partirse. Con el celular apaisado se ve siempre la Tabla.
  Filtro **Mostrar: Neto / Ingresos / Egresos** (en las dos vistas). Filtrando por Jugador/CT, un
  movimiento cargado a un grupo que lo incluye entra con **su parte** (monto ÷ miembros, mismo
  reparto que Resumen › Jugadores, ver `miembrosDelMovimiento`) y la marca "(1/N de GRUPO)", también
  en el Excel; buscando por el nombre del grupo va entero.
- Eventos (peñas): resumen por evento (rubros 54–62 con `EventoID`).

### 3.4 Entidades (sub-pestañas)
- **Jugadores:** alta, renombrar (cascada por ID), baja lógica.
- **Grupos:** nombre e integrantes (los IDs de jugadores y grupos son únicos entre ambas hojas).
- **Adherentes:** alta, baja, cuota mensual, historial de pagos con toggle PAGADO/PENDIENTE.
- **Partidos:** fecha, rival, fecha nro., local/visitante, torneo, entradas damas/caballeros;
  asociación rápida de movimientos a un partido.
- **Cobros** (Config Jugadores): montos por rol, frecuencia, alias, celular, apodo, día de pago,
  rubro de sueldo, premios.
- **Eventos:** peñas y eventos.
- **Granos:** reserva de granos del campo — stock por grano, cosechas, pedidos de liquidación,
  cobros (venta con su movimiento de ingreso y precio por tonelada), ajustes (comisión),
  historial. Secciones plegables.

### 3.5 Jugadores $ (Pagos a jugadores)
- **Por partido:** roster (titular / suplente con minutos / suplente / no jugó) → monto según la
  ficha del jugador; premios.
- **Mensual:** sueldo mensual/quincenal, edición de montos pendientes, descuentos y premios.
- **Transferencias:** liquidación **de a un jugador** (un modal, un solo guardado) que genera los
  egresos: sueldo bruto y contrapartidas de descuentos como movimientos separados, cada uno con
  su rubro. Se puede revertir una liquidación.
- Comprobante de pago (imagen) editable, envío por WhatsApp (link wa.me + imagen al
  portapapeles), envío en lote (frena ante un problema, no saltea en silencio), copiar alias,
  texto para transferir por Mercado Pago.
- **Recordatorios de sueldo:** jugadores mensuales con día de pago avisan en todas las
  pantallas desde 3 días antes, distinguiendo "sin cargar" de "cargado sin pagar". Se ocultan
  sólo por el día.

### 3.6 Configuración
- **Cuentas (ABM en modal):** nombre, activa, % de imp. déb/créd y cuentas con las que los
  internos no pagan. Renombrar actualiza todos sus movimientos. Sólo se borra una cuenta sin
  movimientos; si tiene, se desactiva (deja de ofrecerse para cargar, sus movimientos quedan).
- Métodos de pago, exportar/importar Excel, recargar datos, backups locales por día (ver una
  copia vieja en sólo lectura), versión de la app, auditoría, vincular movimientos por ID, fijar integrantes de grupos,
  completar tipo de pagos a jugadores, diagnóstico de arranque, integridad de datos (referencias
  rotas en IDs y en los JSON), atajos de teclado.

---

## 4. Reglas de negocio

### 4.1 Impuesto a los débitos y créditos (Ley 25.413)
- Cada cuenta tiene una alícuota (MP: 0,6 %). Se carga el **bruto**; el neto se calcula:
  crédito → entra bruto × (1 − t); débito → sale bruto × (1 + t).
- Pagan: ingresos y egresos de la cuenta, y **cada lado** de un interno (origen como débito,
  destino como crédito), salvo que la otra cuenta esté en `InternosExentos`.
- No pagan: rubro 9 (rendimientos y el propio impuesto), ajustes.
- Excepción manual por movimiento en `ImpDC`: `EXENTO` / `GRAVADO` / vacío (= regla). Si la
  casilla queda como dice la regla, no se guarda marca, así un cambio de configuración sigue
  aplicando.
- Impuesto del mes = alícuota × (Σ créditos + Σ débitos brutos gravados), calculado sobre la
  suma. Se registra como **un** egreso del rubro 9 a fin de mes; la app lo arma con un botón.

### 4.2 Cuentas
- Hoja Cuentas con ID; los movimientos guardan `CuentaID`/`CuentaDestinoID`. Si un movimiento
  llega con ID, manda el ID (el nombre se toma de la hoja). Si llega sólo con nombre, se busca el
  ID. Las filas sin ID se completan al leer las cuentas.
- Migración automática desde Config (`cuentas`, `impDebCred`); cuentas que sólo aparecen en
  movimientos viejos entran desactivadas.
- Cuenta corriente con terceros (p. ej. Comisión Directiva paga algo por Fútbol Mayor desde su
  cuenta): cuenta propia "CD" + egreso desde CD + interno de compensación (decisión de uso, no
  de código).

### 4.3 Adherentes
- Un ingreso de rubro de adherente con adherente elegido marca PAGADO el mes en `Pagos_Adh`;
  borrar el movimiento lo revierte a PENDIENTE.

### 4.4 Pagos a jugadores
- Monto por partido según rol; mensual/quincenal según ficha.
- Adelantos (egreso rubro 18/19 marcado "descontar del sueldo") quedan como descuento pendiente
  y se netean en la liquidación; no generan otro movimiento.
- La liquidación genera sueldo bruto + contrapartidas por rubro (`CodRubroContra`); nada de
  esto entra en Resumen por Partido.

### 4.5 Grupos
- `JugadorCT` guarda un solo nombre (jugador **o** grupo); el prorrateo por cabeza es una
  imputación, no una medición.
- **Integrantes guardados (`MiembrosGrupo`):** un movimiento de grupo guarda los IDs de quienes lo
  formaban al cargarlo, y el reparto por persona (Resumen › Jugadores, Reportes) usa esos. Editar el
  movimiento los conserva mientras siga en el mismo grupo; pasarlo a otro grupo toma los de ese.
  Sacar a alguien de un grupo no cambia lo ya cargado. Los movimientos sin integrantes guardados
  (anteriores a la columna, o dados de alta por pagos/premios) usan la composición actual hasta
  correr **Fijar integrantes de grupos** (Configuración), que los completa con la de ese momento.

### 4.6 Integridad
- Borrar sólo si el ID identifica exactamente una fila; IDs duplicados no se pisan (`saveMov`
  genera otro ID).
- Editar un movimiento conserva su `timestamp` de alta (orden de carga).
- Columnas que escribe una sola acción (Adjuntos, ImpDC) no se pisan desde una edición que no
  las conoce.

---

## 5. Integraciones y operación

- **Comprobantes adjuntos:** fotos/PDF a Drive (`Comprobantes Tesorería/<año>/<rubro>/`),
  máx. 5 MB, fotos comprimidas a 1600 px, no se comparten, al borrar van a la papelera.
- **Comprobante imprimible** de un movimiento (escudo, tres firmas), editable antes de exportar.
- **WhatsApp:** normaliza el celular a formato wa.me (54 9 …).
- **Sitio público:** `doGet ?action=publico` devuelve sólo agregados, con caché de 1 hora.
- **Backup diario** de la planilla a Drive (trigger), sin duplicar el del día.
- **Excel:** exportar movimientos (mes, filtrado, todo) e importar.
- **Offline / PWA:** arranque desde la copia local, cola de movimientos pendientes que se
  sincroniza al volver la conexión, aviso de nueva versión (`SW_VERSION` en `sw.js`), botón
  atrás en Android que pide un segundo toque para salir.
- **Seguridad:** clave numérica en la propiedad `CLAVE_APP` del Apps Script, validada en cada
  pedido; 10 intentos fallidos bloquean 15 minutos. La URL del backend está fija en el código.
- **Deploy:** ver `DEPLOY.md`.

---

## 6. Pruebas

`node spec/<archivo>.js`. `harness.js` emula Google Sheets para correr `Code.gs`; las demás
cargan el `<script>` de index.html en Node.

| Archivo | Cubre |
|---|---|
| frontend.js | Reglas del front (pagos a jugadores, premios, filtros, reparto de grupos en Reportes, etc.) |
| harness.js / bootstrap.js | Backend básico y carga inicial en una sola consulta |
| premios.js, reparto.js, entradas.js, granos.js, adjuntos.js, publico.js, seguridad.js | Cada módulo |
| impdc.js | Impuesto a los débitos y créditos |
| cuentas.js | ABM de cuentas, migración, renombre en cascada |
| avisos.js | Avisos de olvido al guardar |
| grupos.js | Integrantes de grupo guardados en el movimiento (alta, edición, Fijar integrantes) |

---

## 7. Pendientes y deuda conocida

- Los JSON en celdas (§1) son el punto más caro de migrar a una base.
- Composición histórica de grupos (hoy sólo la actual).
- Sitio público: corte mensual y mapeo a los 10 grupos públicos en `construirDatosPublicos_`.
- `README.md` está desactualizado: este archivo es la referencia.

---

## Historial de cambios

Una línea por cambio funcional, la más nueva arriba. Lo anterior a 2026-10-13 se resume por mes
a partir del historial de git.

| Fecha | Cambio |
|---|---|
| 2026-10-28 | Placa: escribir 0 en un renglón (ej. GoPass) lo muestra en la placa como $0; vacío lo oculta. |
| 2026-10-28 | Placa: botón "Abrir en el generador" (pasa los datos sin copiar/pegar) y "(Visitante)" en la bajada de los partidos de visitante. |
| 2026-10-21 | Grupos: cada movimiento de grupo guarda sus integrantes (`MiembrosGrupo`); el reparto por persona ya no cambia si alguien sale del grupo. Botón Fijar integrantes en Configuración. |
| 2026-10-21 | Reportes: filtro Mostrar Neto/Ingresos/Egresos; filtrando por jugador, el gasto de grupo entra con su parte individual. |
| 2026-10-20 | Nuevo movimiento: al elegir un rubro que redibuja el formulario (21, 49, de partido…) el foco no se pierde; Tab sigue en Concepto. |
| 2026-10-20 | Reportes: vista Cards para el celular con cambio Tabla/Cards; apaisado muestra la Tabla; la app ya no queda fija en vertical (`manifest.json` → `orientation: any`). |
| 2026-10-19 | Movimientos: nuevo layout de la vista Cards para el celular (KPIs 2×2, imp. déb/créd en una línea, filtros en hoja, filas compactas por día). |
| 2026-10-14 | Avisos al guardar: rubro 6 sin adherente y rubros de partido sin partido. |
| 2026-10-14 | Este documento. |
| 2026-10-13 | ABM de cuentas en modal, hoja Cuentas con ID, `CuentaID`/`CuentaDestinoID` en Movimientos, renombre en cascada, desactivar/borrar. |
| 2026-10-13 | Impuesto a los débitos y créditos: alícuota por cuenta, neto calculado, marca por movimiento, impuesto del mes con botón para cargarlo. |
| 2026-10 (1–8) | Cobros de granos con tarjetas plegables; Reportes por categoría/rubro; mejora en carga de premios; edición de montos mensuales. |
| 2026-09 | Doble toque para salir; buscador de adherentes; GoPass en placa; apodo de jugadores; envío de comprobantes en lote; texto para transferir por MP; copiar alias; recordatorio de sueldos; PDF de reintegros pendientes; adjuntos; filtros de tabla. |
| 2026-08 | Premios; comprobantes de pago; exportación de adherentes; IDs de jugador y adherente con renombre; revertir liquidación; placa de balance; entradas damas/caballeros; cobro dividido; fases 1–12 de pagos a jugadores (WhatsApp, contrapartidas, liquidación de a uno, adelantos); validación de reintegros en el formulario. |
| 2026-07 | Cuenta Plazo Fijo; torneo en partidos; eventos/peñas; PWA; estados de guardado en todos los ABM; mapeo de reintegros; versión de la app; saldo acumulado; módulo de Pagos a Jugadores; backup diario y copias locales; pagos mensuales y quincenales. |
| 2026-06 | Flag de reintegro; método de pago según cuenta; ajuste de saldo; partidos con resumen; reintegros médicos; mejoras de Movimientos; exportar mes; resumen de jugadores y adherentes; reserva de granos; migración de rubros 16/37; auditoría. |
| 2026-05 | Primera versión; importar movimientos; filtros por rubro y categoría; búsqueda por adherente y jugador; KPIs por jugador. |
