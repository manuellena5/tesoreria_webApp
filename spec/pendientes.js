/* Pruebas de la cola offline de movimientos — `node spec/pendientes.js`
 *
 * Un movimiento que no se pudo guardar por falta de red queda en la cola local (addPendingMov) y
 * se manda después (syncPendingMovs). Se prueba:
 *   · borrar un ALTA offline: sólo se saca de la cola, no se llama al servidor;
 *   · borrar una EDICIÓN offline: se saca de la cola Y se borra en el servidor (si el servidor ya
 *     no lo tiene, cuenta como borrado);
 *   · que un error del servidor con "failed" en el texto no trabe la cola;
 *   · que un error real de red sí corte y deje el ítem para después.
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
function seccion(t) { console.log("\n── " + t + " " + "─".repeat(Math.max(0, 58 - t.length))); }

// Lo que dibuja no se prueba acá: sin DOM, se apaga.
const noop = () => {};
["closeModal", "renderMovimientos", "showOverlay", "hideOverlay", "updateBadge",
 "saveSnapshotToCache", "renderOfflineBanner"].forEach(f => { app[f] = noop; });
const toasts = [];
app.toast = (msg) => toasts.push(msg);
app.getScriptUrl = () => "https://script.example/exec";
app.bloqueadoPorVistaHistorica = () => false;

// Servidor de mentira: registra las llamadas y responde lo que se le diga.
let llamadas = [];
let respuesta = {};
app.Storage.deleteMov = async (id) => { llamadas.push(["deleteMov", id]); return respuesta.deleteMov || { ok: true }; };
app.Storage.updateMov = async (mov) => { llamadas.push(["updateMov", mov.id]); return respuesta.updateMov(mov); };
app.Storage.saveMov   = async (mov) => { llamadas.push(["saveMov", mov.id]);   return respuesta.saveMov(mov); };

const mov = (id, extra) => Object.assign({ id, mes: "202611", fecha: "2026-11-04", tipo: "EGRESO",
  codRubro: "30", concepto: "Prueba " + id, egreso: 1000, ingreso: 0, montoFinal: 1000, cuenta: "EFECTIVO" }, extra);
function preparar(movs, cola) {
  app.movimientos = movs;
  app.pagosJugadores = [];
  app.pagos = [];
  app.setPendingMovs(cola);
  llamadas = []; respuesta = {}; toasts.length = 0;
}
const enCola = () => app.getPendingMovs().map(p => p.mov.id + (p.isEdit ? ":edit" : ":alta"));
const ids = () => app.movimientos.map(m => m.id);

(async () => {
  seccion("1 · Borrar un alta offline");
  const a = mov("a1", { _pending: true });
  preparar([a], [{ mov: a, isEdit: false }]);
  await app.deleteMovimiento("a1");
  igual("no se llama al servidor (allá no existe)", llamadas, []);
  igual("sale de la cola", enCola(), []);
  igual("y de la lista", ids(), []);

  seccion("2 · Borrar una edición offline");
  const e = mov("e1", { _pending: true, concepto: "editado sin red" });
  preparar([e, mov("otro")], [{ mov: e, isEdit: true }]);
  await app.deleteMovimiento("e1");
  igual("se borra en el servidor (ya existía en la hoja)", llamadas, [["deleteMov", "e1"]]);
  igual("sale de la cola", enCola(), []);
  igual("y de la lista", ids(), ["otro"]);

  const e2 = mov("e2", { _pending: true });
  preparar([e2], [{ mov: e2, isEdit: true }]);
  respuesta.deleteMov = { ok: false, error: "Movimiento no encontrado" };
  await app.deleteMovimiento("e2");
  igual("si el servidor ya no lo tiene, cuenta como borrado", [enCola(), ids()], [[], []]);

  const e3 = mov("e3", { _pending: true });
  preparar([e3], [{ mov: e3, isEdit: true }]);
  app.Storage.deleteMov = async (id) => { llamadas.push(["deleteMov", id]); throw new TypeError("Failed to fetch"); };
  await app.deleteMovimiento("e3");
  igual("sin red no se borra nada: la edición sigue en la cola", [enCola(), ids()], [["e3:edit"], ["e3"]]);
  app.Storage.deleteMov = async (id) => { llamadas.push(["deleteMov", id]); return respuesta.deleteMov || { ok: true }; };

  const a2 = mov("a2", { _pending: true });
  preparar([a2], [{ mov: a2, isEdit: false }, { mov: a2, isEdit: true }]);
  await app.deleteMovimiento("a2");
  igual("un alta offline editada offline sigue siendo sólo local", [llamadas, enCola(), ids()], [[], [], []]);

  seccion("3 · La cola no se traba");
  const s1 = mov("s1", { _pending: true }), s2 = mov("s2", { _pending: true });
  preparar([s1, s2], [{ mov: s1, isEdit: true }, { mov: s2, isEdit: false }]);
  respuesta.updateMov = () => ({ ok: false, error: "Lock failed: timeout" });
  respuesta.saveMov   = () => ({ ok: true });
  await app.syncPendingMovs();
  igual("un error del servidor que dice 'failed' no corta: sigue con el resto",
    llamadas, [["updateMov", "s1"], ["saveMov", "s2"]]);
  igual("y la cola queda vacía", enCola(), []);

  const t1 = mov("t1", { _pending: true });
  preparar([t1], [{ mov: t1, isEdit: true }]);
  respuesta.updateMov = () => ({ ok: true, descuento: { id: "x" } });
  const pjAplicar = app.pjAplicarCambioDescuento;
  app.pjAplicarCambioDescuento = () => { throw new TypeError("render failed"); };
  await app.syncPendingMovs();
  app.pjAplicarCambioDescuento = pjAplicar;
  igual("si el servidor lo guardó, sale de la cola aunque falle algo local", enCola(), []);

  const r1 = mov("r1", { _pending: true }), r2 = mov("r2", { _pending: true });
  preparar([r1, r2], [{ mov: r1, isEdit: true }, { mov: r2, isEdit: true }]);
  app.Storage.updateMov = async (m) => { llamadas.push(["updateMov", m.id]); throw new TypeError("Failed to fetch"); };
  await app.syncPendingMovs();
  igual("un corte de red real sí corta y deja todo para después", [llamadas.length, enCola()], [1, ["r1:edit", "r2:edit"]]);

  console.log("\n" + "═".repeat(64));
  console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
  process.exitCode = _fail === 0 ? 0 : 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
