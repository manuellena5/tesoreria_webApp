/* ═══════════════════════════════════════════════════════════════
   TESORERÍA CLUB — Google Apps Script (Code.gs)

   INSTRUCCIONES DE DEPLOY:
   1. Abrí script.google.com → Nuevo proyecto
   2. Borrá todo y pegá este código
   3. Guardá (Ctrl+S), nombrá el proyecto "Tesorería Club"
   4. Clic en "Implementar" → "Nueva implementación"
   5. Tipo: Aplicación web
   6. Ejecutar como: Yo (tu cuenta)
   7. Quién tiene acceso: Cualquier persona
   8. Clic en "Implementar" → autorizás permisos → copiás la URL
   9. Pegá esa URL en la app (pestaña Config)
   
   NOTAS:
   - La Google Sheet se crea automáticamente al ejecutar la primera acción.
   - Para re-deployar con cambios: "Implementar" → "Administrar implementaciones"
     → lápiz de editar → "Nueva versión" → Implementar.
   - Si la hoja es nueva, se crean todas las pestañas con headers al primer uso.
═══════════════════════════════════════════════════════════════ */

// ── Nombres de pestañas ──────────────────────────────────────
const MOV_SHEET = "Movimientos";
const ADH_SHEET = "Adherentes";
const PAG_SHEET = "Pagos_Adh";
const JUG_SHEET = "Jugadores";
const GRP_SHEET = "Grupos";
const CFG_SHEET = "Config";
const PAR_SHEET = "Partidos";
// EntradasDamas/EntradasCaballeros son la asistencia pagada del partido, no plata: viven acá y no
// en el movimiento de recaudación porque un partido puede tener varios movimientos de entradas
// (rubros 1 y 4) y no habría forma de saber cuál lleva el número bueno. Se cargan desde el modal
// de partido o desde el atajo del formulario de movimientos, que escribe sobre esta misma fila.
// Vacías en los partidos históricos: todo consumidor debe tolerar "" y no asumir 0 (ver
// partidoEntradasTotal en index.html, que devuelve null cuando no hay dato cargado).
const PAR_COLS  = ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo","Torneo","EntradasDamas","EntradasCaballeros"];
const EVE_SHEET = "Eventos";
const EVE_COLS  = ["ID","Nombre","Fecha","Activo"];

// ── Pagos a Jugadores (módulo aparte, no integrado a Movimientos todavía) ──
const CFGJ_SHEET = "Config Jugadores";
// Las columnas nuevas van al final (Celular en el 9, CodRubroSueldo en el 10): getOrCreateSheet
// completa los headers que falten, así que agregar acá no rompe los índices posicionales de las
// que ya existían.
// CodRubroSueldo: rubro al que se imputa el EGRESO del sueldo de esta persona. Parte del plantel
// es cuerpo técnico (DT, preparador físico, ayudante) y va al 18 (SUELDO DT Y CT) en vez del 19
// (SUELDO JUGADORES). Vive en la ficha y no se elige en cada liquidación: un DT es siempre un DT,
// y decidirlo en cada pago garantiza que tarde o temprano se pase uno.
// Se guarda el código de rubro y no un campo "tipo: jugador | CT" porque el 18 vs 19 YA es esa
// distinción y Reportes filtra por rubro; un "tipo" aparte sería dato duplicado que puede divergir
// del rubro efectivamente imputado.
// Vacío = "19", que es lo que hacía el código antes de existir la columna: no hay backfill.
const CFGJ_COLS  = ["IdJugador","Nombre","MontoTitular","MontoSuplenteConMin","MontoSuplente","Frecuencia","Alias","Activo","Premios","Celular","CodRubroSueldo"];
// Rubro por defecto del sueldo, y fallback cuando la ficha trae un código que no está en RUBROS_MAP.
const CFGJ_RUBRO_SUELDO_DEFAULT = "19";
// Frecuencia: "partido" | "quincenal" | "mensual"
// Premios: JSON de [{descripcion, monto}] — premios propios del jugador (gol, valla invicta…),
// independientes de la frecuencia. Se aplican desde Pagos Jugadores y generan filas en PJ_SHEET.
const PJ_SHEET = "Pagos Jugadores";
const PJ_COLS  = ["ID","JugadorId","JugadorNombre","PartidosIncluidos","MontoBase","Ajuste","MotivoAjuste","MontoFinal","Estado","FechaPago","MedioPago","Etiqueta","MovimientoID","Mes","Tipo","PartidoID","CodRubroContra","MovimientoOrigenID"];
// PartidosIncluidos: JSON de un array de IDs de partido ("[]" para filas quincenales/mensuales agregadas a mano)
// Estado: "pendiente" | "pagado"
// Mes: "YYYY-MM" (mismo formato que nowMes()/mesLabel() en index.html — NO el "YYYYMM" de MOV_COLS.MES),
// sólo relevante para filas de jugadores "mensual" (partidosIncluidos:[]). Filas viejas pueden tenerlo vacío.
// Tipo: "partido" | "premio" | "periodico" | "descuento". Antes de existir esta columna el tipo se
// deducía de PartidosIncluidos.length, que no distingue un premio de un sueldo periódico (los dos
// van con "[]"): funcionaba de casualidad porque un jugador es o "partido" o periódico, nunca los dos.
// Las filas cargadas antes de la columna lo tienen vacío hasta correr "backfillTipoPagos" — todo lo
// que lea Tipo tiene que tolerar el vacío y caer en la lógica vieja (ver pjTipoFila en index.html).
// PartidoID: partido al que se imputa la fila cuando no viene de un roster — hoy sólo los premios
// (un premio por un gol pertenece al partido en que se hizo). Vacío = sin partido asociado.
// Para las filas de tipo "partido" la fuente de verdad sigue siendo PartidosIncluidos.
// Descuento: fila con MontoFinal NEGATIVO, para que reste del acumulado sin lógica especial en
// ninguna suma existente. Se netea contra el sueldo al confirmar el pago.
// CodRubroContra: sólo para descuentos, y sólo cuando el descuento tiene contrapartida real.
//  - VACÍO = adelanto ya entregado. El egreso del adelanto ya se registró el día que se le dio la
//    plata, así que al liquidar corresponde netear: el jugador cobra el sueldo menos ese adelanto
//    y no hay nada más que asentar. Es el comportamiento de siempre.
//  - CON CÓDIGO = el club le vendió o le cobró algo (camiseta, multa, vianda). Ahí hay un ingreso
//    real que hoy no quedaba registrado en ningún lado: el descuento sale del cálculo del egreso
//    (que pasa a ser el sueldo BRUTO) y se genera un INGRESO propio en ese rubro. Ver
//    confirmarPagosJugadores.
// Vacío en todas las filas viejas = comportamiento idéntico al anterior, sin backfill.
// MovimientoOrigenID: el EGRESO que ya se registró el día que se le entregó la plata al jugador y
// que este descuento viene a netear. NO CONFUNDIR CON MovimientoID, que es la columna de al lado y
// significa lo contrario: el movimiento que esta fila GENERÓ al liquidarla. Las flechas van en
// direcciones opuestas —una apunta hacia atrás (a un movimiento que ya existía), la otra hacia
// adelante (al que creó confirmarPagosJugadores)— y mezclarlas rompe revertirPagosDeMovimiento_.
// El vínculo es documental, no contable: el descuento por adelanto NO genera ningún movimiento
// nuevo, porque el egreso del adelanto ya está asentado. Es el mismo tipo de vínculo que el de los
// reintegros de seguro: sólo dice "este descuento corresponde a este egreso que ya existe".
// Excluyente con CodRubroContra: una fila linkea un movimiento existente (adelanto) o genera uno
// nuevo (contrapartida), nunca las dos cosas — savePagoJugador rechaza si llegan juntas.
// No hay columna espejo en Movimientos: que un movimiento esté descontado se deriva de que exista
// una fila de acá apuntándole. Un flag paralelo sería dato redundante que puede divergir.
const PJ_IX = {
  ESTADO:        9,
  FECHA_PAGO:   10,
  MEDIO_PAGO:   11,
  MOVIMIENTO_ID:13,
  TIPO:         15,
  PARTIDO_ID:   16,
  MOV_ORIGEN_ID:18
};
const ROS_SHEET = "Roster Partidos";
const ROS_COLS  = ["IdPartido","JugadorId","JugadorNombre","Rol"];
// Rol: "titular" | "suplenteConMin" | "suplente" | "noJugo"

// ── Columnas de cada pestaña ─────────────────────────────────
const MOV_COLS = [
  "ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto",
  "Egreso","Ingreso","MontoFinal","Cuenta","CuentaDestino","ModoPago",
  "JugadorCT","Adherente","Observacion","Comprobante","SeguroReintegro","Tipo","timestamp","PartidoID","EventoID",
  "Vinculos","ItemsDetalle","JugadorID","AdherenteID"
];
// Índices de columna (1-based) de MOV_COLS que se escriben o leen sueltos. Están acá
// para que agregar una columna nueva al final no vuelva a desalinear una escritura
// puntual (setVinculos escribía en MOV_COLS.length, que ya apuntaba a ItemsDetalle).
const MOV_IX = {
  JUGADOR_CT:   14,
  ADHERENTE:    15,
  VINCULOS:     23,
  ITEMS:        24,
  JUGADOR_ID:   25,
  ADHERENTE_ID: 26
};
// JugadorID / AdherenteID: el vínculo durable de un movimiento con su entidad. Las columnas
// de texto (JugadorCT, Adherente) quedan como copia legible del nombre — cómoda para leer la
// hoja a ojo, pero NO son la referencia: renombrar reescribe el texto en cascada usando el ID.
// JugadorID puede apuntar a un jugador (hoja Jugadores) o a un grupo (hoja Grupos); los IDs
// son únicos entre ambas. Los movimientos viejos los tienen vacíos hasta correr backfillIds.
// ItemsDetalle: JSON de [{desc, monto, partidoId}, ...] — desglose opcional del movimiento (ej.
// pago de jugador que suma uno o más partidos + premios/ajustes) para precargar conceptos en el
// generador de comprobantes y para que Resumen > Por Partido pueda imputar cada ítem a su
// partido. partidoId es "" para ítems sin partido (premios, ajustes); los ítems viejos que no
// traen este campo se leen igual como partidoId:"" (ver calcPartidoResumenRows en index.html).
// Vacío en la mayoría de los movimientos, que tienen un único concepto.
const ADH_COLS = ["ID","Nombre","Activo","CuotaMensual","CuotasAnuales"];
const PAG_COLS = ["ID","AdherenteID","AdherenteNombre","Mes","Estado","MovimientoID","timestamp"];
const JUG_COLS = ["ID","Nombre","Activo"];
const GRP_COLS = ["ID","Nombre","Miembros","Activo"];
const CFG_COLS = ["Clave","Valor"];
const RES_SHEET = "Reservas";
const RES_COLS  = ["ID","Fecha","Grano","Tipo","Kg","Nota","MovimientoID","timestamp"];
const MIG_SHEET = "Migracion_Log";
const MIG_COLS  = ["timestamp","BatchId","MovId","Campo","ValorOriginal","ValorNuevo"];

// ── Catálogo de rubros (debe mantenerse sincronizado a mano con RUBROS en index.html) ──
// Se usa para sincronizar Rubro/Categoria a partir de CodRubro en cada grabación
// (normalizeMovFields) y para la migración de cod 16 / cod 37 / grafías históricas.
const RUBROS_MAP = {
  "1":   { nombre:"ENTRADAS | CANCHA",                    cat:"Ingresos de cancha" },
  "2":   { nombre:"UTILIDAD BAR Y PARRILLA | CANCHA",     cat:"Ingresos de cancha" },
  "3":   { nombre:"VENTA NÚMERO EN CANCHA | CANCHA",      cat:"Ingresos de cancha" },
  "4":   { nombre:"TRIBUNA | CANCHA",                     cat:"Ingresos de cancha" },
  "14a": { nombre:"GOPASS (ingreso filmación)",           cat:"Ingresos de cancha" },
  "7":   { nombre:"PEÑAS - INGRESOS VARIOS",              cat:"Ingresos varios" },
  "8":   { nombre:"COMISIONES VENTA RIFAS ETC.",          cat:"Ingresos varios" },
  "5":   { nombre:"PUBLICIDAD - Lonas y otros",           cat:"Publicidad, Aportes y Sponsors" },
  "24":  { nombre:"PUBLICIDAD - PAGOS VARIOS",            cat:"Publicidad, Aportes y Sponsors" },
  "6":   { nombre:"ADHERENTES | COLABORADORES",           cat:"Publicidad, Aportes y Sponsors" },
  "18":  { nombre:"SUELDO DT Y CT",                       cat:"Jugadores y Cuerpo Técnico" },
  "19":  { nombre:"SUELDO JUGADORES",                     cat:"Jugadores y Cuerpo Técnico" },
  "20":  { nombre:"GASTOS ATENCION JUGADORES",            cat:"Jugadores y Cuerpo Técnico" },
  "37":  { nombre:"GASTOS ATENCION REFUERZOS|DT",         cat:"Jugadores y Cuerpo Técnico" },
  "43":  { nombre:"Vianda",                               cat:"Jugadores y Cuerpo Técnico" },
  "44":  { nombre:"Almacén",                              cat:"Jugadores y Cuerpo Técnico" },
  "45":  { nombre:"Alquiler",                             cat:"Jugadores y Cuerpo Técnico" },
  "47":  { nombre:"Comida",                               cat:"Jugadores y Cuerpo Técnico" },
  "48":  { nombre:"Otros (Refuerzos/DT)",                 cat:"Jugadores y Cuerpo Técnico" },
  "51":  { nombre:"Arreglos/Compras Casa Refuerzos",      cat:"Jugadores y Cuerpo Técnico" },
  "52":  { nombre:"Impuestos/Servicios Casa Refuerzos",   cat:"Jugadores y Cuerpo Técnico" },
  "53":  { nombre:"Aporte Botines",                       cat:"Jugadores y Cuerpo Técnico" },
  "11":  { nombre:"COBROS Y PAGOS PASE JUGADOR",          cat:"Jugadores y Cuerpo Técnico" },
  "17":  { nombre:"SERVICIO GIMNASIO",                    cat:"Jugadores y Cuerpo Técnico" },
  "21":  { nombre:"GASTOS MEDICOS Y FARMACIA | REINT SEG",cat:"Gastos Medicos" },
  "23":  { nombre:"SEGURO JUGADORES Y CANCHA",            cat:"Gastos Medicos" },
  "12":  { nombre:"SERVICIO DE ÁRBITROS | CANCHA",        cat:"Gastos Operativos Cancha" },
  "13":  { nombre:"SERVICIO POLICIA ADICIONAL | CANCHA",  cat:"Gastos Operativos Cancha" },
  "31":  { nombre:"LIMPIEZA -Servicio y elementos",       cat:"Gastos Operativos Cancha" },
  "26":  { nombre:"ENERGÍA ELÉCTRICA",                    cat:"Gastos Operativos Cancha" },
  "25":  { nombre:"GAS",                                  cat:"Gastos Operativos Cancha" },
  "36":  { nombre:"SERVICIO MEDICO Y AMBULANCIA | CANCHA",cat:"Gastos Operativos Cancha" },
  "14b": { nombre:"SERVICIO DE FILMACIÓN (egreso)",       cat:"Gastos Operativos Cancha" },
  "29":  { nombre:"MANT.CANCHA Y INSTALACIONES",          cat:"Obras y Mant. Cancha" },
  "32":  { nombre:"OBRAS",                                cat:"Obras y Mant. Cancha" },
  "33":  { nombre:"BIENES DE USO",                        cat:"Obras y Mant. Cancha" },
  "35":  { nombre:"INDUMENTARIA Y MERCH.",                cat:"Indumentaria y Equipamiento" },
  "27":  { nombre:"PELOTAS - EQUIPO DEPORTIVO",           cat:"Indumentaria y Equipamiento" },
  "9":   { nombre:"INTERESES Y GASTOS CUENTA",            cat:"Administrativos y Financieros" },
  "10":  { nombre:"LIGA - FICHAJES Y MULTAS",             cat:"Administrativos y Financieros" },
  "28":  { nombre:"LIBRERÍA",                             cat:"Administrativos y Financieros" },
  "30":  { nombre:"SERVICIOS GENERALES | M. de Obra",     cat:"Administrativos y Financieros" },
  "16":  { nombre:"MOVILIDAD-APORTES Y GASTOS",           cat:"Movilidad" },
  "15":  { nombre:"Combustible",                          cat:"Movilidad" },
  "22":  { nombre:"Remís",                                cat:"Movilidad" },
  "40":  { nombre:"Viático",                              cat:"Movilidad" },
  "41":  { nombre:"Colectivo/Pasaje",                     cat:"Movilidad" },
  "42":  { nombre:"APORTE MOVILIDAD",                     cat:"Movilidad" },
  "34":  { nombre:"CEREAL - INGRESOS Y GASTOS",           cat:"Otros | Internos" },
  "38":  { nombre:"INGRESOS Y GASTOS SUBCOM",             cat:"Otros | Internos" },
  "39":  { nombre:"SALDO NOCTURNO",                       cat:"Otros | Internos" },
  "49":  { nombre:"TRANSFERENCIA ENTRE CUENTAS",          cat:"Internos" },
  "50":  { nombre:"SALDO INICIAL / APERTURA",             cat:"Internos" },
  "54":  { nombre:"PEÑA-BUFFET",                          cat:"Peñas y Eventos" },
  "55":  { nombre:"PEÑA-GASTOS BUFFET",                   cat:"Peñas y Eventos" },
  "56":  { nombre:"PEÑA-INGRESO TARJETAS",                cat:"Peñas y Eventos" },
  "57":  { nombre:"PEÑA-GASTOS COMIDA",                   cat:"Peñas y Eventos" },
  "58":  { nombre:"PEÑA-SHOW",                            cat:"Peñas y Eventos" },
  "59":  { nombre:"PEÑA-COLABORACIONES",                  cat:"Peñas y Eventos" },
  "60":  { nombre:"PEÑA-RETIROS",                         cat:"Peñas y Eventos" },
  "61":  { nombre:"PEÑA-OTROS GASTOS",                    cat:"Peñas y Eventos" },
  "62":  { nombre:"PEÑA-OTROS INGRESOS",                  cat:"Peñas y Eventos" },
};

