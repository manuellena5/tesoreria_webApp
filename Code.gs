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
const PAR_COLS  = ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo"];

// ── Columnas de cada pestaña ─────────────────────────────────
const MOV_COLS = [
  "ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto",
  "Egreso","Ingreso","MontoFinal","Cuenta","CuentaDestino","ModoPago",
  "JugadorCT","Adherente","Observacion","Comprobante","SeguroReintegro","Tipo","timestamp","PartidoID"
];
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
  "46":  { nombre:"Asado",                                cat:"Jugadores y Cuerpo Técnico" },
  "47":  { nombre:"Comida",                               cat:"Jugadores y Cuerpo Técnico" },
  "48":  { nombre:"Otros (Refuerzos/DT)",                 cat:"Jugadores y Cuerpo Técnico" },
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
};

// ════════════════════════════════════════════════════════════
// ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const result = handleAction(data);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
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
      let rows = all.slice(1).filter(r => r[0]);
      if (data.mes) rows = rows.filter(r => String(r[1]) === String(data.mes));
      const movimientos = rows.map(r => ({
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
        timestamp:     String(r[19] || ""),
        partidoId:     String(r[20]||""),
      }));
      return { ok: true, movimientos };
    }

    case "saveMov": {
      const sh = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const m  = normalizeMovFields(data.mov);
      const id = m.id || uid_gs();
      const ts = new Date().toISOString();
      sh.appendRow([
        id, m.mes||"", m.fecha||"", m.codRubro||"", m.rubro||"", m.categoria||"",
        m.concepto||"", Number(m.egreso||0), Number(m.ingreso||0), Number(m.montoFinal||0),
        m.cuenta||"", m.cuentaDestino||"", m.modoPago||"",
        m.jugadorCT||"", m.adherente||"",
        m.observacion||"", m.comprobante||"", Number(m.seguroReintegro||0), m.tipo||"", ts,
        m.partidoId||""
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
          sh.getRange(i + 1, 1, 1, MOV_COLS.length).setValues([[
            m.id, m.mes||"", m.fecha||"", m.codRubro||"", m.rubro||"", m.categoria||"",
            m.concepto||"", Number(m.egreso||0), Number(m.ingreso||0), Number(m.montoFinal||0),
            m.cuenta||"", m.cuentaDestino||"", m.modoPago||"",
            m.jugadorCT||"", m.adherente||"",
            m.observacion||"", m.comprobante||"", Number(m.seguroReintegro||0), m.tipo||"", new Date().toISOString(),
            m.partidoId||""
          ]]);
          if (m.adherente && m.tipo === "INGRESO" && isAdherenteRubro(m.codRubro)) {
            autoUpsertPago(m.id, m.adherente, m.mes, "PAGADO");
          }
          return { ok: true };
        }
      }
      return { ok: false, error: "Movimiento no encontrado: " + m.id };
    }

    case "saveBatch": {
      const sh   = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const list = (data.movimientos || []).map(normalizeMovFields);
      for (const m of list) {
        sh.appendRow([
          m.id, m.mes, m.fecha, m.codRubro, m.rubro, m.categoria,
          m.concepto, m.egreso || 0, m.ingreso || 0, m.montoFinal || 0,
          m.cuenta, m.cuentaDestino || "", m.modoPago,
          m.jugadorCT || "", m.adherente || "", m.observacion || "",
          m.comprobante || "", Number(m.seguroReintegro || 0), m.tipo, m.timestamp,
          m.partidoId||""
        ]);
        if (m.adherente && m.tipo === "INGRESO" && isAdherenteRubro(m.codRubro)) {
          autoUpsertPago(m.id, m.adherente, m.mes, "PAGADO");
        }
      }
      return { ok: true, saved: list.length };
    }

    case "deleteMov": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const all = sh.getDataRange().getValues();
      for (let i = all.length - 1; i >= 1; i--) {
        if (String(all[i][0]) === String(data.id)) {
          sh.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { ok: false, error: "Movimiento no encontrado: " + data.id };
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
            sh.getRange(i + 1, 2).setValue(j.nombre);
            return { ok: true, id: j.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, j.nombre, "true"]);
      return { ok: true, id };
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
            sh.getRange(i + 1, 1, 1, 4).setValues([[g.id, g.nombre, miembros, "true"]]);
            return { ok: true, id: g.id };
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
      if (a.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(a.id)) {
            sh.getRange(i + 1, 2, 1, 4).setValues([[
              a.nombre, "true", Number(a.cuotaMensual||0), Number(a.cuotasAnuales||0)
            ]]);
            return { ok: true, id: a.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, a.nombre, "true", Number(a.cuotaMensual||0), Number(a.cuotasAnuales||0)]);
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
          sh.getRange(i + 1, 7).setValue(new Date().toISOString());
          return { ok: true, estado: next };
        }
      }
      // Not found → create as PAGADO
      const adhNombre = data.adhNombre || data.adhId;
      sh.appendRow([uid_gs(), data.adhId, adhNombre, data.mes, "PAGADO", "", new Date().toISOString()]);
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
            p.mes, p.estado, p.movimientoId || "", new Date().toISOString()
          ]]);
          return { ok: true };
        }
      }
      const id = uid_gs();
      sh.appendRow([id, p.adherenteId, p.adherenteNombre, p.mes, p.estado, p.movimientoId || "", new Date().toISOString()]);
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
          activo:       String(r[5]) !== "false"
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
              p.id, p.fecha||"", p.rival||"", p.numeroFecha||"", p.condicion||"LOCAL", "true"
            ]]);
            return { ok: true, id: p.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, p.fecha||"", p.rival||"", p.numeroFecha||"", p.condicion||"LOCAL", "true"]);
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
      const ts = new Date().toISOString();
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
        r.nota || "", r.movimientoId || "", new Date().toISOString()
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
        const ts = new Date().toISOString();
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

/**
 * Refuerza la coherencia de un movimiento antes de grabarlo, sin importar si viene
 * del formulario, de saveBatch o de un import de Excel:
 * - Si CodRubro está en el catálogo (RUBROS_MAP), fuerza Rubro/Categoria al texto
 *   canónico (evita que quede texto libre desincronizado del código).
 * - Si Tipo viene vacío, lo infiere de Ingreso/Egreso.
 * - Recalcula MontoFinal para que sea coherente con Tipo/Egreso/Ingreso.
 */
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
  if (c.indexOf("asado") >= 0) return { cod: "46" };
  if (c.indexOf("comida") >= 0 || c.indexOf("almuerzo") >= 0) return { cod: "47" };
  return { cod: "48", motivo: "sin match de palabra clave -> Otros, revisar" };
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
        pagSh.getRange(i + 1, 7).setValue(new Date().toISOString());
        return;
      }
    }
    pagSh.appendRow([uid_gs(), adhId, adhNombreReal, mes, estado, movId, new Date().toISOString()]);
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
  }
  return sh;
}

function uid_gs() {
  return Math.random().toString(36).slice(2) + new Date().getTime().toString(36);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
