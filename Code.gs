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
const PAR_COLS  = ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo","Torneo"];
const EVE_SHEET = "Eventos";
const EVE_COLS  = ["ID","Nombre","Fecha","Activo"];

// ── Pagos a Jugadores (módulo aparte, no integrado a Movimientos todavía) ──
const CFGJ_SHEET = "Config Jugadores";
const CFGJ_COLS  = ["IdJugador","Nombre","MontoTitular","MontoSuplenteConMin","MontoSuplente","Frecuencia","Alias","Activo","Premios"];
// Frecuencia: "partido" | "quincenal" | "mensual"
// Premios: JSON de [{descripcion, monto}] — premios propios del jugador (gol, valla invicta…),
// independientes de la frecuencia. Se aplican desde Pagos Jugadores y generan filas en PJ_SHEET.
const PJ_SHEET = "Pagos Jugadores";
const PJ_COLS  = ["ID","JugadorId","JugadorNombre","PartidosIncluidos","MontoBase","Ajuste","MotivoAjuste","MontoFinal","Estado","FechaPago","MedioPago","Etiqueta","MovimientoID","Mes"];
// PartidosIncluidos: JSON de un array de IDs de partido ("[]" para filas quincenales/mensuales agregadas a mano)
// Estado: "pendiente" | "pagado"
// Mes: "YYYY-MM" (mismo formato que nowMes()/mesLabel() en index.html — NO el "YYYYMM" de MOV_COLS.MES),
// sólo relevante para filas de jugadores "mensual" (partidosIncluidos:[]). Filas viejas pueden tenerlo vacío.
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

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: "Tesorería Club API activa" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// DISPATCH
// ════════════════════════════════════════════════════════════