// ════════════════════════════════════════════════════════════
// ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doPost(e) {
  // Serializa todas las acciones sobre la hoja: sin este lock, dos requests
  // concurrentes (dos borrados casi simultáneos, o la sincronización offline
  // corriendo en paralelo con una acción en vivo) pueden leer los mismos
  // índices de fila antes de escribir. El segundo termina operando sobre una
  // fila que ya no es la que pensaba (el sheet se corrió al borrar/insertar
  // la primera), borrando/editando la fila equivocada y dejando intacto el
  // registro que el usuario sí quería eliminar — que "reaparece" en el
  // próximo listMov porque nunca se borró de verdad.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({ ok: false, error: "El servidor está ocupado, probá de nuevo en unos segundos." });
  }
  try {
    const data   = JSON.parse(e.postData.contents);
    const result = handleAction(data);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // El sitio público (repo futbol-mayor) pega contra ?action=publico. Va por GET y no por POST
  // porque un POST desde otro dominio dispara preflight CORS, que Apps Script no contesta.
  const accion = e && e.parameter ? e.parameter.action : "";
  if (accion === "publico") {
    // Caché de una hora: la página es pública y no se sabe cuánta gente va a entrar, pero la hoja
    // sólo cambia cuando el tesorero carga algo. Sin esto, mil visitas serían mil lecturas de la
    // planilla y se agota la cuota diaria de Apps Script.
    const cache = CacheService.getScriptCache();
    const hit = cache.get("publico_v1");
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    const txt = JSON.stringify(construirDatosPublicos_());
    try { cache.put("publico_v1", txt, 3600); } catch (err) {}   // >100KB no entra en caché: se sirve igual
    return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: "Tesorería Club API activa" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// DATOS PÚBLICOS  (alimentan el sitio de balances)
// ════════════════════════════════════════════════════════════
//
// Devuelve SÓLO agregados. Ningún movimiento suelto, ningún nombre de jugador o adherente, ningún
// monto individual: aunque alguien encuentre la URL, no hay nada personal para sacar.
//
// El freno es la clave `publicado_hasta` de la hoja Config (formato YYYY-MM-DD). Nada posterior a
// esa fecha se publica. Sin esa clave no se publica nada — es a propósito: que el default sea "no
// mostrar" evita que un mes a medio cargar aparezca solo el día que se deploye esto.

const PUB_RUBROS_ENTRADAS = ["1", "4"];              // entradas y tribuna
const PUB_RUBROS_BUFFET   = ["2"];
const PUB_RUBROS_CANCHA   = ["12", "13", "14b", "36"]; // árbitros, policía, filmación, médico
const PUB_CATS_FUERA_PARTIDO = ["Movilidad", "Jugadores y Cuerpo Técnico"];
const PUB_RUBROS_PENA     = ["54","55","56","57","58","59","60","61","62"];

function pubLeer_(sheet, cols) {
  const all = getOrCreateSheet(sheet, cols).getDataRange().getValues();
  return all.length <= 1 ? [] : all.slice(1);
}

function pubConfig_(clave) {
  const filas = pubLeer_(CFG_SHEET, CFG_COLS);
  for (let i = 0; i < filas.length; i++) if (String(filas[i][0]) === clave) return String(filas[i][1] || "");
  return "";
}

function pubSemestre_(fecha) {
  const anio = fecha.slice(0, 4), mes = Number(fecha.slice(5, 7));
  return { id: anio + (mes <= 6 ? "-S1" : "-S2"),
           nombre: (mes <= 6 ? "1er" : "2do") + " semestre " + anio,
           desde: anio + (mes <= 6 ? "-01-01" : "-07-01"),
           hasta: anio + (mes <= 6 ? "-06-30" : "-12-31") };
}

function construirDatosPublicos_() {
  const corte = pubConfig_("publicado_hasta");
  const base = { club: "Club Deportivo Mitre", equipo: "Fútbol Mayor", actualizado: corte, periodos: [] };
  if (!corte) { base.aviso = "Falta la clave publicado_hasta en la hoja Config"; return base; }

  const movs = pubLeer_(MOV_SHEET, MOV_COLS)
    .map(r => ({ fecha: formatFecha(r[2]), codRubro: String(r[3] || ""), categoria: String(r[5] || ""),
                 egreso: Number(r[7] || 0), ingreso: Number(r[8] || 0), tipo: String(r[18] || ""),
                 partidoId: String(r[20] || ""), eventoId: String(r[21] || "") }))
    .filter(m => m.fecha && m.fecha <= corte && (m.tipo === "INGRESO" || m.tipo === "EGRESO"));

  const partidos = {}, eventos = {};
  pubLeer_(PAR_SHEET, PAR_COLS).forEach(r => {
    if (r[0] && String(r[5]) !== "false") partidos[String(r[0])] = {
      fecha: formatFecha(r[1]), rival: String(r[2] || ""), local: String(r[4] || "LOCAL") === "LOCAL",
      torneo: String(r[6] || ""),
      publico: (Number(r[7]) || 0) + (Number(r[8]) || 0)
    };
  });
  pubLeer_(EVE_SHEET, EVE_COLS).forEach(r => {
    if (r[0] && String(r[3]) !== "false") eventos[String(r[0])] = { nombre: String(r[1] || ""), fecha: formatFecha(r[2]) };
  });

  // Un período por semestre con movimientos. Se arma sobre la marcha en vez de configurarse: al
  // cerrar diciembre aparece el semestre nuevo solo, sin que nadie tenga que tocar nada.
  const porSem = {};
  movs.forEach(m => {
    const s = pubSemestre_(m.fecha);
    if (!porSem[s.id]) porSem[s.id] = { info: s, movs: [] };
    porSem[s.id].movs.push(m);
  });

  base.periodos = Object.keys(porSem).sort().reverse().map(id => pubArmarPeriodo_(porSem[id], partidos, eventos));
  return base;
}

function pubArmarPeriodo_(sem, partidos, eventos) {
  const movs = sem.movs;
  const p = { id: sem.info.id, nombre: sem.info.nombre, desde: sem.info.desde, hasta: sem.info.hasta };

  // ── Mes a mes ──
  const meses = {};
  const LBL = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  movs.forEach(m => {
    const k = m.fecha.slice(0, 7);
    if (!meses[k]) meses[k] = { label: LBL[Number(k.slice(5, 7)) - 1], ingresos: 0, egresos: 0 };
    meses[k].ingresos += m.ingreso; meses[k].egresos += m.egreso;
  });
  // Un mes está "en temporada" si se jugó algún partido. Sirve para que el sitio muestre aparte lo
  // que cuesta sostener el equipo jugando: los meses de parate arrastran el promedio para abajo y
  // hacen parecer que mantener el fútbol sale bastante menos de lo que sale.
  const mesesConPartido = {};
  Object.keys(partidos).forEach(id => {
    const f = partidos[id].fecha;
    if (f && f >= sem.info.desde && f <= sem.info.hasta) mesesConPartido[f.slice(0, 7)] = true;
  });
  p.meses = Object.keys(meses).sort().map(k => {
    if (mesesConPartido[k]) meses[k].temporada = true;
    return meses[k];
  });

  // ── Ingresos y egresos por categoría: la tabla completa del balance ──
  const cats = {};
  movs.forEach(m => {
    const k = m.categoria || "Otros";
    if (!cats[k]) cats[k] = { nombre: k, ingresos: 0, egresos: 0 };
    cats[k].ingresos += m.ingreso; cats[k].egresos += m.egreso;
  });
  p.categorias = Object.keys(cats).map(k => ({ nombre: k,
    ingresos: Math.round(cats[k].ingresos), egresos: Math.round(cats[k].egresos) }))
    .sort((a, b) => (b.ingresos - b.egresos) - (a.ingresos - a.egresos));

  // ── Partido a partido. Mismo criterio que Resumen > Por Partido de la app: deja afuera sueldos y
  // movilidad, que se pagan por mes y no son "lo que dejó la jornada". ──
  const acum = {};
  movs.forEach(m => {
    if (!m.partidoId || !partidos[m.partidoId]) return;
    if (PUB_CATS_FUERA_PARTIDO.indexOf(m.categoria) >= 0) return;
    const a = acum[m.partidoId] || (acum[m.partidoId] = { entradas: 0, buffet: 0, gastosCancha: 0, otros: 0, neto: 0 });
    const monto = m.ingreso || m.egreso, signo = m.ingreso ? 1 : -1;
    a.neto += signo * monto;
    if (PUB_RUBROS_BUFFET.indexOf(m.codRubro) >= 0)        a.buffet += signo * monto;
    else if (signo > 0 && PUB_RUBROS_ENTRADAS.indexOf(m.codRubro) >= 0) a.entradas += monto;
    else if (signo < 0 && PUB_RUBROS_CANCHA.indexOf(m.codRubro) >= 0)   a.gastosCancha += monto;
    else a.otros += signo * monto;
  });
  p.partidos = Object.keys(acum)
    .sort((x, y) => (partidos[x].fecha || "").localeCompare(partidos[y].fecha || ""))
    .map(id => ({ rival: partidos[id].rival, local: partidos[id].local, publico: partidos[id].publico,
                  entradas: Math.round(acum[id].entradas), buffet: Math.round(acum[id].buffet),
                  gastosCancha: Math.round(acum[id].gastosCancha), otros: Math.round(acum[id].otros),
                  neto: Math.round(acum[id].neto) }));
  const torneos = Object.keys(acum).map(id => partidos[id].torneo).filter(Boolean);
  p.torneo = torneos.length ? torneos[0] : "";
  p.partidosNota = "El resultado de cada partido es lo que dejó la jornada en la cancha. No incluye los sueldos ni los viajes del plantel, que se pagan por mes y van aparte.";

  // ── Abrir la cancha: promedio de los partidos de local con público cargado ──
  const locales = p.partidos.filter(x => x.local && x.gastosCancha > 0);
  const conPublico = locales.filter(x => x.publico > 0);
  if (locales.length && conPublico.length) {
    const costo = Math.round(locales.reduce((s, x) => s + x.gastosCancha, 0) / locales.length);
    const publicoProm = Math.round(conPublico.reduce((s, x) => s + x.publico, 0) / conPublico.length);
    const entradasTot = conPublico.reduce((s, x) => s + x.entradas, 0);
    const gentTot = conPublico.reduce((s, x) => s + x.publico, 0);
    const precio = gentTot ? Math.round(entradasTot / gentTot) : 0;
    const necesarias = precio ? Math.round(costo / precio) : 0;
    p.abrirCancha = { costoPromedio: costo, incluye: "árbitros, policía, ambulancia y filmación",
                      precioPromedioEntrada: precio,
                      entradasNecesarias: necesarias,
                      publicoPromedio: publicoProm,
                      // El texto lo decide el número, no una constante: si un semestre la gente
                      // llena la cancha, decir igual que "no alcanza" sería mentir.
                      nota: publicoProm >= necesarias
                        ? "Con el público que viene, las entradas alcanzan para cubrir el costo de abrir la cancha."
                        : "Las entradas solas no alcanzan: la diferencia la cubren el buffet, la parrilla y los sponsors." };
  }

  // ── Peñas y eventos ──
  const evAcum = {};
  movs.forEach(m => {
    if (!m.eventoId || !eventos[m.eventoId]) return;
    if (PUB_RUBROS_PENA.indexOf(m.codRubro) < 0) return;
    evAcum[m.eventoId] = (evAcum[m.eventoId] || 0) + m.ingreso - m.egreso;
  });
  p.eventos = Object.keys(evAcum)
    .sort((x, y) => (eventos[x].fecha || "").localeCompare(eventos[y].fecha || ""))
    .map(id => ({ nombre: eventos[id].nombre, monto: Math.round(evAcum[id]) }));
  p.eventosNota = "Con el trabajo de muchos voluntarios, las peñas dejan una ganancia importante para el club.";

  // ── Plantel ──
  const sueldos = movs.filter(m => m.categoria === "Jugadores y Cuerpo Técnico").reduce((s, m) => s + m.egreso, 0);
  const movilidad = movs.filter(m => m.categoria === "Movilidad").reduce((s, m) => s + m.egreso, 0);
  if (sueldos || movilidad) {
    p.plantel = { detalle: [ { nombre: "Jugadores y cuerpo técnico", monto: Math.round(sueldos) },
                             { nombre: "Movilidad (combustible, remís, viáticos)", monto: Math.round(movilidad) } ],
                  nota: "Muchos jugadores vienen de otros pueblos, así que además del sueldo hay que cubrir el combustible y los viáticos para que puedan entrenar y jugar." };
  }
  return p;
}

// ════════════════════════════════════════════════════════════
// DISPATCH
// ════════════════════════════════════════════════════════════

function handleAction(data) {
  switch (data.action) {

    // ─── ARRANQUE ─────────────────────────────────────────────
    //
    // Todo lo que la app necesita al abrirse, en UNA sola ejecución.
    //
    // Antes el front hacía 12 requests (dos Promise.all). Medido contra la planilla real:
    // cada uno costaba entre 2,1 y 5 segundos **sin importar cuánto devolvía** — listGrupos
    // tardaba 4,9 s para traer 6 filas y 1 KB. Ese piso no son los datos: es abrir la planilla
    // (getSpreadsheet → PropertiesService + openById) y esperar el lock de doPost, que
    // serializa las ejecuciones. Doce veces ese costo daba ~14 s con todo en paralelo, más
    // ~4,4 s de arranque en frío la primera vez: los 20 segundos que veía el usuario.
    //
    // Acá la planilla se abre una vez y el lock se toma una vez. Los datos en sí son baratos
    // (768 KB, de los cuales 714 KB son movimientos).
    //
    // Cada bloque va en su propio try: que falle una hoja no puede dejar sin arrancar a la app
    // entera. Lo que falla vuelve como null y el front decide si reintentar suelto.
    case "bootstrap": {
      const out = { ok: true, errores: {} };
      const partes = [
        ["movimientos",     "listMov",             "movimientos"],
        ["jugadores",       "listJugadores",       "jugadores"],
        ["grupos",          "listGrupos",          "grupos"],
        ["adherentes",      "listAdherentes",      "adherentes"],
        ["pagos",           "listPagos",           "pagos"],
        ["config",          "getConfig",           "config"],
        ["partidos",        "listPartidos",        "partidos"],
        ["reservas",        "listReservas",        "reservas"],
        ["eventos",         "listEventos",         "eventos"],
        ["configJugadores", "listConfigJugadores", "configJugadores"],
        ["roster",          "listRoster",          "roster"],
        ["pagosJugadores",  "listPagosJugadores",  "pagosJugadores"]
      ];
      for (const p of partes) {
        const destino = p[0], accion = p[1], clave = p[2];
        try {
          const r = handleAction({ action: accion });
          out[destino] = (r && r.ok) ? r[clave] : null;
          if (!r || !r.ok) out.errores[destino] = (r && r.error) || "sin respuesta";
        } catch (e) {
          out[destino] = null;
          out.errores[destino] = e.message;
        }
      }
      return out;
    }


    // ─── MOVIMIENTOS ─────────────────────────────────────────

    case "listMov": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      autoFillIds(sh, r => r[4] || r[6] || r[7] || r[8]); // Rubro, Concepto o montos
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, movimientos: [] };
      // "orden" = posición original de la fila en la hoja (orden de alta). Se usa
      // en el front como desempate cuando dos movimientos comparten fecha y no
      // tienen timestamp confiable (registros viejos importados en lote).
      let rows = all.slice(1).map((r, i) => ({ r, i })).filter(x => x.r[0]);
      if (data.mes) rows = rows.filter(x => String(x.r[1]) === String(data.mes));
      const movimientos = rows.map(({ r, i }) => ({
        orden:         i,
        id:            String(r[0]),
        mes:           String(r[1]),
        fecha:         formatFecha(r[2]),
        codRubro:      String(r[3]  || ""),
        rubro:         String(r[4]  || ""),
        categoria:     String(r[5]  || ""),
        concepto:      String(r[6]  || ""),
        egreso:        Number(r[7]  || 0),
        ingreso:       Number(r[8]  || 0),
        montoFinal:    Number(r[9]  || 0),
        cuenta:        String(r[10] || ""),
        cuentaDestino: String(r[11] || ""),
        modoPago:      String(r[12] || ""),
        jugadorCT:     String(r[13] || "").trim(),
        adherente:     String(r[14] || "").trim(),
        observacion:   String(r[15] || ""),
        comprobante:   String(r[16] || ""),
        seguroReintegro: Number(r[17] || 0),
        tipo:          String(r[18] || ""),
        timestamp:     tsToIsoLocal(r[19]),
        partidoId:     String(r[20]||""),
        eventoId:      String(r[21]||""),
        vinculos:      parseVinculosJson(r[22]),
        itemsDetalle:  parseItemsDetalleJson(r[23]),
        jugadorId:     String(r[24]||""),
        adherenteId:   String(r[25]||""),
      }));
      return { ok: true, movimientos };
    }

    case "saveMov": {
      const sh = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const m  = normalizeMovFields(data.mov);
      // Si el ID ya existe en la hoja (reintento con estado de formulario viejo,
      // doble click, etc.), generamos uno nuevo en vez de duplicarlo — appendRow
      // siempre agrega una fila nueva, nunca pisa una existente.
      let id = m.id || uid_gs();
      if (idExisteEnMov(sh, id)) id = uid_gs();
      // El cliente manda el timestamp del momento en que se apretó Guardar. Si el
      // movimiento se cargó sin conexión y se sincroniza más tarde, esa marca es la
      // que vale (no la hora de sincronización). Sin timestamp del cliente, ahora.
      const ts = tsToIsoLocal(m.timestamp) || nowTsLocal();
      sh.appendRow([
        id, m.mes||"", m.fecha||"", m.codRubro||"", m.rubro||"", m.categoria||"",
        m.concepto||"", Number(m.egreso||0), Number(m.ingreso||0), Number(m.montoFinal||0),
        m.cuenta||"", m.cuentaDestino||"", m.modoPago||"",
        m.jugadorCT||"", m.adherente||"",
        m.observacion||"", m.comprobante||"", Number(m.seguroReintegro||0), m.tipo||"", ts,
        m.partidoId||"", m.eventoId||"", stringifyVinculos(m.vinculos),
        stringifyItemsDetalle(m.itemsDetalle), m.jugadorId||"", m.adherenteId||""
      ]);
      if (m.adherente && m.tipo === "INGRESO" && isAdherenteRubro(m.codRubro)) {
        autoUpsertPago(id, m.adherente, m.mes, "PAGADO");
      }
      // "Descontar del sueldo": el adelanto que se acaba de registrar se netea contra la próxima
      // liquidación del jugador. Se hace ACÁ, en la misma ejecución, y no con un segundo POST desde
      // el front: cada acción de Apps Script cuesta 1-3 s y corren de a una, así que encadenarlas
      // duplica la espera y —peor— deja el estado a medias si la segunda falla (movimiento cargado,
      // descuento no). No se crea ningún movimiento nuevo: el egreso de arriba ES la plata que se
      // entregó, y el descuento sólo evita pagarla dos veces.
      const outSave = { ok: true, id };
      if (data.descontarDelSueldo) {
        const plan = planDescuentoDeMovimiento_(m, id, data.descontarDelSueldo);
        if (plan.error) return { ok: false, error: plan.error };
        const res = aplicarPlanDescuento_(plan, m, id);
        if (res.descuento) outSave.descuento = res.descuento;
        if (plan.aviso)    outSave.avisoDescuento = plan.aviso;
      }
      return outSave;
    }

    case "updateMov": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const m   = normalizeMovFields(data.mov);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(m.id)) {
          // El descuento vinculado se resuelve ANTES de escribir el movimiento: si hay que
          // rechazar (el descuento ya se liquidó y borrarlo dejaría al jugador cobrando de más),
          // no puede quedar el movimiento actualizado y el descuento sin tocar.
          const plan = planDescuentoDeMovimiento_(m, String(m.id), data.descontarDelSueldo);
          if (plan.error) return { ok: false, error: plan.error };
          // El timestamp es la marca de ALTA, no de última modificación: editar un
          // movimiento no debe moverlo de lugar en el orden de carga.
          const tsOriginal = tsToIsoLocal(all[i][19]) || nowTsLocal();
          sh.getRange(i + 1, 1, 1, MOV_COLS.length).setValues([[
            m.id, m.mes||"", m.fecha||"", m.codRubro||"", m.rubro||"", m.categoria||"",
            m.concepto||"", Number(m.egreso||0), Number(m.ingreso||0), Number(m.montoFinal||0),
            m.cuenta||"", m.cuentaDestino||"", m.modoPago||"",
            m.jugadorCT||"", m.adherente||"",
            m.observacion||"", m.comprobante||"", Number(m.seguroReintegro||0), m.tipo||"", tsOriginal,
            m.partidoId||"", m.eventoId||"", stringifyVinculos(m.vinculos), stringifyItemsDetalle(m.itemsDetalle),
            m.jugadorId||"", m.adherenteId||""
          ]]);
          if (m.adherente && m.tipo === "INGRESO" && isAdherenteRubro(m.codRubro)) {
            autoUpsertPago(m.id, m.adherente, m.mes, "PAGADO");
          }
          const out = { ok: true };
          const res = aplicarPlanDescuento_(plan, m, String(m.id));
          if (res.descuento)         out.descuento = res.descuento;
          if (res.descuentoBorradoId) out.descuentoBorradoId = res.descuentoBorradoId;
          if (plan.aviso)            out.avisoDescuento = plan.aviso;
          return out;
        }
      }
      return { ok: false, error: "Movimiento no encontrado: " + m.id };
    }

    // Actualiza solo la columna Vinculos de un movimiento (ingreso de reintegro),
    // sin tocar el resto de sus campos — evita pisar datos con un estado de cliente viejo.
    case "setVinculos": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.getRange(i + 1, MOV_IX.VINCULOS).setValue(stringifyVinculos(data.vinculos));
          return { ok: true };
        }
      }
      return { ok: false, error: "Movimiento no encontrado: " + data.id };
    }

    case "saveBatch": {
      const sh   = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const list = (data.movimientos || []).map(normalizeMovFields);
      for (const m of list) {
        if (idExisteEnMov(sh, m.id)) m.id = uid_gs();
        sh.appendRow([
          m.id, m.mes, m.fecha, m.codRubro, m.rubro, m.categoria,
          m.concepto, m.egreso || 0, m.ingreso || 0, m.montoFinal || 0,
          m.cuenta, m.cuentaDestino || "", m.modoPago,
          m.jugadorCT || "", m.adherente || "", m.observacion || "",
          m.comprobante || "", Number(m.seguroReintegro || 0), m.tipo,
          tsToIsoLocal(m.timestamp) || nowTsLocal(),
          m.partidoId||"", m.eventoId||"", stringifyVinculos(m.vinculos),
          stringifyItemsDetalle(m.itemsDetalle), m.jugadorId||"", m.adherenteId||""
        ]);
        if (m.adherente && m.tipo === "INGRESO" && isAdherenteRubro(m.codRubro)) {
          autoUpsertPago(m.id, m.adherente, m.mes, "PAGADO");
        }
      }
      return { ok: true, saved: list.length };
    }

    case "deleteMov": {
      // Valida que el ID identifique EXACTAMENTE una fila antes de borrar. Si
      // hay más de una coincidencia (ID duplicado), no borra nada — borrar "la
      // primera que aparezca" podía eliminar una fila distinta a la que el
      // usuario eligió en pantalla. Avisa para resolverlo a mano.
      const sh    = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const all   = sh.getDataRange().getValues();
      const filas = [];
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) filas.push(i + 1);
      }
      if (!filas.length) return { ok: false, error: "Movimiento no encontrado: " + data.id };
      if (filas.length > 1) {
        return { ok: false, error: "Hay " + filas.length + " movimientos con el mismo ID (" + data.id + "). No se borró nada — corregilo a mano en la hoja antes de eliminar." };
      }
      // Un movimiento puede ser la contrapartida de un pago: el egreso que generó
      // "Confirmar pagos seleccionados" (filas de Pagos Jugadores) o el ingreso que marcó
      // una cuota de adherente. Si se borra el movimiento y no se revierte eso, la fila
      // queda en "pagado" apuntando a un movimiento que no existe — el jugador figura
      // cobrado sin egreso en la contabilidad, y la pantalla de Transferencias no lo deja
      // volver a incluir. Borrar el movimiento ES el deshacer, así que revierte primero.
      const revertido = revertirPagosDeMovimiento_(String(data.id));
      sh.deleteRow(filas[0]);
      return { ok: true, revertido };
    }

    // ─── JUGADORES ───────────────────────────────────────────

    case "listJugadores": {
      const sh  = getOrCreateSheet(JUG_SHEET, JUG_COLS);
      autoFillIds(sh, r => r[1], r => !r[2] ? [r[0], r[1], "true"] : null);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, jugadores: [] };
      const jugadores = all.slice(1)
        .filter(r => r[0] && String(r[2]) !== "false")
        .map(r => ({ id: String(r[0]), nombre: String(r[1]).trim() }));
      return { ok: true, jugadores };
    }

    case "saveJugador": {
      const sh  = getOrCreateSheet(JUG_SHEET, JUG_COLS);
      const j   = data.jugador;
      const all = sh.getDataRange().getValues();
      if (j.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(j.id)) {
            // Renombrar por acá no valida duplicados ni informa cuántas filas tocó —
            // la pantalla de Entidades usa "renameJugador". Igual cascadeamos el nombre
            // para que ningún camino deje los movimientos apuntando al nombre viejo.
            const nombreViejo = String(all[i][1] || "").trim();
            const nombreNuevo = String(j.nombre || "").trim();
            sh.getRange(i + 1, 2).setValue(nombreNuevo);
            if (nombreViejo && nombreViejo !== nombreNuevo) {
              cascadeNombre_(MOV_SHEET,  MOV_COLS,  MOV_IX.JUGADOR_ID, MOV_IX.JUGADOR_CT, j.id, nombreViejo, nombreNuevo);
              cascadeNombre_(PJ_SHEET,   PJ_COLS,   2, 3, j.id, nombreViejo, nombreNuevo);
              cascadeNombre_(ROS_SHEET,  ROS_COLS,  2, 3, j.id, nombreViejo, nombreNuevo);
              cascadeNombre_(CFGJ_SHEET, CFGJ_COLS, 1, 2, j.id, nombreViejo, nombreNuevo);
            }
            return { ok: true, id: j.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, j.nombre, "true"]);
      return { ok: true, id };
    }

    // Renombra un jugador SIN perder su historia: la fila de Jugadores conserva el ID,
    // y el nombre nuevo se reescribe en cascada en todas las hojas que guardan una copia
    // legible del nombre (Movimientos.JugadorCT, Pagos Jugadores, Roster, Config Jugadores).
    // El match es por ID, no por texto. En Movimientos, las filas viejas que todavía no
    // tienen JugadorID se adoptan por nombre exacto (normalizado) y de paso se les completa
    // el ID, así el próximo rename ya no depende del texto.
    case "renameJugador": {
      const sh     = getOrCreateSheet(JUG_SHEET, JUG_COLS);
      const jugId  = String(data.id || "");
      const nombre = String(data.nombre || "").trim();
      if (!jugId)  return { ok: false, error: "Falta el ID del jugador" };
      if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío" };

      const all = sh.getDataRange().getValues();
      let fila = -1, nombreViejo = "";
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === jugId) { fila = i; nombreViejo = String(all[i][1] || "").trim(); break; }
      }
      if (fila < 0) return { ok: false, error: "Jugador no encontrado: " + jugId };

      // Un nombre repetido rompería el match por texto de los movimientos viejos y las
      // pantallas que todavía agrupan por nombre, así que no se permite.
      for (let i = 1; i < all.length; i++) {
        if (i === fila) continue;
        if (String(all[i][2]) === "false") continue;
        if (normStr_gs(String(all[i][1] || "")) === normStr_gs(nombre)) {
          return { ok: false, error: "Ya existe otro jugador llamado \"" + String(all[i][1]).trim() + "\"" };
        }
      }
      const grpSh  = getOrCreateSheet(GRP_SHEET, GRP_COLS);
      const grpAll = grpSh.getDataRange().getValues();
      for (let i = 1; i < grpAll.length; i++) {
        if (String(grpAll[i][3]) === "false") continue;
        if (normStr_gs(String(grpAll[i][1] || "")) === normStr_gs(nombre)) {
          return { ok: false, error: "Ya existe un grupo llamado \"" + String(grpAll[i][1]).trim() + "\" — los nombres no pueden repetirse entre jugadores y grupos" };
        }
      }

      if (nombreViejo === nombre) return { ok: true, id: jugId, nombre, actualizados: {} };
      sh.getRange(fila + 1, 2).setValue(nombre);

      const actualizados = {
        movimientos:    cascadeNombre_(MOV_SHEET,  MOV_COLS,  MOV_IX.JUGADOR_ID, MOV_IX.JUGADOR_CT, jugId, nombreViejo, nombre),
        pagosJugadores: cascadeNombre_(PJ_SHEET,   PJ_COLS,   2, 3, jugId, nombreViejo, nombre),
        roster:         cascadeNombre_(ROS_SHEET,  ROS_COLS,  2, 3, jugId, nombreViejo, nombre),
        configJugador:  cascadeNombre_(CFGJ_SHEET, CFGJ_COLS, 1, 2, jugId, nombreViejo, nombre)
      };
      return { ok: true, id: jugId, nombre, nombreViejo, actualizados };
    }

    // (El rename de grupos va dentro de saveGrupo, que ya recibe el nombre nuevo.)

    // Completa JugadorID y AdherenteID en las filas históricas, matcheando las columnas de
    // texto contra los nombres de las entidades. Idempotente: sólo toca filas con el ID vacío,
    // así que se puede volver a correr después de dar de alta entidades que faltaban.
    // Devuelve los nombres que no matchearon con nada, para revisarlos a mano.
    case "backfillIds": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const all = sh.getDataRange().getValues();
      const vacio = { completados: 0, sinMatch: [] };
      if (all.length <= 1) return { ok: true, jugadores: vacio, adherentes: vacio };

      function indicePorNombre(hojas) {
        const ix = {};
        for (const h of hojas) {
          const rows = getOrCreateSheet(h.sheet, h.cols).getDataRange().getValues();
          for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] && rows[i][1]) ix[normStr_gs(String(rows[i][1]))] = String(rows[i][0]);
          }
        }
        return ix;
      }

      // Escribe una columna de IDs entera de una sola llamada (setValues es caro en Apps
      // Script: hacerlo fila por fila sobre 500+ movimientos se pasa del límite de tiempo).
      function completarCol(colId, colNombre, porNombre) {
        const ixId = colId - 1, ixNom = colNombre - 1;
        const col = [];
        let completados = 0;
        const sinMatch = {};
        for (let i = 1; i < all.length; i++) {
          const actual = String(all[i][ixId]  || "").trim();
          const nom    = String(all[i][ixNom] || "").trim();
          if (actual || !nom) { col.push([actual]); continue; }
          const id = porNombre[normStr_gs(nom)];
          if (id) { col.push([id]); completados++; }
          else    { col.push([""]); sinMatch[nom] = (sinMatch[nom] || 0) + 1; }
        }
        if (col.length) sh.getRange(2, colId, col.length, 1).setValues(col);
        return {
          completados,
          sinMatch: Object.keys(sinMatch).map(n => ({ nombre: n, movimientos: sinMatch[n] }))
                          .sort((a,b) => b.movimientos - a.movimientos)
        };
      }

      const jugadores = completarCol(MOV_IX.JUGADOR_ID, MOV_IX.JUGADOR_CT,
        indicePorNombre([{ sheet: JUG_SHEET, cols: JUG_COLS }, { sheet: GRP_SHEET, cols: GRP_COLS }]));
      const adherentes = completarCol(MOV_IX.ADHERENTE_ID, MOV_IX.ADHERENTE,
        indicePorNombre([{ sheet: ADH_SHEET, cols: ADH_COLS }]));

      return { ok: true, jugadores, adherentes };
    }

    // ─── CHEQUEO DE INTEGRIDAD ────────────────────────────────
    //
    // Diagnóstico bajo demanda (botón en Configuración): NO corre en el uso normal de la
    // app. Busca referencias colgadas — incluidas las que viven adentro de los JSON de
    // Vinculos, ItemsDetalle, Miembros y PartidosIncluidos, que hoy no valida nadie y
    // fallan en silencio (un vínculo a un egreso borrado deja de sumar y el reintegro
    // queda mostrando de menos; un ítem con partidoId muerto desaparece del resumen por
    // partido). Una sola pasada por hoja, con sets en memoria: sin búsquedas anidadas.
    //
    // Dos niveles, porque no todo lo colgado es un error:
    //  · "error" → el ID no existe en ninguna fila. Algo se rompió.
    //  · "aviso" → la fila existe pero está dada de baja (Activo=false). Es normal en el
    //    historial (un jugador que se fue del club) y no hay nada que arreglar; sólo se
    //    reporta cuando además implica que algo no se ve en pantalla.
    case "checkIntegridad": {
      const problemas = [];
      const add = (nivel, grupo, detalle, ref) => problemas.push({ nivel, grupo, detalle, ref: ref || "" });

      // Índice de una hoja: existe (haya o no sido dada de baja) y si está activa.
      function indexar(sheet, cols, colActivo, colNombre, grupoDup) {
        const rows  = getOrCreateSheet(sheet, cols).getDataRange().getValues();
        const existe = {}, activo = {}, nombre = {}, vistos = {};
        for (let i = 1; i < rows.length; i++) {
          const id = String(rows[i][0] || "").trim();
          if (!id) continue;
          if (vistos[id] && grupoDup) {
            add("error", grupoDup, "Hay más de una fila con el ID " + id +
                " en la hoja \"" + sheet + "\". Corregilo a mano: mientras esté duplicado, editar o borrar esa fila no funciona.");
          }
          vistos[id] = true;
          existe[id] = true;
          activo[id] = colActivo ? String(rows[i][colActivo - 1]) !== "false" : true;
          if (colNombre) nombre[id] = String(rows[i][colNombre - 1] || "").trim();
        }
        return { existe, activo, nombre, rows };
      }

      const MOVX = indexar(MOV_SHEET,  MOV_COLS,  0, 7, "IDs duplicados");
      const JUG  = indexar(JUG_SHEET,  JUG_COLS,  3, 2, "IDs duplicados");
      const GRP  = indexar(GRP_SHEET,  GRP_COLS,  4, 2, "IDs duplicados");
      const ADH  = indexar(ADH_SHEET,  ADH_COLS,  3, 2, "IDs duplicados");
      const PAR  = indexar(PAR_SHEET,  PAR_COLS,  6, 3, "IDs duplicados");
      const PJX  = indexar(PJ_SHEET,   PJ_COLS,   0, 3, null);

      const etiquetaMov = r => (formatFecha(r[2]) || "sin fecha") + " · " + (String(r[6] || "").slice(0, 40) || "sin concepto");

      // ── Movimientos: entidades, vínculos de reintegro y desglose por partido ──
      for (let i = 1; i < MOVX.rows.length; i++) {
        const r = MOVX.rows[i];
        if (!String(r[0] || "").trim()) continue;
        const et = etiquetaMov(r);

        const jId = String(r[MOV_IX.JUGADOR_ID   - 1] || "").trim();
        const aId = String(r[MOV_IX.ADHERENTE_ID - 1] || "").trim();
        if (jId && !JUG.existe[jId] && !GRP.existe[jId]) {
          add("error", "Movimientos", "Apunta a un jugador/grupo que no existe (queda vinculado sólo por el texto \"" +
              String(r[MOV_IX.JUGADOR_CT - 1] || "") + "\", así que un renombre no lo va a arrastrar).", et);
        }
        if (aId && !ADH.existe[aId]) {
          add("error", "Movimientos", "Apunta a un adherente que no existe (queda vinculado sólo por el texto \"" +
              String(r[MOV_IX.ADHERENTE - 1] || "") + "\").", et);
        }

        const vinc = parseVinculosJson(r[MOV_IX.VINCULOS - 1]);
        for (const v of vinc) {
          const eid = String((v && v.egresoId) || "").trim();
          if (!eid) {
            add("error", "Reintegros", "Tiene un vínculo sin egresoId — ese monto no se está contando contra ningún gasto.", et);
          } else if (!MOVX.existe[eid]) {
            add("error", "Reintegros", "Está vinculado a un gasto que se borró (" + eid + "): " + fmtMonto_(v.monto) +
                " figura como reintegrado pero no se descuenta de ningún egreso.", et);
          }
        }

        const items = parseItemsDetalleJson(r[MOV_IX.ITEMS - 1]);
        for (const it of items) {
          const pid = String((it && it.partidoId) || "").trim();
          if (pid && !PAR.existe[pid]) {
            add("error", "Resumen por partido", "Tiene un ítem de " + fmtMonto_(it.monto) +
                " imputado a un partido que se borró: ese monto desaparece del resumen por partido.", et);
          }
        }
        const pidMov = String(r[20] || "").trim();
        if (pidMov && !PAR.existe[pidMov]) {
          add("error", "Resumen por partido", "Está asignado a un partido que se borró.", et);
        }
      }

      // ── Grupos: miembros borrados (desaparecen en silencio de la pantalla) ──
      for (let i = 1; i < GRP.rows.length; i++) {
        const r = GRP.rows[i];
        const gid = String(r[0] || "").trim();
        if (!gid || String(r[3]) === "false") continue;
        const miembros = safeParseJSON(String(r[2] || "[]"), []);
        const gn = String(r[1] || "");
        for (const jid of miembros) {
          if (!JUG.existe[String(jid)]) {
            add("error", "Grupos", "El grupo \"" + gn + "\" tiene un miembro que no existe (" + jid + ").");
          } else if (!JUG.activo[String(jid)]) {
            add("aviso", "Grupos", "El grupo \"" + gn + "\" incluye a \"" + JUG.nombre[String(jid)] +
                "\", que está dado de baja: no aparece en la lista de miembros en pantalla.");
          }
        }
      }

      // ── Pagos a jugadores: jugador, partidos incluidos y movimiento de pago ──
      for (let i = 1; i < PJX.rows.length; i++) {
        const r = PJX.rows[i];
        if (!String(r[0] || "").trim()) continue;
        const quien = String(r[2] || "sin nombre");
        const jid = String(r[1] || "").trim();
        if (jid && !JUG.existe[jid]) {
          add("error", "Pagos a jugadores", "El pago de \"" + quien + "\" apunta a un jugador que no existe.");
        }
        for (const pid of safeParseJSON(String(r[3] || "[]"), [])) {
          if (!PAR.existe[String(pid)]) {
            add("error", "Pagos a jugadores", "El pago de \"" + quien + "\" incluye un partido que se borró (" + pid + ").");
          }
        }
        // PartidoID (premios): si el partido no está, el premio deja de imputarse en Resumen > Por Partido.
        const pidFila = String(r[PJ_IX.PARTIDO_ID - 1] || "").trim();
        if (pidFila && !PAR.existe[pidFila]) {
          add("error", "Pagos a jugadores", "El premio \"" + String(r[11] || "sin etiqueta") + "\" de \"" + quien +
              "\" está asociado a un partido que se borró: ese monto no se imputa a ningún partido.");
        }
        const movId = String(r[12] || "").trim();
        if (movId && !MOVX.existe[movId]) {
          add("error", "Pagos a jugadores", "El pago de \"" + quien + "\" figura como pagado con un movimiento que se borró: el egreso ya no está en la contabilidad.");
        }
        // MovimientoOrigenID va al revés que MovimientoID: apunta al egreso del adelanto que este
        // descuento netea. Si ese egreso no está, el descuento sigue siendo válido pero no hay
        // forma de auditar de dónde salió — va el monto para poder encontrarlo en la hoja.
        const movOrigen = String(r[PJ_IX.MOV_ORIGEN_ID - 1] || "").trim();
        if (movOrigen && !MOVX.existe[movOrigen]) {
          add("error", "Pagos a jugadores", "El descuento de " + fmtMonto_(r[7]) + " de \"" + quien +
              "\" dice venir de un movimiento que ya no existe: no se puede verificar contra qué adelanto se descuenta.");
        }
      }

      // ── Roster de partidos ──
      const ROS = getOrCreateSheet(ROS_SHEET, ROS_COLS).getDataRange().getValues();
      for (let i = 1; i < ROS.length; i++) {
        const pid = String(ROS[i][0] || "").trim();
        const jid = String(ROS[i][1] || "").trim();
        if (pid && !PAR.existe[pid]) add("error", "Roster de partidos", "Hay una convocatoria de un partido que se borró (" + pid + ").");
        if (jid && !JUG.existe[jid]) add("error", "Roster de partidos", "Hay una convocatoria de un jugador que no existe (" + String(ROS[i][2] || jid) + ").");
      }

      // ── Config Jugadores ──
      const CFGJ = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS).getDataRange().getValues();
      for (let i = 1; i < CFGJ.length; i++) {
        const jid = String(CFGJ[i][0] || "").trim();
        if (!jid || String(CFGJ[i][7]) === "false") continue;
        if (!JUG.existe[jid]) {
          add("error", "Config de jugadores", "Hay montos configurados para \"" + String(CFGJ[i][1] || jid) + "\", que no existe en la lista de jugadores.");
        }
      }

      // ── Cuotas de adherentes ──
      const PAG = getOrCreateSheet(PAG_SHEET, PAG_COLS).getDataRange().getValues();
      for (let i = 1; i < PAG.length; i++) {
        const aid   = String(PAG[i][1] || "").trim();
        const quien = String(PAG[i][2] || aid);
        const movId = String(PAG[i][5] || "").trim();
        if (aid && !ADH.existe[aid]) {
          add("error", "Cuotas de adherentes", "Hay cuotas de \"" + quien + "\", que no existe en la lista de adherentes.");
        }
        if (movId && !MOVX.existe[movId]) {
          add("error", "Cuotas de adherentes", "La cuota " + String(PAG[i][3] || "") + " de \"" + quien +
              "\" está marcada como pagada contra un movimiento que se borró.");
        }
      }

      // ── Reservas de granos ──
      const RES = getOrCreateSheet(RES_SHEET, RES_COLS).getDataRange().getValues();
      for (let i = 1; i < RES.length; i++) {
        const movId = String(RES[i][6] || "").trim();
        if (movId && !MOVX.existe[movId]) {
          add("error", "Reserva de granos", "El registro del " + formatFecha(RES[i][1]) + " apunta a un movimiento que se borró.");
        }
      }

      const errores = problemas.filter(p => p.nivel === "error").length;
      // Cuántos de esos problemas se pueden arreglar solos con "repararPagosHuerfanos".
      const reparables = problemas.filter(p => p.detalle.indexOf("movimiento que se borró") >= 0).length;
      return { ok: true, errores, avisos: problemas.length - errores, reparables, problemas };
    }

    // Repara el estado que queda cuando se borró un movimiento de pago con una versión de
    // la app anterior al cascade de deleteMov: filas de Pagos Jugadores o cuotas de
    // adherentes marcadas como pagadas contra un movimiento que ya no existe. Las devuelve
    // a "pendiente" para poder volver a incluirlas en una transferencia.
    case "repararPagosHuerfanos": {
      const movIds = {};
      const movAll = getOrCreateSheet(MOV_SHEET, MOV_COLS).getDataRange().getValues();
      for (let i = 1; i < movAll.length; i++) {
        const id = String(movAll[i][0] || "").trim();
        if (id) movIds[id] = true;
      }

      const jugadores = [], cuotas = [], desvinculados = [];

      const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const pjAll = pjSh.getDataRange().getValues();
      for (let i = 1; i < pjAll.length; i++) {
        // El otro tipo de referencia colgada: un descuento que dice venir de un adelanto que ya no
        // está. Acá NO se borra ni se vuelve a pendiente nada — el adelanto se le entregó igual al
        // jugador y el descuento sigue siendo legítimo; lo único que sobra es el link.
        const movOrigen = String(pjAll[i][PJ_IX.MOV_ORIGEN_ID - 1] || "").trim();
        if (movOrigen && !movIds[movOrigen]) {
          pjSh.getRange(i + 1, PJ_IX.MOV_ORIGEN_ID).setValue("");
          desvinculados.push(String(pjAll[i][2] || "jugador"));
        }
        const movId = String(pjAll[i][12] || "").trim();
        if (!movId || movIds[movId]) continue;
        pjSh.getRange(i + 1, 9,  1, 3).setValues([["pendiente", "", ""]]);
        pjSh.getRange(i + 1, 13).setValue("");
        jugadores.push(String(pjAll[i][2] || "jugador"));
      }

      const pagSh  = getOrCreateSheet(PAG_SHEET, PAG_COLS);
      const pagAll = pagSh.getDataRange().getValues();
      for (let i = 1; i < pagAll.length; i++) {
        const movId = String(pagAll[i][5] || "").trim();
        if (!movId || movIds[movId]) continue;
        pagSh.getRange(i + 1, 5).setValue("PENDIENTE");
        pagSh.getRange(i + 1, 6).setValue("");
        pagSh.getRange(i + 1, 7).setValue(nowTsLocal());
        cuotas.push(String(pagAll[i][2] || "adherente") + " " + String(pagAll[i][3] || ""));
      }

      return { ok: true, jugadores, cuotas, desvinculados };
    }

    case "deleteJugador": {
      const sh  = getOrCreateSheet(JUG_SHEET, JUG_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.getRange(i + 1, 3).setValue("false");
          return { ok: true };
        }
      }
      return { ok: false, error: "Jugador no encontrado: " + data.id };
    }

    // ─── GRUPOS ──────────────────────────────────────────────

    case "listGrupos": {
      const sh  = getOrCreateSheet(GRP_SHEET, GRP_COLS);
      autoFillIds(sh, r => r[1], r => !r[3] ? [r[0], r[1], r[2]||"[]", "true"] : null);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, grupos: [] };
      const grupos = all.slice(1)
        .filter(r => r[0] && String(r[3]) !== "false")
        .map(r => ({
          id:       String(r[0]),
          nombre:   String(r[1]),
          miembros: safeParseJSON(String(r[2] || "[]"), [])
        }));
      return { ok: true, grupos };
    }

    case "saveGrupo": {
      const sh      = getOrCreateSheet(GRP_SHEET, GRP_COLS);
      const g       = data.grupo;
      const miembros = JSON.stringify(g.miembros || []);
      const all     = sh.getDataRange().getValues();
      if (g.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(g.id)) {
            // Movimientos.JugadorCT guarda el nombre del grupo como texto, así que si el
            // nombre cambia hay que reescribirlo en cascada o los movimientos históricos
            // quedan apuntando a un grupo que ya no existe con ese nombre.
            const nombreViejo = String(all[i][1] || "").trim();
            sh.getRange(i + 1, 1, 1, 4).setValues([[g.id, g.nombre, miembros, "true"]]);
            let movsActualizados = 0;
            if (nombreViejo && nombreViejo !== String(g.nombre || "").trim()) {
              movsActualizados = cascadeNombre_(MOV_SHEET, MOV_COLS, MOV_IX.JUGADOR_ID, MOV_IX.JUGADOR_CT,
                                                g.id, nombreViejo, String(g.nombre || "").trim());
            }
            return { ok: true, id: g.id, movsActualizados };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, g.nombre, miembros, "true"]);
      return { ok: true, id };
    }

    case "deleteGrupo": {
      const sh  = getOrCreateSheet(GRP_SHEET, GRP_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.getRange(i + 1, 4).setValue("false");
          return { ok: true };
        }
      }
      return { ok: false, error: "Grupo no encontrado: " + data.id };
    }

    // ─── ADHERENTES ──────────────────────────────────────────

    case "listAdherentes": {
      const sh  = getOrCreateSheet(ADH_SHEET, ADH_COLS);
      autoFillIds(sh, r => r[1], r => !r[2] ? [r[0], r[1], "true", r[3]||0, r[4]||0] : null);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, adherentes: [] };
      const adherentes = all.slice(1)
        .filter(r => r[0] && String(r[2]) !== "false")
        .map(r => ({
          id: String(r[0]), nombre: String(r[1]).trim(),
          cuotaMensual: Number(r[3]||0), cuotasAnuales: Number(r[4]||0)
        }));
      return { ok: true, adherentes };
    }

    case "saveAdherente": {
      const sh  = getOrCreateSheet(ADH_SHEET, ADH_COLS);
      const a   = data.adherente;
      const all = sh.getDataRange().getValues();
      const nombreNuevo = String(a.nombre || "").trim();
      if (!nombreNuevo) return { ok: false, error: "El nombre no puede quedar vacío" };
      // Nombres repetidos romperían el match por texto de los movimientos que todavía no
      // tienen AdherenteID, y el de autoUpsertPago (que busca el adherente por nombre).
      for (let i = 1; i < all.length; i++) {
        if (a.id && String(all[i][0]) === String(a.id)) continue;
        if (String(all[i][2]) === "false") continue;
        if (normStr_gs(String(all[i][1] || "")) === normStr_gs(nombreNuevo)) {
          return { ok: false, error: "Ya existe otro adherente llamado \"" + String(all[i][1]).trim() + "\"" };
        }
      }

      if (a.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(a.id)) {
            // El adherente conserva su ID y su historial: si cambió el nombre, se reescribe
            // en cascada en Movimientos.Adherente y en Pagos_Adh.AdherenteNombre en vez de
            // dejar el historial apuntando al nombre viejo. Ver el comentario de MOV_IX.
            const nombreViejo = String(all[i][1] || "").trim();
            sh.getRange(i + 1, 2, 1, 4).setValues([[
              nombreNuevo, "true", Number(a.cuotaMensual||0), Number(a.cuotasAnuales||0)
            ]]);
            const actualizados = { movimientos: 0, cuotas: 0 };
            if (nombreViejo && nombreViejo !== nombreNuevo) {
              actualizados.movimientos = cascadeNombre_(MOV_SHEET, MOV_COLS, MOV_IX.ADHERENTE_ID, MOV_IX.ADHERENTE,
                                                        a.id, nombreViejo, nombreNuevo);
              actualizados.cuotas      = cascadeNombre_(PAG_SHEET, PAG_COLS, 2, 3, a.id, nombreViejo, nombreNuevo);
            }
            return { ok: true, id: a.id, nombreViejo, actualizados };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, nombreNuevo, "true", Number(a.cuotaMensual||0), Number(a.cuotasAnuales||0)]);
      return { ok: true, id };
    }

    case "deleteAdherente": {
      const sh  = getOrCreateSheet(ADH_SHEET, ADH_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.getRange(i + 1, 3).setValue("false");
          return { ok: true };
        }
      }
      return { ok: false, error: "Adherente no encontrado: " + data.id };
    }

    // ─── PAGOS ADHERENTES ─────────────────────────────────────

    case "listPagos": {
      const sh  = getOrCreateSheet(PAG_SHEET, PAG_COLS);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, pagos: [] };
      let rows = all.slice(1).filter(r => r[0]);
      if (data.mes) rows = rows.filter(r => String(r[3]) === String(data.mes));
      const pagos = rows.map(r => ({
        id:              String(r[0]),
        adherenteId:     String(r[1]),
        adherenteNombre: String(r[2]),
        mes:             String(r[3]),
        estado:          String(r[4]),
        movimientoId:    String(r[5] || "")
      }));
      return { ok: true, pagos };
    }

    case "togglePago": {
      const sh  = getOrCreateSheet(PAG_SHEET, PAG_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][1]) === String(data.adhId) && String(all[i][3]) === String(data.mes)) {
          const next = String(all[i][4]) === "PAGADO" ? "PENDIENTE" : "PAGADO";
          sh.getRange(i + 1, 5).setValue(next);
          sh.getRange(i + 1, 7).setValue(nowTsLocal());
          return { ok: true, estado: next };
        }
      }
      // Not found → create as PAGADO
      const adhNombre = data.adhNombre || data.adhId;
      sh.appendRow([uid_gs(), data.adhId, adhNombre, data.mes, "PAGADO", "", nowTsLocal()]);
      return { ok: true, estado: "PAGADO" };
    }

    case "savePago": {
      const sh  = getOrCreateSheet(PAG_SHEET, PAG_COLS);
      const p   = data.pago;
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(p.id)) {
          sh.getRange(i + 1, 1, 1, PAG_COLS.length).setValues([[
            p.id, p.adherenteId, p.adherenteNombre,
            p.mes, p.estado, p.movimientoId || "", nowTsLocal()
          ]]);
          return { ok: true };
        }
      }
      const id = uid_gs();
      sh.appendRow([id, p.adherenteId, p.adherenteNombre, p.mes, p.estado, p.movimientoId || "", nowTsLocal()]);
      return { ok: true, id };
    }

    // ─── CONFIG ──────────────────────────────────────────────

    case "getConfig": {
      const sh  = getOrCreateSheet(CFG_SHEET, CFG_COLS);
      const all = sh.getDataRange().getValues();
      const config = {};
      for (let i = 1; i < all.length; i++) {
        if (all[i][0]) config[String(all[i][0])] = String(all[i][1] || "");
      }
      return { ok: true, config };
    }

    case "saveConfig": {
      const sh  = getOrCreateSheet(CFG_SHEET, CFG_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.clave)) {
          sh.getRange(i + 1, 2).setValue(data.valor);
          return { ok: true };
        }
      }
      sh.appendRow([data.clave, data.valor]);
      return { ok: true };
    }

    // ─── SEED INICIAL ────────────────────────────────────────

    case "initSeed": {
      const jugSh = getOrCreateSheet(JUG_SHEET, JUG_COLS);
      if (jugSh.getLastRow() > 1) return { ok: true, msg: "Ya inicializado" };

      for (const nombre of (data.jugadores || [])) {
        jugSh.appendRow([uid_gs(), nombre, "true"]);
      }

      const adhSh = getOrCreateSheet(ADH_SHEET, ADH_COLS);
      for (const nombre of (data.adherentes || [])) {
        adhSh.appendRow([uid_gs(), nombre, "true"]);
      }

      const grpSh = getOrCreateSheet(GRP_SHEET, GRP_COLS);
      for (const nombre of (data.grupos || [])) {
        grpSh.appendRow([uid_gs(), nombre, "[]", "true"]);
      }

      const cfgSh = getOrCreateSheet(CFG_SHEET, CFG_COLS);
      cfgSh.appendRow(["cuentas", data.cuentas || ""]);
      cfgSh.appendRow(["metodos", data.metodos || ""]);
      cfgSh.appendRow(["seeded",  "true"]);

      return { ok: true, msg: "Inicializado correctamente" };
    }

    case "listPartidos": {
      const sh  = getOrCreateSheet(PAR_SHEET, PAR_COLS);
      autoFillIds(sh, r => r[1] || r[2]); // Fecha o Rival
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, partidos: [] };
      const partidos = all.slice(1)
        .filter(r => r[0] && String(r[5]) !== "false")
        .map(r => ({
          id:           String(r[0]),
          fecha:        formatFecha(r[1]),
          rival:        String(r[2]||""),
          numeroFecha:  String(r[3]||""),
          condicion:    String(r[4]||"LOCAL"),
          activo:       String(r[5]) !== "false",
          torneo:       String(r[6]||""),
          // "" (no cargado) y 0 (partido sin público) son cosas distintas y el front las distingue:
          // se emite "" tal cual en vez de normalizar a 0.
          entradasDamas:      r[7] === "" || r[7] == null ? "" : Number(r[7]),
          entradasCaballeros: r[8] === "" || r[8] == null ? "" : Number(r[8])
        }))
        .sort((a,b) => b.fecha.localeCompare(a.fecha));
      return { ok: true, partidos };
    }

    case "savePartido": {
      const sh = getOrCreateSheet(PAR_SHEET, PAR_COLS);
      const p  = data.partido;
      const all = sh.getDataRange().getValues();
      // Un cliente viejo (index.html cacheado por el service worker de antes de este cambio) manda
      // el partido sin los campos de entradas. Como la edición pisa la fila entera, sin este
      // resguardo ese cliente borraría la asistencia ya cargada. `undefined` = "no opino, dejá lo
      // que había"; "" = "borralo" (el usuario vació el campo a propósito).
      const entradaOKeep = (v, actual) => v === undefined ? (actual == null ? "" : actual)
                                        : (v === "" || v === null ? "" : Number(v));
      if (p.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(p.id)) {
            sh.getRange(i + 1, 1, 1, PAR_COLS.length).setValues([[
              p.id, p.fecha||"", p.rival||"", p.numeroFecha||"", p.condicion||"LOCAL", "true", p.torneo||"",
              entradaOKeep(p.entradasDamas,      all[i][7]),
              entradaOKeep(p.entradasCaballeros, all[i][8])
            ]]);
            return { ok: true, id: p.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, p.fecha||"", p.rival||"", p.numeroFecha||"", p.condicion||"LOCAL", "true", p.torneo||"",
                    entradaOKeep(p.entradasDamas, ""), entradaOKeep(p.entradasCaballeros, "")]);
      return { ok: true, id };
    }

    case "deletePartido": {
      const sh  = getOrCreateSheet(PAR_SHEET, PAR_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.getRange(i + 1, 6).setValue("false");
          return { ok: true };
        }
      }
      return { ok: false, error: "Partido no encontrado: " + data.id };
    }

    // ─── CONFIG JUGADORES (pagos) ────────────────────────────

    case "listConfigJugadores": {
      const sh  = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, configJugadores: [] };
      const configJugadores = all.slice(1)
        .filter(r => r[0] && String(r[7]) !== "false")
        .map(r => ({
          idJugador:           String(r[0]),
          nombre:              String(r[1]||""),
          montoTitular:        Number(r[2]||0),
          montoSuplenteConMin: Number(r[3]||0),
          montoSuplente:       Number(r[4]||0),
          frecuencia:          String(r[5]||"partido"),
          alias:               String(r[6]||""),
          premios:             safeParseJSON(String(r[8]||"[]"), []),
          // Se devuelve tal cual está escrito: la normalización al formato de wa.me se hace
          // recién al armar el link (index.html), no al guardar — ver saveConfigJugador.
          celular:             String(r[9]||""),
          codRubroSueldo:      String(r[10]||"")   // "" = 19 (SUELDO JUGADORES)
        }));
      return { ok: true, configJugadores };
    }

    // El Celular se guarda TAL CUAL lo escribió el usuario. Normalizarlo acá dejaría un número
    // mal tipeado corrupto en la celda y sin forma de corregirlo mirándola: la conversión al
    // formato de wa.me se hace al armar el link (waNormalizarCelular en index.html).
    case "saveConfigJugador": {
      const sh  = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS);
      const c   = data.config;
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(c.idJugador)) {
          sh.getRange(i + 1, 1, 1, CFGJ_COLS.length).setValues([[
            c.idJugador, c.nombre||"", Number(c.montoTitular||0), Number(c.montoSuplenteConMin||0),
            Number(c.montoSuplente||0), c.frecuencia||"partido", c.alias||"", "true",
            JSON.stringify(c.premios||[]), c.celular||"", c.codRubroSueldo||""
          ]]);
          return { ok: true, idJugador: c.idJugador };
        }
      }
      sh.appendRow([
        c.idJugador, c.nombre||"", Number(c.montoTitular||0), Number(c.montoSuplenteConMin||0),
        Number(c.montoSuplente||0), c.frecuencia||"partido", c.alias||"", "true",
        JSON.stringify(c.premios||[]), c.celular||"", c.codRubroSueldo||""
      ]);
      return { ok: true, idJugador: c.idJugador };
    }

    case "deleteConfigJugador": {
      const sh  = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.idJugador)) {
          sh.getRange(i + 1, 8).setValue("false");
          return { ok: true };
        }
      }
      return { ok: false, error: "Config de jugador no encontrada: " + data.idJugador };
    }

    // ─── PREMIOS APLICADOS ────────────────────────────────────
    // El catálogo de premios de cada jugador vive en CFGJ_SHEET (columna Premios).
    // Alta en lote de premios aplicados a un jugador: cada uno genera una fila
    // pendiente en Pagos Jugadores (sin partido asociado) que se cobra junto al resto.
    case "aplicarPremios": {
      const sh    = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const lista = data.premios || []; // [{jugadorId, jugadorNombre, montoFinal, etiqueta, mes, partidoId}]
      const creados = [];
      for (const p of lista) {
        const id = uid_gs();
        sh.appendRow([
          id, p.jugadorId, p.jugadorNombre||"", "[]",
          Number(p.montoFinal||0), 0, "", Number(p.montoFinal||0),
          "pendiente", "", "", p.etiqueta||"", "", p.mes||"",
          "premio", p.partidoId||""
        ]);
        creados.push({ id, ...p });
      }
      return { ok: true, creados };
    }

    // ─── ROSTER PARTIDOS ──────────────────────────────────────

    case "listRoster": {
      const sh  = getOrCreateSheet(ROS_SHEET, ROS_COLS);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, roster: [] };
      const roster = all.slice(1)
        .filter(r => r[0] && r[1])
        .map(r => ({
          partidoId:     String(r[0]),
          jugadorId:     String(r[1]),
          jugadorNombre: String(r[2]||""),
          rol:           String(r[3]||"noJugo")
        }));
      return { ok: true, roster };
    }

    // Reemplaza el roster completo de un partido y deja lista la fila pendiente de pago
    // (Pagos Jugadores) de cada jugador que sí jugó, con el ajuste/motivo que venga del form.
    case "saveRoster": {
      const rosSh = getOrCreateSheet(ROS_SHEET, ROS_COLS);
      const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const partidoId = data.partidoId;
      const roster    = data.roster || []; // [{jugadorId, jugadorNombre, rol, montoBase, ajuste, motivoAjuste, montoFinal, mes}]

      // Borra las filas de roster existentes de este partido y las vuelve a escribir.
      const rosAll = rosSh.getDataRange().getValues();
      for (let i = rosAll.length - 1; i >= 1; i--) {
        if (String(rosAll[i][0]) === String(partidoId)) rosSh.deleteRow(i + 1);
      }
      for (const r of roster) {
        rosSh.appendRow([partidoId, r.jugadorId, r.jugadorNombre||"", r.rol||"noJugo"]);
      }

      const partidosDelPartido = JSON.stringify([partidoId]);

      // Un jugador que vuelve a "No jugó" tiene que PERDER su fila de pago pendiente. Si sobrevive,
      // la columna Final de "Por partido" sigue mostrando el monto viejo y —lo grave— el jugador
      // queda en Transferencias listo para cobrar un partido que no jugó.
      // Sólo se borran las pendientes: una ya pagada dejaría un egreso registrado sin la fila que
      // lo explica, y al jugador cobrable de nuevo por algo que ya se le transfirió.
      // La condición es la misma que usa el upsert de abajo, así que se borra exactamente la fila
      // que ese upsert habría actualizado — los premios, que van en filas propias con
      // PartidosIncluidos "[]", no se tocan.
      // Va ANTES del upsert y recorriendo hacia atrás: deleteRow corre los índices de las filas
      // siguientes, y el upsert escribe por índice sobre su propia lectura.
      let quitados = 0;
      const noJugaron = {};
      for (const r of roster) if (r.rol === "noJugo") noJugaron[String(r.jugadorId)] = true;
      if (Object.keys(noJugaron).length) {
        const pjPrev = pjSh.getDataRange().getValues();
        for (let i = pjPrev.length - 1; i >= 1; i--) {
          if (!noJugaron[String(pjPrev[i][1])]) continue;
          if (String(pjPrev[i][3]) !== partidosDelPartido) continue;
          if (String(pjPrev[i][8]) !== "pendiente") continue;
          pjSh.deleteRow(i + 1);
          quitados++;
        }
      }

      // Upsert de la fila de pago pendiente por jugador (salvo "noJugo", que ya se limpió arriba).
      const pjAll = pjSh.getDataRange().getValues();
      for (const r of roster) {
        if (r.rol === "noJugo") continue;
        const partidosStr = partidosDelPartido;
        let found = false;
        for (let i = 1; i < pjAll.length; i++) {
          if (String(pjAll[i][1]) === String(r.jugadorId) && String(pjAll[i][3]) === partidosStr && String(pjAll[i][8]) === "pendiente") {
            pjSh.getRange(i + 1, 5, 1, 4).setValues([[
              Number(r.montoBase||0), Number(r.ajuste||0), r.motivoAjuste||"", Number(r.montoFinal||0)
            ]]);
            // escribirMesPJ_ y no un setValue pelado: "2026-08" en una celda sin formato de texto
            // lo guarda Sheets como Date. savePagoJugador ya lo hacía y saveRoster no, y por eso
            // la hoja tenía unas filas con el Mes en texto y otras con una fecha.
            escribirMesPJ_(pjSh, i + 1, r.mes||"");
            // Tipo/PartidoID de una fila vieja que se vuelve a guardar: se completan acá para no
            // depender de que el usuario haya corrido el backfill.
            pjSh.getRange(i + 1, PJ_IX.TIPO, 1, 2).setValues([["partido", partidoId]]);
            found = true;
            break;
          }
        }
        if (!found) {
          pjSh.appendRow([
            uid_gs(), r.jugadorId, r.jugadorNombre||"", partidosStr,
            Number(r.montoBase||0), Number(r.ajuste||0), r.motivoAjuste||"", Number(r.montoFinal||0),
            "pendiente", "", "", "", "", r.mes||"",
            "partido", partidoId
          ]);
          // El append no puede formatear la celda antes de que la fila exista, así que se reescribe
          // como texto una vez agregada — igual que hace savePagoJugador.
          escribirMesPJ_(pjSh, pjSh.getLastRow(), r.mes||"");
        }
      }
      return { ok: true, quitados };
    }

    // ─── PAGOS JUGADORES ──────────────────────────────────────

    // El Mes viaja como "YYYY-MM", y eso Sheets lo interpreta como fecha: la celda queda con un
    // Date y al leerla salía "Sat Aug 01 2026 00:00:00 GMT-0300…", que no matchea con nada.
    // Se normaliza al leer (arregla las filas ya guardadas así) y se escribe la celda como texto
    // plano en savePagoJugador (evita que vuelva a pasar), igual que con la columna timestamp.
    case "listPagosJugadores": {
      const sh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, pagosJugadores: [] };
      const pagosJugadores = all.slice(1)
        .filter(r => r[0])
        .map(r => ({
          id:                String(r[0]),
          jugadorId:         String(r[1]),
          jugadorNombre:     String(r[2]||""),
          partidosIncluidos: safeParseJSON(String(r[3]||"[]"), []),
          montoBase:         Number(r[4]||0),
          ajuste:            Number(r[5]||0),
          motivoAjuste:      String(r[6]||""),
          montoFinal:        Number(r[7]||0),
          estado:            String(r[8]||"pendiente"),
          fechaPago:         String(r[9]||""),
          medioPago:         String(r[10]||""),
          etiqueta:          String(r[11]||""),
          movimientoId:      String(r[12]||""),
          mes:               normalizarMesPJ_(r[13]),
          tipo:              String(r[14]||""),  // "" en las filas anteriores al backfill
          partidoId:         String(r[15]||""),
          codRubroContra:    String(r[16]||""),  // "" = adelanto, netea como siempre
          movimientoOrigenId:String(r[17]||"")   // EGRESO del adelanto que este descuento netea
        }));
      return { ok: true, pagosJugadores };
    }

    // Upsert genérico de una fila de Pagos Jugadores (ajuste manual, premio, descuento, o alta de
    // monto quincenal/mensual con partidosIncluidos:[] y etiqueta de período).
    // El default de Tipo es "periodico": es lo que era esta acción antes de que existiera la columna.
    case "savePagoJugador": {
      const sh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const p   = data.pago;
      // Las dos formas de un descuento son excluyentes y significan cosas opuestas: con
      // CodRubroContra el club le vendió algo y hay que CREAR el ingreso; con MovimientoOrigenID
      // la plata ya salió y el egreso YA está asentado, así que no hay que crear nada. Aceptar las
      // dos juntas contaría el mismo peso dos veces en la contabilidad. La UI lo impone
      // deshabilitando un selector cuando se usa el otro; acá se corta igual, que es lo que hace
      // que la distinción no se difumine desde un cliente viejo o un reintento raro.
      if (String(p.codRubroContra || "").trim() && String(p.movimientoOrigenId || "").trim()) {
        return { ok: false, error: "Un descuento no puede tener rubro de contrapartida y movimiento de origen a la vez: " +
                 "con rubro se registra un ingreso nuevo, con movimiento se netea uno que ya existe. Elegí uno." };
      }
      const all = sh.getDataRange().getValues();
      if (p.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(p.id)) {
            sh.getRange(i + 1, 1, 1, PJ_COLS.length).setValues([[
              p.id, p.jugadorId, p.jugadorNombre||"", JSON.stringify(p.partidosIncluidos||[]),
              Number(p.montoBase||0), Number(p.ajuste||0), p.motivoAjuste||"", Number(p.montoFinal||0),
              p.estado||"pendiente", p.fechaPago||"", p.medioPago||"", p.etiqueta||"", p.movimientoId||"", p.mes||"",
              p.tipo||"periodico", p.partidoId||"", p.codRubroContra||"", p.movimientoOrigenId||""
            ]]);
            escribirMesPJ_(sh, i + 1, p.mes || "");
            return { ok: true, id: p.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([
        id, p.jugadorId, p.jugadorNombre||"", JSON.stringify(p.partidosIncluidos||[]),
        Number(p.montoBase||0), Number(p.ajuste||0), p.motivoAjuste||"", Number(p.montoFinal||0),
        p.estado||"pendiente", p.fechaPago||"", p.medioPago||"", p.etiqueta||"", "", p.mes||"",
        p.tipo||"periodico", p.partidoId||"", p.codRubroContra||"", p.movimientoOrigenId||""
      ]);
      escribirMesPJ_(sh, sh.getLastRow(), p.mes || "");
      return { ok: true, id };
    }

    // Completa la columna Tipo (y PartidoID cuando se puede deducir) en las filas cargadas antes
    // de que existieran. Idempotente: sólo toca filas con Tipo vacío, así que se puede correr las
    // veces que haga falta. Escribe las dos columnas de una sola llamada — fila por fila sobre
    // cientos de registros se pasa del límite de tiempo de Apps Script.
    case "backfillTipoPagos": {
      const sh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, completados: 0, porTipo: {} };

      // Frecuencia de cada jugador: es lo único que distingue un premio de un sueldo periódico
      // en las filas viejas (las dos van con PartidosIncluidos "[]").
      const frecuencia = {};
      const cfgAll = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS).getDataRange().getValues();
      for (let i = 1; i < cfgAll.length; i++) {
        const jid = String(cfgAll[i][0] || "").trim();
        if (jid) frecuencia[jid] = String(cfgAll[i][5] || "");
      }

      const col = []; // [[Tipo, PartidoID], …] para todas las filas de datos, en orden
      const porTipo = { partido: 0, premio: 0, periodico: 0 };
      let completados = 0;
      for (let i = 1; i < all.length; i++) {
        const tipoActual = String(all[i][14] || "").trim();
        if (!String(all[i][0] || "").trim() || tipoActual) {
          col.push([tipoActual, String(all[i][15] || "")]);
          continue;
        }
        const partidosIncl = safeParseJSON(String(all[i][3] || "[]"), []);
        let tipo, partidoId = String(all[i][15] || "");
        if (partidosIncl.length === 1) {
          tipo = "partido";
          partidoId = partidoId || String(partidosIncl[0]);
        } else if (partidosIncl.length > 1) {
          // Fila que cubre varios partidos: sigue siendo un pago de partidos, pero no hay
          // un único PartidoID que la represente — PartidosIncluidos manda.
          tipo = "partido";
        } else {
          // Sin partidos: premio si el jugador cobra por partido, sueldo acumulado si es periódico.
          // Un jugador que ya no está en Config Jugadores cae en "periodico", que es como se
          // venía comportando la fila (entra en el acumulado).
          tipo = frecuencia[String(all[i][1] || "").trim()] === "partido" ? "premio" : "periodico";
        }
        col.push([tipo, partidoId]);
        porTipo[tipo] = (porTipo[tipo] || 0) + 1;
        completados++;
      }
      if (completados) sh.getRange(2, PJ_IX.TIPO, col.length, 2).setValues(col);
      return { ok: true, completados, porTipo };
    }

    // Borra una fila pendiente de Pagos Jugadores (ej. premio que el usuario quitó
    // desde el modal de Premios). Solo se permite si sigue pendiente, para no perder
    // el rastro de pagos ya confirmados.
    case "deletePagoJugador": {
      const sh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          if (String(all[i][8]) !== "pendiente") {
            return { ok: false, error: "No se puede quitar un pago ya confirmado" };
          }
          sh.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { ok: false, error: "Pago no encontrado: " + data.id };
    }

    // Marca como pagadas todas las filas cuyo ID esté en data.ids, con la misma fecha/medio/cuenta,
    // y genera UN Movimiento (EGRESO) por jugador, sumando el total de todas sus filas del lote
    // (uno o más partidos, más premios/ajustes sueltos) — en la realidad se hace una sola
    // transferencia por jugador que cubre todo eso, así que tiene que ser un solo movimiento y un
    // solo comprobante. Cada partido y cada premio/ajuste queda itemizado en ItemsDetalle (con su
    // propio partidoId cuando corresponde) para el generador de comprobantes y para que Resumen >
    // Por Partido pueda seguir imputando cada ítem a su partido en vez de al movimiento entero.
    //
    // Los descuentos con CodRubroContra son la excepción: no netean adentro del egreso sino que
    // generan un INGRESO propio en el rubro elegido, vinculado al egreso. El egreso queda por el
    // sueldo BRUTO. Ver el paso 4.
    case "confirmarPagosJugadores": {
      const sh    = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const movSh = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const parSh = getOrCreateSheet(PAR_SHEET, PAR_COLS);
      const ids       = (data.ids || []).map(String);
      if (!ids.length) return { ok: false, error: "No se especificaron pagos a confirmar" };
      const cuenta    = data.cuenta || "";
      const medioPago = data.medioPago || "";
      const fechaPago = data.fechaPago || "";
      const mes       = fechaPago.slice(0, 7).replace("-", ""); // "YYYYMM" — mismo formato que usa el resto de Movimientos
      const ts        = nowTsLocal();

      const parAll = parSh.getDataRange().getValues();
      const partidoById = {};
      for (let i = 1; i < parAll.length; i++) {
        if (parAll[i][0]) partidoById[String(parAll[i][0])] = {
          rival: String(parAll[i][2]||""), numeroFecha: String(parAll[i][3]||""), fecha: String(parAll[i][1]||"")
        };
      }

      // Rubro del sueldo de cada persona, de su ficha. Se lee la hoja entera una sola vez, como
      // la de Partidos de arriba: leerla por jugador adentro del loop multiplicaría las llamadas
      // a la planilla, que es lo caro en Apps Script.
      const cfgAll = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS).getDataRange().getValues();
      const rubroSueldoPorJugador = {};
      for (let i = 1; i < cfgAll.length; i++) {
        const jid = String(cfgAll[i][0] || "").trim();
        if (jid) rubroSueldoPorJugador[jid] = String(cfgAll[i][10] || "").trim();
      }

      // Override opcional desde el modal de liquidación (salida de emergencia: lo normal es que el
      // rubro salga de la ficha). Se aplica SÓLO si el lote tiene un único grupo de jugador —
      // desde la Fase 7 el front manda siempre uno solo, pero el backend sigue soportando lotes
      // multi-jugador y un override global ahí sería ambiguo: no se sabría a quién corresponde.
      const overrideRubro = RUBROS_MAP[String(data.codRubroSueldo || "").trim()]
        ? String(data.codRubroSueldo).trim() : "";

      const all = sh.getDataRange().getValues();

      // 1) Junta las filas a confirmar con sus datos y su fila real en la hoja.
      const filas = [];
      for (let i = 1; i < all.length; i++) {
        if (ids.indexOf(String(all[i][0])) < 0) continue;
        const partidosIncl = safeParseJSON(String(all[i][3]||"[]"), []);
        const tipo = String(all[i][14]||"").trim();
        // Fallback para las filas anteriores a la columna Tipo: el discriminador viejo era
        // PartidosIncluidos.length (mismo criterio que backfillTipoPagos).
        const esPartido = tipo ? tipo === "partido" : partidosIncl.length > 0;
        filas.push({
          rowIndex:      i,
          jugadorId:     String(all[i][1]),
          jugadorNombre: String(all[i][2]||""),
          montoFinal:    Number(all[i][7]||0),
          // MontoBase y Ajuste van separados para poder desglosar el ajuste como ítem propio
          // en ItemsDetalle (ver el armado de items más abajo).
          montoBase:     Number(all[i][4]||0),
          ajuste:        Number(all[i][5]||0),
          motivoAjuste:  String(all[i][6]||""),
          etiqueta:      String(all[i][11]||""),
          // Sólo lo traen los descuentos con contrapartida real: salen del cálculo del egreso y
          // generan un INGRESO propio en ese rubro (ver el paso 4).
          codRubroContra: String(all[i][16]||"").trim(),
          esPartido,
          // Un premio se imputa al partido de su columna PartidoID; un pago de partido, al que
          // dice PartidosIncluidos (que es lo que escribe saveRoster desde siempre).
          // Un DESCUENTO no se imputa a ningún partido aunque su columna PartidoID esté llena: ahí
          // el partido es sólo el contexto desde el que se cargó la fila (ver guardarDescuento en
          // index.html). Si se propagara, el ítem del descuento entraría en ItemsDetalle con ese
          // partido y el concepto del egreso nombraría una fecha que el descuento no paga.
          partidoId:     tipo === "descuento" ? ""
                       : esPartido ? (partidosIncl.length ? String(partidosIncl[0]) : String(all[i][15]||""))
                                   : String(all[i][15]||"")
        });
      }
      if (!filas.length) return { ok: false, error: "No se encontraron los pagos a confirmar" };

      // 2) Agrupa sólo por jugador: un lote de pago (los partidos elegidos en "Transferencias" +
      //    los jugadores tildados) es una sola transferencia por jugador, con un ítem por partido
      //    y uno por cada premio/ajuste suelto (que ya caen en este mismo grupo al no tener partido).
      const grupos = {}; // jugadorId -> { jugadorId, jugadorNombre, filas:[] }
      for (const f of filas) {
        const key = f.jugadorId;
        if (!grupos[key]) grupos[key] = { jugadorId: f.jugadorId, jugadorNombre: f.jugadorNombre, filas: [] };
        grupos[key].filas.push(f);
      }

      // 3) Un lote que netea descuentos contra el sueldo puede dar negativo: eso no es un egreso,
      //    es plata que el jugador le debe al club. Se corta antes de escribir nada — si se
      //    validara adentro del loop de abajo, los jugadores ya procesados quedarían pagados
      //    y el lote a medio confirmar.
      for (const g of Object.values(grupos)) {
        const neto = g.filas.reduce((s, f) => s + Number(f.montoFinal||0), 0);
        if (neto < 0) {
          return { ok: false, error: "Los descuentos de " + g.jugadorNombre + " (neto " + fmtMonto_(neto) +
                   ") superan lo que se le debe. Ajustá el descuento o dejalo pendiente para el mes que viene." };
        }
        // Un lote de puros descuentos con contrapartida no tiene sueldo del cual descontarlos: el
        // egreso saldría en cero y los ingresos quedarían colgados de un movimiento vacío. Se corta
        // acá, junto con el resto de las validaciones, para no escribir nada a medias.
        if (!g.filas.some(f => !f.codRubroContra)) {
          return { ok: false, error: "El lote de " + g.jugadorNombre + " son sólo descuentos imputados a un rubro. " +
                   "Incluí el sueldo o el partido del que se descuentan." };
        }
      }

      // 4) Un EGRESO por jugador, sumando sus filas e itemizando partidos y premios/ajustes, más
      //    un INGRESO por cada descuento con contrapartida.
      let count = 0;
      const movimientosCreados = [];
      for (const g of Object.values(grupos)) {
        // Los descuentos con CodRubroContra salen del cálculo del egreso: no son plata que el club
        // deja de gastar, son plata que el club COBRÓ (una camiseta, una multa, una vianda). Al
        // sacarlos, el egreso queda por el sueldo BRUTO sin ninguna lógica especial, y cada uno
        // genera su propio INGRESO en el rubro elegido, más abajo.
        // Los descuentos sin rubro —adelantos ya entregados y ya registrados como egreso el día
        // que se dio la plata— siguen neteando acá adentro, que es lo correcto para ellos.
        const filasContra  = g.filas.filter(f => f.codRubroContra);
        const filasEgreso  = g.filas.filter(f => !f.codRubroContra);

        // Un ítem por fila, salvo el pago de partido con ajuste, que se parte en dos: el ajuste
        // vive en una columna de la misma fila (no en una fila propia como los premios) y sin
        // separarlo el comprobante dice "1 vs La Emilia — Adelanto $8" sin mostrar que el partido
        // eran $10. La igualdad montoBase + ajuste === montoFinal es la guarda contra filas viejas
        // inconsistentes: si no cierra sale el ítem único con montoFinal, así el total del
        // movimiento nunca difiere del egreso real.
        // Los dos ítems llevan el mismo partidoId, así que Resumen > Por Partido no cambia.
        // Esta regla está duplicada en pjItemsDeFila (index.html), que arma el comprobante que se
        // emite antes de confirmar: si cambia acá, cambiarla allá.
        // for con push y no flatMap: no se puede depender del runtime de Apps Script.
        const items = [];
        for (const f of filasEgreso) {
          if (!f.esPartido) {
            // partidoId también en los premios: así Resumen > Por Partido los imputa al partido en
            // que se ganaron en vez de prorratearlos entre los partidos del movimiento.
            items.push({ desc: f.etiqueta || "Ajuste", monto: f.montoFinal, partidoId: f.partidoId });
            continue;
          }
          const partidoInfo = f.partidoId ? partidoById[f.partidoId] : null;
          const desc = partidoInfo ? (partidoInfo.numeroFecha + " vs " + partidoInfo.rival) : "Pago partido";
          if (f.ajuste !== 0 && f.montoBase !== 0 && f.montoBase + f.ajuste === f.montoFinal) {
            items.push({ desc, monto: f.montoBase, partidoId: f.partidoId });
            items.push({ desc: (f.motivoAjuste || "").trim() || "Ajuste", monto: f.ajuste, partidoId: f.partidoId });
          } else {
            items.push({ desc: f.motivoAjuste ? desc + " — " + f.motivoAjuste : desc,
                         monto: f.montoFinal, partidoId: f.partidoId });
          }
        }
        const montoFinal = items.reduce((s, it) => s + Number(it.monto||0), 0);

        // Concepto corto: numeroFecha de los partidos incluidos (no el desglose completo, que con
        // 2+ partidos queda kilométrico), + sufijo "premios" si hay ítems sueltos sin partido.
        const partidosIds = [...new Set(filasEgreso.filter(f => f.partidoId).map(f => f.partidoId))];
        const hayPremios   = filasEgreso.some(f => !f.esPartido);
        let concepto;
        if (partidosIds.length) {
          const numerosFecha = partidosIds.map(pid => (partidoById[pid]||{}).numeroFecha || "").filter(Boolean);
          concepto = "Pago jugador " + g.jugadorNombre + " — " + numerosFecha.join(", ") + (hayPremios ? " + premios" : "");
        } else {
          concepto = "Pago jugador " + g.jugadorNombre + " — " + items.map(it => it.desc).join(" + ");
        }

        // Observación: motivos de ajuste + desglose legible de los premios/ajustes sueltos. El
        // Concepto sólo dice "+ premios"; acá va qué premio y por cuánto, que es lo que el tesorero
        // necesita para justificar la diferencia contra el monto del partido. Se concatena: los
        // motivos de ajuste ya venían escribiéndose en este campo y no se pisan.
        const partes = [...new Set(filasEgreso.map(f => f.motivoAjuste).filter(Boolean))];
        const premios = filasEgreso.filter(f => !f.esPartido);
        if (premios.length) {
          partes.push("Premios/ajustes: " +
            premios.map(f => (f.etiqueta || "Ajuste") + " " + fmtMonto_(f.montoFinal)).join(", "));
        }
        // Los descuentos con contrapartida no están en ItemsDetalle (romperían el invariante de
        // que los ítems suman el MontoFinal), así que se nombran acá: es lo único que explica, en
        // el movimiento mismo, por qué se transfirió menos que el egreso registrado.
        if (filasContra.length) {
          partes.push("Descontado y cobrado aparte: " +
            filasContra.map(f => (f.etiqueta || "Descuento") + " " + fmtMonto_(Math.abs(f.montoFinal))).join(", "));
        }
        const observacion = partes.join(" · ");

        // partidoId del movimiento: el más reciente del grupo, sólo por compatibilidad con
        // filtros/tags viejos — el Resumen por Partido ya no depende de este campo si hay itemsDetalle.
        const partidoIdMov = partidosIds.length
          ? partidosIds.reduce((a, b) => ((partidoById[b]||{}).fecha||"") > ((partidoById[a]||{}).fecha||"") ? b : a)
          : "";

        // Rubro del EGRESO: el de la ficha del jugador (18 para el cuerpo técnico, 19 para el
        // resto), o el override si vino y el lote es de un solo jugador. Cae al 19 si está vacío o
        // si el código no existe en el catálogo, así nunca se escribe un rubro inventado.
        // Los INGRESOS de contrapartida no se tocan: cada uno lleva el suyo.
        const codRubroFicha = rubroSueldoPorJugador[g.jugadorId] || "";
        const codRubroMov = (overrideRubro && Object.keys(grupos).length === 1) ? overrideRubro
          : (RUBROS_MAP[codRubroFicha] ? codRubroFicha : CFGJ_RUBRO_SUELDO_DEFAULT);
        const infoRubroMov = RUBROS_MAP[codRubroMov] || RUBROS_MAP[CFGJ_RUBRO_SUELDO_DEFAULT];

        const movId = uid_gs();
        const mov = {
          id: movId, mes, fecha: fechaPago,
          codRubro: codRubroMov, rubro: infoRubroMov.nombre, categoria: infoRubroMov.cat,
          concepto, egreso: montoFinal, ingreso: 0, montoFinal,
          cuenta, cuentaDestino: "", modoPago: medioPago,
          jugadorCT: g.jugadorNombre, jugadorId: g.jugadorId, adherente: "", observacion, comprobante: "",
          seguroReintegro: 0, tipo: "EGRESO", timestamp: ts, partidoId: partidoIdMov, eventoId: "", vinculos: [],
          itemsDetalle: items
        };
        movSh.appendRow([
          mov.id, mov.mes, mov.fecha, mov.codRubro, mov.rubro, mov.categoria,
          mov.concepto, mov.egreso, mov.ingreso, mov.montoFinal,
          mov.cuenta, mov.cuentaDestino, mov.modoPago,
          mov.jugadorCT, mov.adherente, mov.observacion, mov.comprobante, mov.seguroReintegro,
          mov.tipo, mov.timestamp, mov.partidoId, mov.eventoId, stringifyVinculos(mov.vinculos),
          stringifyItemsDetalle(mov.itemsDetalle), mov.jugadorId || "", ""
        ]);
        movimientosCreados.push(mov);

        // Un INGRESO por cada descuento con contrapartida. El egreso se escribió primero porque
        // hace falta su id para el vínculo.
        for (const f of filasContra) {
          const info    = RUBROS_MAP[f.codRubroContra] || {};
          const importe = Math.abs(Number(f.montoFinal || 0));
          const ing = {
            id: uid_gs(), mes, fecha: fechaPago,
            codRubro: f.codRubroContra, rubro: info.nombre || "", categoria: info.cat || "",
            // El concepto es lo que el comprobante muestra como línea negativa: está duplicado en
            // pjConceptoContra (index.html), que arma el comprobante ANTES de liquidar. Si cambia
            // el formato acá, cambiarlo allá.
            concepto: (f.etiqueta || "Descuento") + " — " + g.jugadorNombre,
            egreso: 0, ingreso: importe, montoFinal: importe,
            cuenta, cuentaDestino: "", modoPago: medioPago,
            jugadorCT: g.jugadorNombre, jugadorId: g.jugadorId, adherente: "",
            observacion: "Descontado del sueldo", comprobante: "", seguroReintegro: 0,
            tipo: "INGRESO", timestamp: ts,
            // partidoId VACÍO a propósito. Resumen > Por Partido excluye las categorías de
            // PARTIDO_RES_CATS_EXCLUIDAS, y el sueldo bruto cae ahí; pero "Indumentaria y
            // Equipamiento" no está excluida: si el ingreso de la camiseta heredara el partido de
            // la liquidación, esos $20 se sumarían a la recaudación de esa fecha (y al balance
            // público) sin tener nada que ver con la jornada.
            partidoId: "", eventoId: "",
            // El array vive siempre en el movimiento INGRESO apuntando al egreso, misma convención
            // que el reintegro de seguro (rubro 21): así la pantalla de vínculos muestra el par
            // emparejado sin tocarla y checkIntegridad cubre el caso nuevo sin cambios.
            vinculos: [{ egresoId: movId, monto: importe }],
            itemsDetalle: []
          };
          movSh.appendRow([
            ing.id, ing.mes, ing.fecha, ing.codRubro, ing.rubro, ing.categoria,
            ing.concepto, ing.egreso, ing.ingreso, ing.montoFinal,
            ing.cuenta, ing.cuentaDestino, ing.modoPago,
            ing.jugadorCT, ing.adherente, ing.observacion, ing.comprobante, ing.seguroReintegro,
            ing.tipo, ing.timestamp, ing.partidoId, ing.eventoId, stringifyVinculos(ing.vinculos),
            stringifyItemsDetalle(ing.itemsDetalle), ing.jugadorId || "", ""
          ]);
          movimientosCreados.push(ing);
        }

        // Todas las filas del jugador —incluidas las de contrapartida— quedan apuntando al EGRESO.
        // Es lo que hace que borrar el egreso revierta la liquidación entera (ver
        // revertirPagosDeMovimiento_); el ingreso queda con el vínculo colgado, que es exactamente
        // lo que checkIntegridad reporta.
        for (const f of g.filas) {
          sh.getRange(f.rowIndex + 1, PJ_IX.ESTADO, 1, 2).setValues([[ "pagado", fechaPago ]]);
          sh.getRange(f.rowIndex + 1, PJ_IX.MEDIO_PAGO).setValue(medioPago);
          sh.getRange(f.rowIndex + 1, PJ_IX.MOVIMIENTO_ID).setValue(movId);
          count++;
        }
      }
      return { ok: true, count, movimientos: movimientosCreados };
    }

    // ─── EVENTOS (Peñas y similares) ─────────────────────────

    case "listEventos": {
      const sh  = getOrCreateSheet(EVE_SHEET, EVE_COLS);
      autoFillIds(sh, r => r[1] || r[2]); // Nombre o Fecha
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, eventos: [] };
      const eventos = all.slice(1)
        .filter(r => r[0] && String(r[3]) !== "false")
        .map(r => ({
          id:     String(r[0]),
          nombre: String(r[1]||""),
          fecha:  formatFecha(r[2]),
          activo: String(r[3]) !== "false"
        }))
        .sort((a,b) => b.fecha.localeCompare(a.fecha));
      return { ok: true, eventos };
    }

    case "saveEvento": {
      const sh  = getOrCreateSheet(EVE_SHEET, EVE_COLS);
      const ev  = data.evento;
      const all = sh.getDataRange().getValues();
      if (ev.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(ev.id)) {
            sh.getRange(i + 1, 1, 1, EVE_COLS.length).setValues([[
              ev.id, ev.nombre||"", ev.fecha||"", "true"
            ]]);
            return { ok: true, id: ev.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, ev.nombre||"", ev.fecha||"", "true"]);
      return { ok: true, id };
    }

    case "deleteEvento": {
      const sh  = getOrCreateSheet(EVE_SHEET, EVE_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.getRange(i + 1, 4).setValue("false");
          return { ok: true };
        }
      }
      return { ok: false, error: "Evento no encontrado: " + data.id };
    }

    // ─── MIGRACIÓN DE RUBROS HISTÓRICOS (Tareas 2 y 4) ────────

    case "previewMigracion": {
      const plan = construirPlanMigracion();
      return { ok: true, counts: plan.counts, flagged: plan.flagged, cambios: plan.plan.length };
    }

    case "ejecutarMigracion": {
      const plan = construirPlanMigracion();
      if (!plan.plan.length) return { ok: true, counts: plan.counts, flagged: plan.flagged, batchId: null, aplicados: 0 };
      const sh    = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const migSh = getOrCreateSheet(MIG_SHEET, MIG_COLS);
      const batchId = "mig-" + new Date().getTime();
      const ts = nowTsLocal();
      const colNum = { codRubro: 4, rubro: 5, categoria: 6 };
      for (const ch of plan.plan) {
        sh.getRange(ch.rowIndex + 1, colNum[ch.campo]).setValue(ch.nuevo);
        migSh.appendRow([ts, batchId, ch.id, ch.campo, ch.original, ch.nuevo]);
      }
      return { ok: true, counts: plan.counts, flagged: plan.flagged, batchId, aplicados: plan.plan.length };
    }

    case "revertMigracion": {
      const migSh  = getOrCreateSheet(MIG_SHEET, MIG_COLS);
      const migAll = migSh.getDataRange().getValues();
      const sh     = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const movAll = sh.getDataRange().getValues();
      const idToRow = {};
      for (let i = 1; i < movAll.length; i++) idToRow[String(movAll[i][0])] = i + 1;
      const colNum = { codRubro: 4, rubro: 5, categoria: 6 };
      let reverted = 0;
      for (let i = 1; i < migAll.length; i++) {
        const row = migAll[i];
        if (String(row[1]) !== String(data.batchId)) continue;
        const rowNum = idToRow[String(row[2])];
        const campo  = String(row[3]);
        if (!rowNum || !colNum[campo]) continue;
        sh.getRange(rowNum, colNum[campo]).setValue(row[4]);
        reverted++;
      }
      return { ok: true, reverted };
    }

    // ─── RESERVA DE GRANOS ──────────────────────────────────────

    case "listReservas": {
      const sh  = getOrCreateSheet(RES_SHEET, RES_COLS);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, reservas: [] };
      const reservas = all.slice(1).filter(r => r[0]).map(r => ({
        id:           String(r[0]),
        fecha:        formatFecha(r[1]),
        grano:        String(r[2] || ""),
        tipo:         String(r[3] || ""),
        kg:           Number(r[4] || 0),
        nota:         String(r[5] || ""),
        movimientoId: String(r[6] || ""),
      }));
      return { ok: true, reservas };
    }

    case "saveReserva": {
      const sh = getOrCreateSheet(RES_SHEET, RES_COLS);
      const r  = data.reserva;
      const id = r.id || uid_gs();
      sh.appendRow([
        id, r.fecha || "", r.grano || "", r.tipo || "", Number(r.kg || 0),
        r.nota || "", r.movimientoId || "", nowTsLocal()
      ]);
      return { ok: true, id };
    }

    case "deleteReserva": {
      const sh  = getOrCreateSheet(RES_SHEET, RES_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(data.id)) {
          sh.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { ok: true };
    }

    // Siembra el stock inicial de granos y el precio de referencia (una sola vez).
    case "seedGranos": {
      const resSh = getOrCreateSheet(RES_SHEET, RES_COLS);
      if (resSh.getLastRow() <= 1) {
        const ts = nowTsLocal();
        const fecha = ts.slice(0, 10);
        resSh.appendRow([uid_gs(), fecha, "Soja",  "COSECHA", 36020, "Stock inicial", "", ts]);
        resSh.appendRow([uid_gs(), fecha, "Trigo", "COSECHA", 43860, "Stock inicial", "", ts]);
      }
      const cfgSh = getOrCreateSheet(CFG_SHEET, CFG_COLS);
      const all   = cfgSh.getDataRange().getValues();
      let hasPrecios = false, hasSeeded = false;
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === "preciosGranos") hasPrecios = true;
        if (String(all[i][0]) === "seededGranos")  hasSeeded  = true;
      }
      if (!hasPrecios) cfgSh.appendRow(["preciosGranos", JSON.stringify({ Soja: 480000, Trigo: 293600 })]);
      if (!hasSeeded)  cfgSh.appendRow(["seededGranos", "true"]);
      return { ok: true };
    }

    default:
      return { ok: false, error: "Acción desconocida: " + data.action };
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Normaliza un nombre para comparar: sin acentos, sin mayúsculas, sin espacios de sobra.
 * Equivalente al normStr() de index.html — se compara nombres tipeados a mano, donde
 * "GONZÁLEZ " y "gonzalez" tienen que ser la misma persona.
 */
