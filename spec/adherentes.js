/* Pruebas de devoluciones a adherentes — `node spec/adherentes.js`
 *
 * En Resumen > Adherentes la cuota de cada adherente es ingresos − egresos: un egreso de rubro 6
 * con el adherente elegido (ej. transfirió a MP y se le devolvió una parte en efectivo, o se le
 * descambió un cheque) resta de lo aportado. Un egreso de otro rubro con adherente no resta.
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
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert: () => {}, confirm: () => true, Blob: function () {}, URL: { createObjectURL: () => "" }
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

const mov = (id, extra) => Object.assign({ id, mes: "202611", fecha: "2026-11-04", tipo: "INGRESO",
  codRubro: "6", rubro: "ADHERENTES | COLABORADORES", concepto: "Cuota", egreso: 0, ingreso: 0,
  montoFinal: 0, cuenta: "MP", adherente: "PEREZ" }, extra);

app.adherentes = [{ id: "a1", nombre: "PEREZ", cuotaMensual: 30000, cuotasAnuales: 10 }];
app.movimientos = [
  mov("1", { ingreso: 50000, montoFinal: 50000 }),                                   // transfirió 50.000 a MP
  mov("2", { tipo: "EGRESO", egreso: 20000, ingreso: 0, montoFinal: -20000, cuenta: "EFECTIVO" }), // se le devolvieron 20.000
  mov("3", { tipo: "EGRESO", codRubro: "42", egreso: 5000, montoFinal: -5000 }),     // gasto de otro rubro: no resta
  mov("4", { fecha: "2026-10-04", mes: "202610", ingreso: 30000, montoFinal: 30000 }),
];
app.nowMes = () => "2026-11";

console.log("\n── Cuota neta ──");
const r = app.calcAdherentesPorAnio("2026").find(x => x.adherente === "PEREZ");
igual("acumulado = ingresos − devoluciones de rubro 6", r.totalAportado, 60000);
igual("noviembre neto", r.porMes["2026-11"], 30000);
igual("octubre sin cambios", r.porMes["2026-10"], 30000);
igual("pagos y devoluciones se cuentan aparte", [r.pagosCount, r.devolucionesCount], [2, 1]);
igual("diferencia contra el compromiso", r.diferencia, 60000 - 300000);

const pm = app.calcPendientesMesActual();
igual("noviembre: 30.000 netos cubren la cuota de 30.000", pm.pendientePorNombre["PEREZ"], false);
app.movimientos.push(mov("5", { tipo: "EGRESO", egreso: 1000, montoFinal: -1000 }));
igual("otra devolución de 1.000 lo deja pendiente", app.calcPendientesMesActual().pendientePorNombre["PEREZ"], true);
igual("idem en Resumen > Mensual", app.calcPendientesEnMes("2026-11").pendientes, ["PEREZ"]);

console.log(`\n${_ok} ok, ${_fail} fallaron`);
process.exit(_fail ? 1 : 0);
