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
const ADH_COLS = ["ID","Nombre","Activo"];
const PAG_COLS = ["ID","AdherenteID","AdherenteNombre","Mes","Estado","MovimientoID","timestamp"];
const JUG_COLS = ["ID","Nombre","Activo"];
const GRP_COLS = ["ID","Nombre","Miembros","Activo"];
const CFG_COLS = ["Clave","Valor"];

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
      const m  = data.mov;
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
      if (m.adherente && isAdherentesRubro(m.rubro)) {
        autoUpsertPago(id, m.adherente, m.mes, "PAGADO");
      }
      return { ok: true, id };
    }

    case "updateMov": {
      const sh  = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const m   = data.mov;
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
          if (m.adherente && isAdherentesRubro(m.rubro)) {
            autoUpsertPago(m.id, m.adherente, m.mes, "PAGADO");
          }
          return { ok: true };
        }
      }
      return { ok: false, error: "Movimiento no encontrado: " + m.id };
    }

    case "saveBatch": {
      const sh   = getOrCreateSheet(MOV_SHEET, MOV_COLS);
      const list = data.movimientos || [];
      for (const m of list) {
        sh.appendRow([
          m.id, m.mes, m.fecha, m.codRubro, m.rubro, m.categoria,
          m.concepto, m.egreso || 0, m.ingreso || 0, m.montoFinal || 0,
          m.cuenta, m.cuentaDestino || "", m.modoPago,
          m.jugadorCT || "", m.adherente || "", m.observacion || "",
          m.comprobante || "", Number(m.seguroReintegro || 0), m.tipo, m.timestamp,
          m.partidoId||""
        ]);
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
      return { ok: true };
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
      return { ok: true };
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
      return { ok: true };
    }

    // ─── ADHERENTES ──────────────────────────────────────────

    case "listAdherentes": {
      const sh  = getOrCreateSheet(ADH_SHEET, ADH_COLS);
      autoFillIds(sh, r => r[1], r => !r[2] ? [r[0], r[1], "true"] : null);
      const all = sh.getDataRange().getValues();
      if (all.length <= 1) return { ok: true, adherentes: [] };
      const adherentes = all.slice(1)
        .filter(r => r[0] && String(r[2]) !== "false")
        .map(r => ({ id: String(r[0]), nombre: String(r[1]).trim() }));
      return { ok: true, adherentes };
    }

    case "saveAdherente": {
      const sh  = getOrCreateSheet(ADH_SHEET, ADH_COLS);
      const a   = data.adherente;
      const all = sh.getDataRange().getValues();
      if (a.id) {
        for (let i = 1; i < all.length; i++) {
          if (String(all[i][0]) === String(a.id)) {
            sh.getRange(i + 1, 2).setValue(a.nombre);
            return { ok: true, id: a.id };
          }
        }
      }
      const id = uid_gs();
      sh.appendRow([id, a.nombre, "true"]);
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
      return { ok: true };
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

function isAdherentesRubro(rubro) {
  return rubro && rubro.toUpperCase().includes("ADHERENTE");
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