function normStr_gs(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Reescribe el nombre de una entidad en una hoja que guarda ID + copia del nombre.
 * Escribe la columna del nombre en las filas cuyo ID coincide, y además "adopta" las
 * filas viejas que tienen el ID vacío pero el nombre viejo exacto, completándoles el ID.
 * colId / colNombre son 1-based. Devuelve cuántas filas se tocaron.
 */
function cascadeNombre_(sheetName, cols, colId, colNombre, id, nombreViejo, nombreNuevo) {
  const sh  = getOrCreateSheet(sheetName, cols);
  const all = sh.getDataRange().getValues();
  if (all.length <= 1) return 0;
  const ixId = colId - 1, ixNom = colNombre - 1;
  const viejoNorm = normStr_gs(nombreViejo);
  const colsId = [], colsNom = [];
  let tocadas = 0;
  for (let i = 1; i < all.length; i++) {
    const rowId  = String(all[i][ixId]  || "").trim();
    const rowNom = String(all[i][ixNom] || "").trim();
    const esMio  = rowId === String(id) || (!rowId && viejoNorm && normStr_gs(rowNom) === viejoNorm);
    if (esMio) {
      colsId.push([String(id)]);
      colsNom.push([nombreNuevo]);
      tocadas++;
    } else {
      colsId.push([rowId]);
      colsNom.push([all[i][ixNom]]);
    }
  }
  if (!tocadas) return 0;
  sh.getRange(2, colId,     colsId.length,  1).setValues(colsId);
  sh.getRange(2, colNombre, colsNom.length, 1).setValues(colsNom);
  return tocadas;
}

/**
 * Auto-genera IDs para filas que tienen datos pero ID vacío.
 * hasData(row) → truthy si la fila merece un ID
 * fixRow(row)  → opcional; retorna el array completo a escribir (para completar Activo, etc.)
 */
function autoFillIds(sh, hasData, fixRow) {
  const all = sh.getDataRange().getValues();
  for (let i = 1; i < all.length; i++) {
    const r = all[i];
    if (!r[0] && hasData(r)) {
      const newId = uid_gs();
      r[0] = newId;
      if (fixRow) {
        const fixed = fixRow(r);
        if (fixed) { sh.getRange(i + 1, 1, 1, fixed.length).setValues([fixed]); continue; }
      }
      sh.getRange(i + 1, 1).setValue(newId);
    }
  }
}

/** true si ya existe una fila con ese ID en la hoja de Movimientos. */
function idExisteEnMov(sh, id) {
  if (!id) return false;
  const ids = sh.getDataRange().getValues();
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return true;
  }
  return false;
}

