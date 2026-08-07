/* ══════════════════════════════════════════════════════════════
 * Banco de pruebas del backend — corre con `node spec/harness.js`
 *
 * Code.gs está escrito para Google Apps Script, que no se puede correr localmente.
 * Este archivo emula lo mínimo de SpreadsheetApp (Sheet, Range, getDataRange,
 * appendRow, setValues…) para poder cargar Code.gs en Node y llamar handleAction()
 * como lo haría la app real, con hojas de mentira sembradas a mano.
 *
 * Sirve para verificar lógica de negocio sin deployar ni tocar la planilla real.
 * NO cubre el frontend.
 * ══════════════════════════════════════════════════════════════ */

const fs = require("fs");
const path = require("path");

// ── Mock mínimo de SpreadsheetApp ────────────────────────────
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  setValue(v) { this.sh.set(this.r, this.c, v); }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v))); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  setBackground() { return this; } setFontColor() { return this; } setFontWeight() { return this; }
  setNumberFormat() { return this; }
}

class Sheet {
  constructor(name, rows) { this.name = name; this.rows = (rows || []).map(r => r.slice()); }
  get(r, c) { const row = this.rows[r - 1] || []; return row[c - 1] === undefined ? "" : row[c - 1]; }
  set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = v;
  }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
  getLastRow() { return this.rows.length; }
  getDataRange() { return new Range(this, 1, 1, this.rows.length, this.getLastColumn()); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc); }
  appendRow(vals) { this.rows.push(vals.slice()); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setFrozenRows() {} setColumnWidth() {}
}

const SHEETS = {};

// ── Carga de Code.gs ─────────────────────────────────────────
// Los `const` de nivel superior se pasan a `var` para que el eval directo los deje
// visibles en este scope (si no, quedan encerrados en el eval y no se pueden usar).
const src = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
eval(src.replace(/^(const|let) /gm, "var "));

// Pisa el acceso real a la planilla — va después del eval para ganarle a la definición de Code.gs.
var getSpreadsheet = () => ({
  getSheetByName: n => SHEETS[n] || null,
  insertSheet:    n => (SHEETS[n] = new Sheet(n, []))
});

// ── Utilidades para escribir pruebas ─────────────────────────
function reset() { for (const k of Object.keys(SHEETS)) delete SHEETS[k]; }

/** Crea una hoja con su fila de headers y, opcionalmente, filas de datos. */
function hoja(nombre, cols, filas) { SHEETS[nombre] = new Sheet(nombre, [cols].concat(filas || [])); }

/** Filas de datos (sin el header) de una hoja. */
function filas(nombre) { return SHEETS[nombre] ? SHEETS[nombre].rows.slice(1) : []; }

/** Arma una fila de Movimientos por nombre de campo, sin tener que contar columnas. */
function movRow(campos) {
  const r = new Array(MOV_COLS.length).fill("");
  const ix = {
    id: 0, mes: 1, fecha: 2, codRubro: 3, rubro: 4, categoria: 5, concepto: 6,
    egreso: 7, ingreso: 8, montoFinal: 9, cuenta: 10, cuentaDestino: 11, modoPago: 12,
    jugadorCT: 13, adherente: 14, observacion: 15, comprobante: 16, seguroReintegro: 17,
    tipo: 18, timestamp: 19, partidoId: 20, eventoId: 21,
    vinculos: 22, itemsDetalle: 23, jugadorId: 24, adherenteId: 25
  };
  for (const k of Object.keys(campos)) {
    if (ix[k] === undefined) throw new Error("Campo desconocido en movRow: " + k);
    const v = campos[k];
    r[ix[k]] = (k === "vinculos" || k === "itemsDetalle") && typeof v !== "string" ? JSON.stringify(v) : v;
  }
  return r;
}

// ── Mini framework de aserciones ─────────────────────────────
let _ok = 0, _fail = 0;

function check(descripcion, condicion, detalle) {
  if (condicion) { _ok++; console.log("  ✓ " + descripcion); }
  else { _fail++; console.log("  ✗ " + descripcion + (detalle !== undefined ? "\n      → " + detalle : "")); }
}

function igual(descripcion, actual, esperado) {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado);
  check(descripcion, a === e, a === e ? "" : "esperado " + e + ", vino " + a);
}

function seccion(titulo) { console.log("\n── " + titulo + " " + "─".repeat(Math.max(0, 60 - titulo.length))); }

function resumen() {
  console.log("\n" + "═".repeat(64));
  console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
  process.exitCode = _fail === 0 ? 0 : 1;
}

module.exports = { SHEETS, Sheet, reset, hoja, filas, movRow, check, igual, seccion, resumen,
                   handleAction: (d) => handleAction(d) };

