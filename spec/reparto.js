/* Pruebas del cobro dividido — `node spec/reparto.js`
 *
 * Un cobro que entró repartido entre varias cuentas (la recaudación de un partido suele venir
 * parte en efectivo y parte en Mercado Pago) se guarda como un movimiento por cuenta, no como uno
 * solo con dos cuentas: `cuenta` es un campo único y el saldo por cuenta —lo que se concilia
 * contra el banco— depende de eso.
 *
 * Lo que se prueba acá es la parte pura: qué filas cuentan, cuánto suman, y que el reparto quede
 * deshabilitado donde no aplica. El armado de los movimientos vive dentro de saveMovimiento, que
 * toca el DOM y la red, así que se replica su regla de derivación y se verifica contra ella.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function cargarApp() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const bloques = html.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/);
  if (!bloques) throw new Error("No se encontró el bloque <script> de index.html");
  const noop = () => {};
  const el = {
    value: "", textContent: "", innerHTML: "", checked: false, disabled: false,
    dataset: {}, style: {}, options: [], classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, focus: noop, click: noop, appendChild: noop, remove: noop
  };
  const ctx = {
    console,
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null,
                querySelectorAll: () => [], createElement: () => Object.assign({}, el),
                body: el, documentElement: el },
    window: { addEventListener: noop, matchMedia: () => ({ matches: false, addListener: noop }) },
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; },
      clear: () => { for (const k in m) delete m[k]; } }; })(),
    fetch: () => Promise.reject(new Error("sin red en las pruebas")),
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert: noop, confirm: () => true, Blob: function () {}, URL: { createObjectURL: () => "" }
  };
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(bloques[1].replace(/^(const|let) /gm, "var "), ctx, { filename: "index.html<script>" });
  return ctx;
}

const app = cargarApp();

let _ok = 0, _fail = 0;
function check(d, cond, det) {
  if (cond) { _ok++; console.log("  ✓ " + d); }
  else { _fail++; console.log("  ✗ " + d + (det !== undefined ? "\n      → " + det : "")); }
}
function igual(d, actual, esperado) {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado);
  check(d, a === e, a === e ? "" : "esperado " + e + ", vino " + a);
}
function seccion(t) { console.log("\n── " + t + " " + "─".repeat(Math.max(0, 58 - t.length))); }

app.cuentas = ["EFECTIVO", "MP", "MACRO", "NARANJA X"];
app.metodos = ["EFECTIVO", "TRANSFERENCIA", "CHEQUE"];
app.movimientos = [];

function nuevoF(extra) {
  app.editId = null;
  app.F = Object.assign(app.buildDefaultF(), { tipo: "INGRESO", codRubro: "1",
    rubro: "ENTRADAS | CANCHA", categoria: "Ingresos de cancha", concepto: "Recaudación vs María Susana",
    partidoId: "p1" }, extra || {});
  return app.F;
}

// ── 1 · Dónde se puede repartir ────────────────────────────────
seccion("1 · Dónde aplica el reparto");
nuevoF({ tipo: "INGRESO" });
check("un ingreso sí", app.repartoDisponible());
nuevoF({ tipo: "EGRESO" });
check("un egreso también", app.repartoDisponible());
nuevoF({ tipo: "INTERNO" });
check("una transferencia interna no", !app.repartoDisponible());
nuevoF({ tipo: "AJUSTE" });
check("un ajuste tampoco", !app.repartoDisponible());
nuevoF({ tipo: "INGRESO" });
app.editId = "m-existente";
check("editando un movimiento, no", !app.repartoDisponible());
app.editId = null;

// ── 2 · Al activarlo hereda lo que ya estaba cargado ───────────
seccion("2 · Al activarlo no se pierde lo tipeado");
nuevoF({ monto: "697000", cuenta: "MP", modoPago: "TRANSFERENCIA" });
app.F.reparto = [{ monto: app.F.monto, cuenta: app.F.cuenta, modoPago: app.F.modoPago },
                 app.nuevaFilaReparto()];
igual("la primera fila hereda el monto", app.F.reparto[0].monto, "697000");
igual("y la cuenta", app.F.reparto[0].cuenta, "MP");
igual("la segunda arranca vacía", app.F.reparto[1].monto, "");

// ── 3 · Filas válidas y total ──────────────────────────────────
seccion("3 · Qué filas cuentan y cuánto suman");
nuevoF();
app.F.reparto = [
  { monto: "589000", cuenta: "EFECTIVO",  modoPago: "EFECTIVO" },
  { monto: "108000", cuenta: "MP",        modoPago: "TRANSFERENCIA" },
  { monto: "",       cuenta: "MACRO",     modoPago: "TRANSFERENCIA" },
];
igual("la fila vacía no cuenta", app.repartoFilasValidas().length, 2);
igual("el total suma sólo las cargadas", app.repartoTotal(), 697000);
app.F.reparto.push({ monto: "0", cuenta: "NARANJA X", modoPago: "TRANSFERENCIA" });
igual("una fila en 0 tampoco cuenta", app.repartoFilasValidas().length, 2);

// ── 4 · Los movimientos derivados ──────────────────────────────
// Misma regla que aplica saveMovimiento al armar movsExtra.
seccion("4 · Un movimiento por fila");
nuevoF();
app.F.reparto = [
  { monto: "589000", cuenta: "EFECTIVO", modoPago: "EFECTIVO" },
  { monto: "108000", cuenta: "MP",       modoPago: "TRANSFERENCIA" },
];
const filas = app.repartoFilasValidas();
const base = { concepto: app.F.concepto, codRubro: app.F.codRubro, fecha: app.F.fecha,
               partidoId: app.F.partidoId, tipo: app.F.tipo };
const movs = filas.map(f => Object.assign({}, base, {
  ingreso: Math.abs(parseFloat(f.monto)), egreso: 0, cuenta: f.cuenta, modoPago: f.modoPago }));

igual("salen dos movimientos", movs.length, 2);
igual("las cuentas son distintas", movs.map(m => m.cuenta), ["EFECTIVO", "MP"]);
igual("los montos son los de cada fila", movs.map(m => m.ingreso), [589000, 108000]);
igual("suman el total del cobro", movs.reduce((s, m) => s + m.ingreso, 0), 697000);
check("comparten el concepto", movs.every(m => m.concepto === "Recaudación vs María Susana"));
check("comparten el rubro", movs.every(m => m.codRubro === "1"));
check("y el partido, así el resumen por partido los suma juntos",
      movs.every(m => m.partidoId === "p1"));

// ── 5 · El saldo por cuenta queda bien ─────────────────────────
// El motivo de fondo de emitir dos movimientos y no uno.
seccion("5 · Cada cuenta recibe lo suyo");
app.movimientos = movs.map((m, i) => Object.assign({ id: "r" + i, montoFinal: m.ingreso }, m));
const saldos = app.calcSaldosCuentas(app.movimientos);
igual("EFECTIVO", saldos["EFECTIVO"], 589000);
igual("MP", saldos["MP"], 108000);

// ── 6 · El comprobante va por el total ─────────────────────────
// A quien recibe el comprobante no le importa que una parte haya entrado en efectivo y otra por
// Mercado Pago: le importa cuánto pagó.
seccion("6 · El comprobante suma las dos cuentas");
app.movimientos = [
  { id: "r0", tipo: "INGRESO", fecha: "2026-08-09", codRubro: "1", rubro: "ENTRADAS | CANCHA",
    concepto: "Recaudación vs María Susana", ingreso: 589000, egreso: 0, montoFinal: 589000,
    cuenta: "EFECTIVO", modoPago: "EFECTIVO", mes: "202608", partidoId: "p1", eventoId: "" },
  { id: "r1", tipo: "INGRESO", fecha: "2026-08-09", codRubro: "1", rubro: "ENTRADAS | CANCHA",
    concepto: "Recaudación vs María Susana", ingreso: 108000, egreso: 0, montoFinal: 108000,
    cuenta: "MP", modoPago: "TRANSFERENCIA", mes: "202608", partidoId: "p1", eventoId: "" },
];
igual("reconoce las dos filas como un solo cobro", app.movsMismoCobro(app.movimientos[0]).length, 2);
const comp = app.movToComprobante(app.movimientos[0]);
igual("el comprobante sale por el total", comp.items[0].monto, 697000);
igual("con un solo renglón, sin mencionar cómo se pagó", comp.items.length, 1);
const compDesdeLaOtra = app.movToComprobante(app.movimientos[1]);
igual("y da igual desde qué fila se genere", compDesdeLaOtra.items[0].monto, 697000);

// ── 7 · No sumar de más ────────────────────────────────────────
seccion("7 · Dos cobros que se parecen no se mezclan");
app.movimientos.push(
  { id: "r2", tipo: "INGRESO", fecha: "2026-08-09", codRubro: "1", rubro: "ENTRADAS | CANCHA",
    concepto: "Recaudación vs María Susana", ingreso: 50000, egreso: 0, montoFinal: 50000,
    cuenta: "EFECTIVO", modoPago: "EFECTIVO", mes: "202608", partidoId: "p1", eventoId: "" });
igual("con dos filas en la misma cuenta no se asume reparto",
      app.movsMismoCobro(app.movimientos[0]).length, 1);
igual("y el comprobante vuelve a ser el del movimiento solo",
      app.movToComprobante(app.movimientos[0]).items[0].monto, 589000);

app.movimientos = [
  { id: "s0", tipo: "INGRESO", fecha: "2026-08-09", codRubro: "1", rubro: "ENTRADAS | CANCHA",
    concepto: "Recaudación vs María Susana", ingreso: 589000, egreso: 0, montoFinal: 589000,
    cuenta: "EFECTIVO", modoPago: "EFECTIVO", mes: "202608", partidoId: "p1", eventoId: "" },
  { id: "s1", tipo: "INGRESO", fecha: "2026-08-09", codRubro: "1", rubro: "ENTRADAS | CANCHA",
    concepto: "Venta de números", ingreso: 108000, egreso: 0, montoFinal: 108000,
    cuenta: "MP", modoPago: "TRANSFERENCIA", mes: "202608", partidoId: "p1", eventoId: "" },
];
igual("distinto concepto, distinto cobro", app.movsMismoCobro(app.movimientos[0]).length, 1);

console.log("\n" + "═".repeat(64));
console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
process.exitCode = _fail === 0 ? 0 : 1;