/**
 * Refuerza la coherencia de un movimiento antes de grabarlo, sin importar si viene
 * del formulario, de saveBatch o de un import de Excel:
 * - Si CodRubro está en el catálogo (RUBROS_MAP), fuerza Rubro/Categoria al texto
 *   canónico (evita que quede texto libre desincronizado del código).
 * - Si Tipo viene vacío, lo infiere de Ingreso/Egreso.
 * - Recalcula MontoFinal para que sea coherente con Tipo/Egreso/Ingreso.
 */
// Los vínculos de reintegro se guardan en una sola celda como JSON:
// [{ "egresoId": "...", "monto": 12345 }, ...] — un ingreso puede cubrir varios egresos.
function parseVinculosJson(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function stringifyVinculos(vinculos) {
  if (!vinculos || !Array.isArray(vinculos) || !vinculos.length) return "";
  return JSON.stringify(vinculos);
}

function parseItemsDetalleJson(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function stringifyItemsDetalle(items) {
  if (!items || !Array.isArray(items) || !items.length) return "";
  return JSON.stringify(items);
}

function normalizeMovFields(m) {
  const out = Object.assign({}, m);
  const cat = RUBROS_MAP[String(out.codRubro || "")];
  if (cat) {
    out.rubro     = cat.nombre;
    out.categoria = cat.cat;
  }
  const egreso  = Number(out.egreso  || 0);
  const ingreso = Number(out.ingreso || 0);
  if (!out.tipo) {
    if (ingreso > 0) out.tipo = "INGRESO";
    else if (egreso > 0) out.tipo = "EGRESO";
  }
  if (out.tipo === "INGRESO")      out.montoFinal = ingreso;
  else if (out.tipo === "EGRESO")  out.montoFinal = egreso;
  else if (out.tipo === "INTERNO") out.montoFinal = Number(out.montoFinal || egreso || ingreso || 0);
  return out;
}

// Mismos rubros que se consideran aporte de adherente en el front-end (ADH_RUBROS):
// [6] ADHERENTES | COLABORADORES, [5] PUBLICIDAD - Lonas y otros, [42] APORTE MOVILIDAD
function isAdherenteRubro(codRubro) {
  return codRubro === "5" || codRubro === "6" || codRubro === "42";
}

/** cod 16 (MOVILIDAD-APORTES Y GASTOS) → uno de los 5 rubros nuevos, según Concepto/Tipo. */
function clasificarRubro16(concepto, tipo) {
  if (tipo === "INGRESO") return "42"; // APORTE MOVILIDAD
  const c = (concepto || "").toLowerCase();
  if (c.indexOf("combustible") >= 0) return "15";
  if (c.indexOf("remis") >= 0) return "22";
  if (c.indexOf("viatic") >= 0 || c.indexOf("viático") >= 0) return "40";
  if (c.indexOf("colectivo") >= 0 || c.indexOf("pasaje") >= 0) return "41";
  return null; // sin clasificar
}

/** cod 37 (GASTOS ATENCION REFUERZOS|DT) → uno de los 6 rubros nuevos, según Concepto/Tipo. */
function clasificarRubro37(concepto, tipo) {
  if (tipo === "INGRESO") return { cod: null, motivo: "INGRESO en cod37 - revisar a mano" };
  const c = (concepto || "").toLowerCase();
  if (c.indexOf("vianda") >= 0) return { cod: "43" };
  if (c.indexOf("almac") >= 0) return { cod: "44" };
  if (c.indexOf("alquiler") >= 0) return { cod: "45" };
  if (c.indexOf("comida") >= 0 || c.indexOf("almuerzo") >= 0) return { cod: "47" };
  return { cod: "48", motivo: "sin match de palabra clave (incluye 'asado') -> Otros, revisar" };
}

/**
 * Construye el plan de migración (Tareas 2 y 4) leyendo Movimientos en vivo:
 * - Reclasifica cod 16 y cod 37 según clasificarRubro16/37.
 * - Corrige grafías de cod 9 y cod 27.
 * - Reasigna "SALDO TRANSPORTE 2025" (sin cod) al cod 50.
 * - Junta en "flagged" lo que no se puede resolver solo (para revisión manual):
 *   cod37 sin match (igual se manda a Otros pero se avisa), cod37 con INGRESO,
 *   y JugadorCT "GALARZA" (no está en la lista de jugadores).
 * No escribe nada — `ejecutarMigracion` reusa este plan para aplicar los cambios.
 */
function construirPlanMigracion() {
  const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
  const all = sh.getDataRange().getValues();
  const plan = [];
  const counts = {};
  const flagged = [];

  function addCambioRubro(rowIndex, id, codActual, rubroActual, catActual, nuevoCod) {
    const info = RUBROS_MAP[nuevoCod];
    if (codActual !== nuevoCod)   plan.push({ rowIndex, id, campo: "codRubro", original: codActual,   nuevo: nuevoCod });
    if (rubroActual !== info.nombre) plan.push({ rowIndex, id, campo: "rubro",     original: rubroActual, nuevo: info.nombre });
    if (catActual !== info.cat)   plan.push({ rowIndex, id, campo: "categoria", original: catActual,   nuevo: info.cat });
    counts[info.nombre] = (counts[info.nombre] || 0) + 1;
  }

  for (let i = 1; i < all.length; i++) {
    const r = all[i];
    const id = String(r[0] || "");
    if (!id) continue;
    const codRubro  = String(r[3] || "");
    const rubro     = String(r[4] || "");
    const categoria = String(r[5] || "");
    const concepto  = String(r[6] || "");
    const monto     = Number(r[9] || 0);
    const tipo      = String(r[18] || "");
    const fecha     = formatFecha(r[2]);

    if (codRubro === "16") {
      const nuevoCod = clasificarRubro16(concepto, tipo);
      if (!nuevoCod) {
        flagged.push({ id, fecha, concepto, tipo, monto, motivo: "cod16 sin clasificar" });
        continue;
      }
      addCambioRubro(i, id, codRubro, rubro, categoria, nuevoCod);
    } else if (codRubro === "37") {
      const res = clasificarRubro37(concepto, tipo);
      if (!res.cod) {
        flagged.push({ id, fecha, concepto, tipo, monto, motivo: res.motivo });
        continue;
      }
      addCambioRubro(i, id, codRubro, rubro, categoria, res.cod);
      if (res.motivo) flagged.push({ id, fecha, concepto, tipo, monto, motivo: res.motivo });
    } else if (rubro === "INTERESES y GASTOS Cuenta") {
      plan.push({ rowIndex: i, id, campo: "rubro", original: rubro, nuevo: RUBROS_MAP["9"].nombre });
      counts["INTERESES Y GASTOS CUENTA (grafía corregida)"] = (counts["INTERESES Y GASTOS CUENTA (grafía corregida)"] || 0) + 1;
    } else if (rubro === "PELOTAS-EQUIPO DEPOR.") {
      plan.push({ rowIndex: i, id, campo: "rubro", original: rubro, nuevo: RUBROS_MAP["27"].nombre });
      counts["PELOTAS - EQUIPO DEPORTIVO (grafía corregida)"] = (counts["PELOTAS - EQUIPO DEPORTIVO (grafía corregida)"] || 0) + 1;
    } else if (rubro.indexOf("SALDO TRANSPORTE") >= 0) {
      addCambioRubro(i, id, codRubro, rubro, categoria, "50");
    }

    const jugadorCT = String(r[13] || "").trim();
    if (jugadorCT.toUpperCase() === "GALARZA") {
      flagged.push({ id, fecha, concepto, tipo, monto, motivo: "JugadorCT 'GALARZA' no está en la lista de jugadores" });
    }
  }

  return { plan, counts, flagged };
}

/**
 * Crea o actualiza un registro en Pagos_Adh para el adherente+mes dado.
 * Busca al adherente por nombre en la hoja Adherentes para obtener su ID.
 */
function autoUpsertPago(movId, adherenteNombre, mes, estado) {
  try {
    const adhSh  = getOrCreateSheet(ADH_SHEET, ADH_COLS);
    const adhAll = adhSh.getDataRange().getValues();
    let adhId = null, adhNombreReal = adherenteNombre;
    for (let i = 1; i < adhAll.length; i++) {
      if (String(adhAll[i][1]).toLowerCase().trim() === adherenteNombre.toLowerCase().trim()) {
        adhId        = String(adhAll[i][0]);
        adhNombreReal = String(adhAll[i][1]);
        break;
      }
    }
    if (!adhId) return; // adherente no encontrado, skip silencioso

    const pagSh  = getOrCreateSheet(PAG_SHEET, PAG_COLS);
    const pagAll = pagSh.getDataRange().getValues();
    for (let i = 1; i < pagAll.length; i++) {
      if (String(pagAll[i][1]) === adhId && String(pagAll[i][3]) === String(mes)) {
        pagSh.getRange(i + 1, 5).setValue(estado);
        pagSh.getRange(i + 1, 6).setValue(movId);
        pagSh.getRange(i + 1, 7).setValue(nowTsLocal());
        return;
      }
    }
    pagSh.appendRow([uid_gs(), adhId, adhNombreReal, mes, estado, movId, nowTsLocal()]);
  } catch (e) {
    // No interrumpir la transacción principal
  }
}

/**
 * Backfill manual (ejecutar UNA VEZ desde el editor de Apps Script, seleccionando
 * esta función en el desplegable y clic en "Ejecutar"): recorre todos los
 * movimientos de tipo INGRESO con rubro de adherente (5 o 6) y adherente asignado,
 * y marca PAGADO en Pagos_Adh para cada combinación adherente+mes encontrada.
 * Corrige registros viejos de Pagos_Adh que quedaron en PENDIENTE porque el bug de
 * isAdherenteRubro (antes solo detectaba rubro 6) o el import por Excel (saveBatch)
 * nunca los actualizó. No borra ni modifica movimientos, solo corrige Pagos_Adh.
 */
function resyncPagosAdh() {
  const movSh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
  const movAll = movSh.getDataRange().getValues();
  let actualizados = 0;
  for (let i = 1; i < movAll.length; i++) {
    const row       = movAll[i];
    const id        = String(row[0]  || "");
    const mes       = String(row[1]  || "");
    const codRubro  = String(row[3]  || "");
    const adherente = String(row[14] || "").trim();
    const tipo      = String(row[18] || "");
    if (!id || !adherente || tipo !== "INGRESO" || !isAdherenteRubro(codRubro)) continue;
    autoUpsertPago(id, adherente, mes, "PAGADO");
    actualizados++;
  }
  Logger.log("resyncPagosAdh: " + actualizados + " movimientos de adherentes procesados.");
}

function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty("SPREADSHEET_ID");
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch(e) { /* fall through to recreate */ }
  }
  // Try active spreadsheet (bound script)
  let ss;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
  if (!ss) {
    // Standalone Web App: create a new spreadsheet
    ss = SpreadsheetApp.create("Tesorería Club");
  }
  props.setProperty("SPREADSHEET_ID", ss.getId());
  return ss;
}