// ── Ejemplo ejecutable: sanity check del ciclo de pagos ──────
if (require.main === module) {
  seccion("Alta y lectura de un movimiento");
  reset();
  hoja(MOV_SHEET, MOV_COLS);
  hoja(ADH_SHEET, ADH_COLS, [["a1", "LOPEZ", "true", 5000, 8]]);
  hoja(PAG_SHEET, PAG_COLS);

  handleAction({ action: "saveMov", mov: {
    id: "m1", mes: "202606", fecha: "2026-06-05", codRubro: "6", concepto: "Cuota",
    ingreso: 5000, cuenta: "MACRO", modoPago: "TRANSFERENCIA",
    adherente: "LOPEZ", adherenteId: "a1", tipo: "INGRESO"
  }});
  const leido = handleAction({ action: "listMov" }).movimientos.find(m => m.id === "m1");
  igual("listMov devuelve el adherenteId", leido.adherenteId, "a1");
  igual("normalizeMovFields completa el rubro", leido.rubro, "ADHERENTES | COLABORADORES");
  igual("autoUpsertPago marcó la cuota", filas(PAG_SHEET)[0][4], "PAGADO");

  seccion("Borrar el movimiento revierte la cuota");
  const rDel = handleAction({ action: "deleteMov", id: "m1" });
  igual("deleteMov informa qué revirtió", rDel.revertido.cuotas.length, 1);
  igual("la cuota volvió a PENDIENTE", filas(PAG_SHEET)[0][4], "PENDIENTE");
  igual("y quedó sin MovimientoID", filas(PAG_SHEET)[0][5], "");

  // ── Mes de Pagos Jugadores convertido en fecha por Sheets ──────
  // Escribir "2026-08" en una celda sin formato de texto hace que Sheets la guarde como Date.
  // Al leer salía "Sat Aug 01 2026 …" y el filtro por mes de la pestaña Mensual no matcheaba nada,
  // así que los descuentos desaparecían de ahí (pero seguían en Transferencias, que no filtra).
  seccion("Mes de Pagos Jugadores deformado por Sheets");
  reset();
  hoja(PJ_SHEET, PJ_COLS, [
    ["pj1", "j1", "GOMEZ", "[]", -40000, 0, "", -40000, "pendiente", "", "", "Adelanto", "",
     new Date(2026, 7, 1), "descuento", ""],                       // celda con Date, como quedó en la planilla
    ["pj2", "j1", "GOMEZ", "[]", 80000, 0, "", 80000, "pendiente", "", "", "Agosto", "",
     "2026-08", "periodico", ""],                                   // celda sana, como texto
    ["pj3", "j2", "PEREZ", "[]", 50000, 0, "", 50000, "pendiente", "", "", "Julio", "",
     "", "periodico", ""],                                          // sin mes asignado
  ]);
  const leidos = handleAction({ action: "listPagosJugadores" }).pagosJugadores;
  igual("un Mes guardado como fecha se lee como YYYY-MM", leidos[0].mes, "2026-08");
  igual("uno sano se deja igual",                          leidos[1].mes, "2026-08");
  igual("y uno vacío sigue vacío",                         leidos[2].mes, "");
  check("los dos de agosto quedan comparables entre sí", leidos[0].mes === leidos[1].mes);

  seccion("El alta escribe el Mes como texto plano");
  handleAction({ action: "savePagoJugador", pago: {
    jugadorId: "j1", jugadorNombre: "GOMEZ", partidosIncluidos: [],
    montoBase: -25000, ajuste: 0, motivoAjuste: "", montoFinal: -25000,
    estado: "pendiente", etiqueta: "Internet", mes: "2026-08", tipo: "descuento", partidoId: ""
  }});
  const nueva = filas(PJ_SHEET).find(f => f[11] === "Internet");
  igual("el Mes queda como string, no como Date", typeof nueva[13], "string");
  igual("y con el valor correcto",                nueva[13], "2026-08");
  const trasAlta = handleAction({ action: "listPagosJugadores" }).pagosJugadores;
  igual("el descuento nuevo se lee en el mismo mes que el sueldo",
        trasAlta.find(p => p.etiqueta === "Internet").mes,
        trasAlta.find(p => p.etiqueta === "Agosto").mes);

  seccion("Reparación de una pasada sobre las filas viejas");
  igual("informa cuántas celdas reescribió", normalizarMesPagosJugadores(),
        "Mes normalizado en Pagos Jugadores: 1 de 4");
  igual("la celda quedó como texto", filas(PJ_SHEET)[0][13], "2026-08");
  igual("y correrla de nuevo no cambia nada", normalizarMesPagosJugadores(),
        "Mes normalizado en Pagos Jugadores: 0 de 4");

  resumen();
}