function handleAction(data) {
  switch (data.action) {

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
      return { ok: true, id };
    }

    case "updateMov": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const m   = normalizeMovFields(data.mov);
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(m.id)) {
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
          return { ok: true };
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
        const movId = String(r[12] || "").trim();
        if (movId && !MOVX.existe[movId]) {
          add("error", "Pagos a jugadores", "El pago de \"" + quien + "\" figura como pagado con un movimiento que se borró: el egreso ya no está en la contabilidad.");
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

      const jugadores = [], cuotas = [];

      const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const pjAll = pjSh.getDataRange().getValues();
      for (let i = 1; i < pjAll.length; i++) {
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

      return { ok: true, jugadores, cuotas };
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
          torneo:       String(r[6]||"")
        }))
        .sort((a,b) => b.fecha.localeCompare(a.fecha));
      return { ok: true, partidos };
    }

    case "savePartido": {
      const sh = getOrCreateSheet(PAR_SHEET, PAR_COLS);
      const p  = data.partido;
      const all = sh.getDataRange().getValues();
      if (p.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(p.id)) {
            sh.getRange(i + 1, 1, 1, PAR_COLS.length).setValues([[
              p.id, p.fecha||"", p.rival||"", p.numeroFecha||"", p.condicion||"LOCAL", "true", p.torneo||""
            ]]);
            return { ok: true, id: p.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, p.fecha||"", p.rival||"", p.numeroFecha||"", p.condicion||"LOCAL", "true", p.torneo||""]);
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
          premios:             safeParseJSON(String(r[8]||"[]"), [])
        }));
      return { ok: true, configJugadores };
    }

    case "saveConfigJugador": {
      const sh  = getOrCreateSheet(CFGJ_SHEET, CFGJ_COLS);
      const c   = data.config;
      const all = sh.getDataRange().getValues();
      for (let i = 1; i < all.length; i++) {
        if (String(all[i][0]) === String(c.idJugador)) {
          sh.getRange(i + 1, 1, 1, CFGJ_COLS.length).setValues([[
            c.idJugador, c.nombre||"", Number(c.montoTitular||0), Number(c.montoSuplenteConMin||0),
            Number(c.montoSuplente||0), c.frecuencia||"partido", c.alias||"", "true",
            JSON.stringify(c.premios||[])
          ]]);
          return { ok: true, idJugador: c.idJugador };
        }
      }
      sh.appendRow([
        c.idJugador, c.nombre||"", Number(c.montoTitular||0), Number(c.montoSuplenteConMin||0),
        Number(c.montoSuplente||0), c.frecuencia||"partido", c.alias||"", "true",
        JSON.stringify(c.premios||[])
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
      const lista = data.premios || []; // [{jugadorId, jugadorNombre, montoFinal, etiqueta, mes}]
      const creados = [];
      for (const p of lista) {
        const id = uid_gs();
        sh.appendRow([
          id, p.jugadorId, p.jugadorNombre||"", "[]",
          Number(p.montoFinal||0), 0, "", Number(p.montoFinal||0),
          "pendiente", "", "", p.etiqueta||"", "", p.mes||""
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

      // Upsert de la fila de pago pendiente por jugador (salvo "noJugo").
      const pjAll = pjSh.getDataRange().getValues();
      for (const r of roster) {
        if (r.rol === "noJugo") continue;
        const partidosStr = JSON.stringify([partidoId]);
        let found = false;
        for (let i = 1; i < pjAll.length; i++) {
          if (String(pjAll[i][1]) === String(r.jugadorId) && String(pjAll[i][3]) === partidosStr && String(pjAll[i][8]) === "pendiente") {
            pjSh.getRange(i + 1, 5, 1, 4).setValues([[
              Number(r.montoBase||0), Number(r.ajuste||0), r.motivoAjuste||"", Number(r.montoFinal||0)
            ]]);
            pjSh.getRange(i + 1, 14).setValue(r.mes||"");
            found = true;
            break;
          }
        }
        if (!found) {
          pjSh.appendRow([
            uid_gs(), r.jugadorId, r.jugadorNombre||"", partidosStr,
            Number(r.montoBase||0), Number(r.ajuste||0), r.motivoAjuste||"", Number(r.montoFinal||0),
            "pendiente", "", "", "", "", r.mes||""
          ]);
        }
      }
      return { ok: true };
    }

    // ─── PAGOS JUGADORES ──────────────────────────────────────

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
          mes:               String(r[13]||"")
        }));
      return { ok: true, pagosJugadores };
    }

    // Upsert genérico de una fila de Pagos Jugadores (ajuste manual, o alta de monto
    // quincenal/mensual con partidosIncluidos:[] y etiqueta de período).
    case "savePagoJugador": {
      const sh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
      const p   = data.pago;
      const all = sh.getDataRange().getValues();
      if (p.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(p.id)) {
            sh.getRange(i + 1, 1, 1, PJ_COLS.length).setValues([[
              p.id, p.jugadorId, p.jugadorNombre||"", JSON.stringify(p.partidosIncluidos||[]),
              Number(p.montoBase||0), Number(p.ajuste||0), p.motivoAjuste||"", Number(p.montoFinal||0),
              p.estado||"pendiente", p.fechaPago||"", p.medioPago||"", p.etiqueta||"", p.movimientoId||"", p.mes||""
            ]]);
            return { ok: true, id: p.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([
        id, p.jugadorId, p.jugadorNombre||"", JSON.stringify(p.partidosIncluidos||[]),
        Number(p.montoBase||0), Number(p.ajuste||0), p.motivoAjuste||"", Number(p.montoFinal||0),
        p.estado||"pendiente", p.fechaPago||"", p.medioPago||"", p.etiqueta||"", "", p.mes||""
      ]);
      return { ok: true, id };
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

      const all = sh.getDataRange().getValues();

      // 1) Junta las filas a confirmar con sus datos y su fila real en la hoja.
      const filas = [];
      for (let i = 1; i < all.length; i++) {
        if (ids.indexOf(String(all[i][0])) < 0) continue;
        const partidosIncl = safeParseJSON(String(all[i][3]||"[]"), []);
        filas.push({
          rowIndex:      i,
          jugadorId:     String(all[i][1]),
          jugadorNombre: String(all[i][2]||""),
          montoFinal:    Number(all[i][7]||0),
          motivoAjuste:  String(all[i][6]||""),
          etiqueta:      String(all[i][11]||""),
          partidoId:     partidosIncl.length ? partidosIncl[0] : ""
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

      // 3) Un movimiento por jugador, sumando sus filas e itemizando partidos y premios/ajustes.
      let count = 0;
      const movimientosCreados = [];
      for (const g of Object.values(grupos)) {
        const items = g.filas.map(f => {
          const partidoInfo = f.partidoId ? partidoById[f.partidoId] : null;
          let desc;
          if (f.partidoId) {
            desc = partidoInfo ? (partidoInfo.numeroFecha + " vs " + partidoInfo.rival) : "Pago partido";
            if (f.motivoAjuste) desc += " — " + f.motivoAjuste;
          } else {
            desc = f.etiqueta || "Ajuste";
          }
          return { desc, monto: f.montoFinal, partidoId: f.partidoId };
        });
        const montoFinal = items.reduce((s, it) => s + Number(it.monto||0), 0);

        // Concepto corto: numeroFecha de los partidos incluidos (no el desglose completo, que con
        // 2+ partidos queda kilométrico), + sufijo "premios" si hay ítems sueltos sin partido.
        const partidosIds = [...new Set(g.filas.filter(f => f.partidoId).map(f => f.partidoId))];
        const hayPremios   = g.filas.some(f => !f.partidoId);
        let concepto;
        if (partidosIds.length) {
          const numerosFecha = partidosIds.map(pid => (partidoById[pid]||{}).numeroFecha || "").filter(Boolean);
          concepto = "Pago jugador " + g.jugadorNombre + " — " + numerosFecha.join(", ") + (hayPremios ? " + premios" : "");
        } else {
          concepto = "Pago jugador " + g.jugadorNombre + " — " + items.map(it => it.desc).join(" + ");
        }

        const observacion = [...new Set(g.filas.map(f => f.motivoAjuste).filter(Boolean))].join(" · ");

        // partidoId del movimiento: el más reciente del grupo, sólo por compatibilidad con
        // filtros/tags viejos — el Resumen por Partido ya no depende de este campo si hay itemsDetalle.
        const partidoIdMov = partidosIds.length
          ? partidosIds.reduce((a, b) => ((partidoById[b]||{}).fecha||"") > ((partidoById[a]||{}).fecha||"") ? b : a)
          : "";

        const movId = uid_gs();
        const mov = {
          id: movId, mes, fecha: fechaPago, codRubro: "19", rubro: "SUELDO JUGADORES", categoria: "Jugadores y Cuerpo Técnico",
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

        for (const f of g.filas) {
          sh.getRange(f.rowIndex + 1, 9, 1, 2).setValues([[ "pagado", fechaPago ]]);
          sh.getRange(f.rowIndex + 1, 11).setValue(medioPago);
          sh.getRange(f.rowIndex + 1, 13).setValue(movId);
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
 * Devuelve { jugadores:[nombres], cuotas:[etiquetas] } para poder avisar qué se revirtió.
 */
function revertirPagosDeMovimiento_(movId) {
  const out = { jugadores: [], cuotas: [] };
  if (!movId) return out;

  const pjSh  = getOrCreateSheet(PJ_SHEET, PJ_COLS);
  const pjAll = pjSh.getDataRange().getValues();
  for (let i = 1; i < pjAll.length; i++) {
    if (String(pjAll[i][12] || "").trim() !== movId) continue;
    pjSh.getRange(i + 1, 9,  1, 3).setValues([["pendiente", "", ""]]); // Estado, FechaPago, MedioPago
    pjSh.getRange(i + 1, 13).setValue("");                              // MovimientoID
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