function getOrCreateSheet(name, cols) {
  const ss = getSpreadsheet();
  let sh   = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const header = sh.getRange(1, 1, 1, cols.length);
    header.setValues([cols]);
    header.setBackground("#1a1a2e");
    header.setFontColor("#ffffff");
    header.setFontWeight("bold");
    sh.setFrozenRows(1);
    if (name === MOV_SHEET) {
      sh.setColumnWidth(1, 150); // ID
      sh.setColumnWidth(7, 220); // Concepto
    }
  } else if (sh.getLastColumn() < cols.length) {
    // La hoja ya existía de antes de agregar columnas nuevas (ej. "Vinculos") — completa
    // los headers que faltan al final, sin tocar las columnas ni los datos existentes.
    const faltantes = cols.slice(sh.getLastColumn());
    const header = sh.getRange(1, sh.getLastColumn() + 1, 1, faltantes.length);
    header.setValues([faltantes]);
    header.setBackground("#1a1a2e");
    header.setFontColor("#ffffff");
    header.setFontWeight("bold");
  }
  return sh;
}

function uid_gs() {
  return Math.random().toString(36).slice(2) + new Date().getTime().toString(36);
}

// ════════════════════════════════════════════════════════════
// BACKUP DIARIO A DRIVE
//
// SETUP (una sola vez): abrí este proyecto en script.google.com, seleccioná
// la función "configurarBackupDiario" en el desplegable de arriba y tocá
// "Ejecutar" (te va a pedir autorización la primera vez). Eso instala un
// trigger que corre backupDiario() todos los días a la hora definida abajo.
// Para desinstalarlo: correr "quitarBackupDiario" una vez.
//
// Guarda una copia completa de la planilla (todas las pestañas) en una
// carpeta de Drive llamada BACKUP_FOLDER_NAME, con la fecha en el nombre.
// Se conservan los últimos BACKUP_RETENCION_DIAS días; las copias más
// viejas se mandan a la papelera de Drive (no se borran para siempre al
// toque, por si hace falta recuperar una por error).
// ════════════════════════════════════════════════════════════

const BACKUP_FOLDER_NAME    = "Tesorería Club - Backups";
const BACKUP_RETENCION_DIAS = 7;
const BACKUP_HORA           = 3; // 0-23, hora local del script (Session.getScriptTimeZone())

function backupDiario() {
  const ss     = getSpreadsheet();
  const folder = getOrCreateBackupFolder();
  const tz     = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const fecha  = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const nombre = "Tesorería Club - Backup " + fecha;

  // Idempotente: si el trigger ya corrió hoy (o se ejecuta a mano de nuevo), no duplica.
  const yaExiste = folder.getFilesByName(nombre).hasNext();
  if (!yaExiste) {
    DriveApp.getFileById(ss.getId()).makeCopy(nombre, folder);
    Logger.log("backupDiario: creado " + nombre);
  } else {
    Logger.log("backupDiario: ya existía " + nombre + ", no se duplica");
  }

  pruneBackupsViejos(folder);
}

function getOrCreateBackupFolder() {
  const existentes = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (existentes.hasNext()) return existentes.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

// Borra (a la papelera) los backups cuyo nombre tiene una fecha anterior al
// corte de retención. Si algún archivo no matchea el patrón de nombre
// esperado, se lo deja intacto por las dudas.
function pruneBackupsViejos(folder) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BACKUP_RETENCION_DIAS);
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const m = f.getName().match(/(\d{4}-\d{2}-\d{2})$/);
    if (!m) continue;
    const fechaArchivo = new Date(m[1] + "T00:00:00");
    if (!isNaN(fechaArchivo.getTime()) && fechaArchivo < cutoff) {
      f.setTrashed(true);
      Logger.log("pruneBackupsViejos: enviado a papelera " + f.getName());
    }
  }
}

// Correr UNA VEZ manualmente desde el editor (Ejecutar) para instalar el trigger diario.
function configurarBackupDiario() {
  quitarBackupDiario(); // evita duplicar si se corre más de una vez
  ScriptApp.newTrigger("backupDiario")
    .timeBased()
    .everyDays(1)
    .atHour(BACKUP_HORA)
    .create();
  Logger.log("configurarBackupDiario: trigger instalado, corre todos los días ~" + BACKUP_HORA + ":00");
}

// Correr manualmente desde el editor si en algún momento querés desactivar el backup diario.
function quitarBackupDiario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "backupDiario")
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Timestamps de carga ──────────────────────────────────────
// Argentina no tiene horario de verano: el offset es SIEMPRE -03:00. Por eso el
// formato se arma con aritmética en vez de Utilities.formatDate — evita depender
// del patrón "XXX" de SimpleDateFormat (que no está garantizado en Apps Script y
// haría fallar listMov entero) y evita 500+ llamadas al servicio por request.
const TZ_OFFSET_MIN = -180;                 // -03:00 en minutos
const TZ_OFFSET_STR = "-03:00";
// Un timestamp ya normalizado: no hace falta reprocesarlo al leer.
const TS_OK_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/;

function pad2_gs(n) { return String(n).length < 2 ? "0" + n : String(n); }

/** Un Date (instante absoluto) → ISO local con offset, ej. "2026-07-28T11:42:07-03:00". */
function isoLocalFromDate(d) {
  const u = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  return u.getUTCFullYear() + "-" + pad2_gs(u.getUTCMonth() + 1) + "-" + pad2_gs(u.getUTCDate())
       + "T" + pad2_gs(u.getUTCHours()) + ":" + pad2_gs(u.getUTCMinutes()) + ":" + pad2_gs(u.getUTCSeconds())
       + TZ_OFFSET_STR;
}

/** Momento actual como ISO local con offset.
 *  Antes se guardaba con toISOString() (UTC), que se leía 3 horas adelantado. */
function nowTsLocal() {
  return isoLocalFromDate(new Date());
}

/** Normaliza lo que haya en la celda timestamp a ISO local con offset.
 *  Contempla los casos posibles: ya normalizado, Date (si Sheets lo auto-parseó),
 *  string ISO en UTC (formato viejo) y basura sin parsear (se devuelve tal cual). */
function tsToIsoLocal(val) {
  if (!val) return "";
  if (val instanceof Date) return isoLocalFromDate(val);
  const s = String(val).trim();
  if (!s) return "";
  if (TS_OK_RE.test(s)) return s;          // camino rápido: ya está en formato
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return isoLocalFromDate(d);
}

/** Utilitario de mantenimiento: reescribe toda la columna timestamp de Movimientos
 *  al formato local con offset. Se corre a mano desde el editor de Apps Script,
 *  una sola vez, para dejar prolijos los registros viejos guardados en UTC.
 *  No cambia el instante representado, solo cómo se lee en la hoja. */
/** Reescribe como texto plano las celdas Mes de "Pagos Jugadores" que Sheets convirtió en fechas.
 *  Idempotente: correr de nuevo no cambia nada. La app ya normaliza al leer, así que esto es
 *  higiene de la planilla — sirve para que el Mes se vea bien también abriendo la hoja a mano. */
function normalizarMesPagosJugadores() {
  const sh   = getOrCreateSheet(PJ_SHEET, PJ_COLS);
  const col  = PJ_COLS.indexOf("Mes") + 1;
  const last = sh.getLastRow();
  if (last < 2) return "Sin filas";
  const rng  = sh.getRange(2, col, last - 1, 1);
  const vals = rng.getValues();
  let cambiados = 0;
  const out = vals.map(r => {
    const nuevo = normalizarMesPJ_(r[0]);
    if (nuevo !== String(r[0] || "")) cambiados++;
    return [nuevo];
  });
  rng.setNumberFormat("@").setValues(out);
  return "Mes normalizado en Pagos Jugadores: " + cambiados + " de " + vals.length;
}

function normalizarTimestampsMovimientos() {
  const sh   = getOrCreateSheet(MOV_SHEET, MOV_COLS);
  const col  = MOV_COLS.indexOf("timestamp") + 1;
  const last = sh.getLastRow();
  if (last < 2) return "Sin filas";
  const rng  = sh.getRange(2, col, last - 1, 1);
  const vals = rng.getValues();
  let cambiados = 0;
  const out = vals.map(r => {
    const nuevo = tsToIsoLocal(r[0]);
    if (nuevo !== String(r[0] || "")) cambiados++;
    return [nuevo];
  });
  rng.setNumberFormat("@").setValues(out);
  return "Timestamps normalizados: " + cambiados + " de " + vals.length;
}

/** Mes de Pagos Jugadores a "YYYY-MM", venga como texto, como "YYYYMM" o como el Date en que
 *  Sheets convierte "2026-08" al escribirlo sin formato de texto. "" si no se puede interpretar. */
function normalizarMesPJ_(v) {
  if (v === "" || v === null || v === undefined) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return isNaN(v.getTime()) ? "" : v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) return s.slice(0, 4) + "-" + s.slice(4);
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
}

/** Reescribe la celda Mes de una fila como texto plano. El formato "@" va ANTES del valor: sobre
 *  una celda ya convertida a fecha, poner el formato después sólo mostraría el número de serie. */
function escribirMesPJ_(sh, fila, mes) {
  const cell = sh.getRange(fila, PJ_COLS.indexOf("Mes") + 1);
  cell.setNumberFormat("@");
  cell.setValue(mes || "");
}

function formatFecha(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return s;
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

/**
 * Devuelve a "pendiente" todo lo que un movimiento había marcado como pagado:
 * filas de Pagos Jugadores y cuotas de Pagos_Adh cuyo MovimientoID sea `movId`.
 * Limpia además fecha y medio de pago, para que la fila quede como antes de confirmarla.
 * Se usa al borrar el movimiento (deleteMov) y al reparar pagos huérfanos.
 *
 * Limpia además el MovimientoOrigenID de los descuentos que apunten al movimiento borrado, pero
 * DEJANDO EL DESCUENTO VIVO: el adelanto se le entregó igual al jugador, así que el descuento sigue
 * siendo legítimo aunque el registro del egreso se haya borrado por error. Lo que no puede quedar
 * es una referencia colgada, que es lo que reporta checkIntegridad.
 * Devuelve { jugadores:[nombres], cuotas:[etiquetas], desvinculados:[nombres] }.
 */
function revertirPagosDeMovimiento_(movId) {
  const out = { jugadores: [], cuotas: [], desvinculados: [] };
  if (!movId) return out;

  const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
  const pjAll = pjSh.getDataRange().getValues();
  for (let i = 1; i < pjAll.length; i++) {
    if (String(pjAll[i][PJ_IX.MOV_ORIGEN_ID - 1] || "").trim() === movId) {
      pjSh.getRange(i + 1, PJ_IX.MOV_ORIGEN_ID).setValue("");
      out.desvinculados.push(String(pjAll[i][2] || "jugador"));
    }
    if (String(pjAll[i][12] || "").trim() !== movId) continue;
    pjSh.getRange(i + 1, PJ_IX.ESTADO, 1, 3).setValues([["pendiente", "", ""]]); // Estado, FechaPago, MedioPago
    pjSh.getRange(i + 1, PJ_IX.MOVIMIENTO_ID).setValue("");
    out.jugadores.push(String(pjAll[i][2] || "jugador"));
  }

  const pagSh  = getOrCreateSheet(PAG_SHEET, PAG_COLS);
  const pagAll = pagSh.getDataRange().getValues();
  for (let i = 1; i < pagAll.length; i++) {
    if (String(pagAll[i][5] || "").trim() !== movId) continue;
    pagSh.getRange(i + 1, 5).setValue("PENDIENTE");
    pagSh.getRange(i + 1, 6).setValue("");
    pagSh.getRange(i + 1, 7).setValue(nowTsLocal());
    out.cuotas.push(String(pagAll[i][2] || "adherente") + " " + String(pagAll[i][3] || ""));
  }
  return out;
}

/**
 * ID del jugador de un movimiento, para poder colgarle un descuento.
 * Los movimientos viejos no tienen JugadorID, así que se cae al nombre — pero sólo para ENCONTRAR
 * el ID, nunca para inventar la fila con el nombre suelto: una fila de Pagos Jugadores sin ID no la
 * arrastra un renombre y queda huérfana. Si no se puede resolver, "" y el llamador avisa.
 */
function jugadorIdDeMovimiento_(jugadorId, nombre) {
  const jid = String(jugadorId || "").trim();
  if (jid) return jid;
  const n = normStr_gs(String(nombre || "").trim());
  if (!n) return "";
  const all = getOrCreateSheet(JUG_SHEET, JUG_COLS).getDataRange().getValues();
  for (let i = 1; i < all.length; i++) {
    const id = String(all[i][0] || "").trim();
    if (id && normStr_gs(String(all[i][1] || "").trim()) === n) return id;
  }
  return "";
}

/** Filas (1-based, como las numera la hoja) de los descuentos vinculados a `movId`. Son varias
 *  cuando el adelanto se descuenta en cuotas: dos filas de $10 contra un egreso de $20. */
function filasDescuentoDeMovimiento_(pjAll, movId) {
  const mid = String(movId || "").trim();
  const out = [];
  if (!mid) return out;
  for (let i = 1; i < pjAll.length; i++) {
    if (String(pjAll[i][PJ_IX.MOV_ORIGEN_ID - 1] || "").trim() === mid) out.push(i + 1);
  }
  return out;
}

/**
 * Qué hay que hacerle al descuento vinculado a un movimiento, SIN escribir nada.
 *
 * Va separado de la escritura para poder cortar antes de tocar el movimiento: destildar la marca
 * sobre un descuento ya liquidado tiene que rechazarse entero, y si se validara después el
 * movimiento ya habría quedado actualizado con el descuento sin borrar.
 *
 * `descontar` es data.descontarDelSueldo y tiene TRES estados, no dos:
 *   { mes }            la casilla está tildada  → crear o actualizar la fila
 *   false              está destildada          → borrar la fila (o rechazar si ya se liquidó)
 *   ausente/undefined  el cliente no la gestiona → no tocar nada
 * El tercero es el que evita que editar un movimiento cualquiera —o un cliente viejo que no manda
 * el campo— borre un descuento que se cargó desde el modal de Pagos a jugadores.
 * Devuelve { accion: "nada"|"crear"|"actualizar"|"borrar", fila, mes, error, aviso }.
 */
function planDescuentoDeMovimiento_(m, movId, descontar) {
  if (descontar === undefined || descontar === null) return { accion: "nada" };
  const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
  const pjAll = pjSh.getDataRange().getValues();
  const todas = filasDescuentoDeMovimiento_(pjAll, movId);
  // Un adelanto descontado en cuotas tiene varias filas apuntándole y una casilla no puede
  // representar eso: se avisa y se dejan como están. Se editan de a una desde Pagos a jugadores,
  // que es de donde salieron.
  if (todas.length > 1) {
    return { accion: "nada", aviso: "Este movimiento tiene " + todas.length + " descuentos parciales " +
             "cargados aparte: se guardó el movimiento y no se tocó ninguno. Editalos desde Pagos a jugadores." };
  }
  const fila  = todas.length ? todas[0] : 0;
  const pendiente = fila ? String(pjAll[fila - 1][PJ_IX.ESTADO - 1] || "") === "pendiente" : false;

  if (!descontar) {
    if (!fila) return { accion: "nada" };
    if (!pendiente) {
      const fechaPago = String(pjAll[fila - 1][PJ_IX.FECHA_PAGO - 1] || "");
      return { accion: "nada", error: "Ese descuento ya se aplicó en la liquidación del " +
               (fechaPago || "pago ya confirmado") + ". Borrá o revertí esa liquidación antes de desmarcar el adelanto." };
    }
    return { accion: "borrar", fila, filaDatos: pjAll[fila - 1] };
  }

  // El mes del descuento: el elegido en el formulario, o el de la fecha del movimiento.
  const mes = String((descontar && descontar.mes) || "").trim() ||
              String(m.fecha || "").slice(0, 7);

  if (!fila) {
    const jugadorId = jugadorIdDeMovimiento_(m.jugadorId, m.jugadorCT);
    if (!jugadorId) {
      return { accion: "nada", aviso: "El movimiento se guardó, pero no se pudo descontar del sueldo: " +
               "no hay ningún jugador identificado en \"" + String(m.jugadorCT || "").trim() + "\". " +
               "Cargá el descuento a mano desde Pagos a jugadores." };
    }
    return { accion: "crear", mes, jugadorId };
  }
  if (!pendiente) {
    return { accion: "nada", aviso: "El descuento vinculado a este movimiento ya se liquidó: quedó con el monto " +
             "y el motivo originales. Si el adelanto cambió de verdad, revertí la liquidación." };
  }
  return { accion: "actualizar", fila, mes, filaDatos: pjAll[fila - 1] };
}

/**
 * Ejecuta el plan de planDescuentoDeMovimiento_.
 *
 * La fila del descuento lleva MontoFinal NEGATIVO (así resta de cualquier suma existente sin
 * lógica especial) y CodRubroContra vacío: el egreso del adelanto ya está en la contabilidad, y
 * duplicarlo con un movimiento nuevo haría que el rubro del sueldo sume de más.
 * Devuelve { descuento, descuentoBorradoId } con lo que haya cambiado, para que el front actualice
 * su copia en memoria sin refrescar. Los datos de la fila vienen en el plan y no se releen celda
 * por celda: cada lectura suelta es una llamada más a la planilla, que es lo caro en Apps Script.
 */
function aplicarPlanDescuento_(plan, m, movId) {
  const out = {};
  if (!plan || plan.accion === "nada") return out;
  const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
  const datos = plan.filaDatos || [];

  if (plan.accion === "borrar") {
    out.descuentoBorradoId = String(datos[0] || "");
    pjSh.deleteRow(plan.fila);
    return out;
  }

  const monto    = -Math.abs(Number(m.egreso || m.montoFinal || 0));
  const etiqueta = String(m.concepto || "").trim() || "Adelanto";

  if (plan.accion === "actualizar") {
    const id        = String(datos[0] || "");
    const jugadorId = String(datos[1] || "");
    const nombre    = String(m.jugadorCT || datos[2] || "");
    pjSh.getRange(plan.fila, 1, 1, PJ_COLS.length).setValues([[
      id, jugadorId, nombre, "[]", monto, 0, "", monto,
      "pendiente", "", "", etiqueta, "", plan.mes, "descuento", "", "", movId
    ]]);
    escribirMesPJ_(pjSh, plan.fila, plan.mes);
    out.descuento = descuentoComoObjeto_(id, jugadorId, nombre, monto, etiqueta, plan.mes, movId);
    return out;
  }

  const id = uid_gs();
  pjSh.appendRow([
    id, plan.jugadorId, String(m.jugadorCT || "").trim(), "[]", monto, 0, "", monto,
    "pendiente", "", "", etiqueta, "", plan.mes, "descuento", "", "", movId
  ]);
  escribirMesPJ_(pjSh, pjSh.getLastRow(), plan.mes);
  out.descuento = descuentoComoObjeto_(id, plan.jugadorId, String(m.jugadorCT || "").trim(),
                                       monto, etiqueta, plan.mes, movId);
  return out;
}

/** La fila del descuento con la misma forma que devuelve listPagosJugadores, para que el front la
 *  pueda meter en su array sin volver a pedir la hoja entera. */
function descuentoComoObjeto_(id, jugadorId, jugadorNombre, monto, etiqueta, mes, movOrigenId) {
  return {
    id, jugadorId, jugadorNombre, partidosIncluidos: [],
    montoBase: monto, ajuste: 0, motivoAjuste: "", montoFinal: monto,
    estado: "pendiente", fechaPago: "", medioPago: "", etiqueta,
    movimientoId: "", mes, tipo: "descuento", partidoId: "",
    codRubroContra: "", movimientoOrigenId: movOrigenId
  };
}

/**
 * Monto en pesos para los mensajes del chequeo de integridad. Separador de miles a mano:
 * los datos de locale de Apps Script no son confiables como para depender de toLocaleString.
 */
function fmtMonto_(n) {
  const v = Number(n || 0);
  if (isNaN(v)) return "$0";
  const neg = v < 0;
  const ent = String(Math.abs(Math.round(v)));
  let out = "";
  for (let i = 0; i < ent.length; i++) {
    if (i > 0 && (ent.length - i) % 3 === 0) out += ".";
    out += ent.charAt(i);
  }
  return (neg ? "-$" : "$") + out;
}
