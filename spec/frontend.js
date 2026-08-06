/* ══════════════════════════════════════════════════════════════
 * Pruebas de la lógica del frontend — `node spec/frontend.js`
 *
 * `index.html` es un archivo único con todo el JS adentro. Este harness extrae el bloque
 * <script>, lo evalúa en un contexto de Node con stubs mínimos de las APIs del navegador
 * (el script sólo hace 4 llamadas a addEventListener al cargar; el resto son declaraciones)
 * y después llama a las funciones puras con los arrays globales sembrados a mano.
 *
 * NO renderiza HTML ni simula clicks: prueba las reglas de negocio que viven en el front.
 * Para lo que hace el backend, ver spec/harness.js y spec/premios.js.
 * ══════════════════════════════════════════════════════════════ */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ── Carga del <script> de index.html en un contexto de Node ───
function cargarApp() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const bloques = html.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/);
  if (!bloques) throw new Error("No se encontró el bloque <script> de index.html");

  const noop = () => {};
  const elementoFalso = {
    value: "", textContent: "", innerHTML: "", checked: false, disabled: false,
    dataset: {}, style: {}, options: [], classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, focus: noop, click: noop, appendChild: noop, remove: noop
  };
  const ctx = {
    console,
    document: {
      addEventListener: noop, getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => Object.assign({}, elementoFalso),
      body: elementoFalso, documentElement: elementoFalso
    },
    window: { addEventListener: noop, matchMedia: () => ({ matches: false, addListener: noop }) },
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    localStorage: (() => {
      const m = {};
      return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
               removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; } };
    })(),
    fetch: () => Promise.reject(new Error("sin red en las pruebas")),
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert: noop, confirm: () => true, Blob: function () {}, URL: { createObjectURL: () => "" }
  };
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window.document = ctx.document;
  vm.createContext(ctx);

  // Los `const`/`let` de nivel superior crean bindings léxicos, que no quedan como propiedades
  // del contexto: desde afuera no se podrían leer ni sembrar (`app.pagosJugadores = […]` crearía
  // una variable nueva y las funciones seguirían viendo la original). Pasarlos a `var` los expone.
  // El `^` con flag multilínea sólo toma las declaraciones en columna 0, que son las globales —
  // los `const` de adentro de funciones van indentados y no se tocan.
  const codigo = bloques[1].replace(/^(const|let) /gm, "var ");
  vm.runInContext(codigo, ctx, { filename: "index.html<script>" });
  return ctx;
}

const app = cargarApp();

// ── Mini framework de aserciones ─────────────────────────────
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

// ── Siembra del estado global ────────────────────────────────
// Un jugador que cobra por partido, con el partido pendiente y dos premios pendientes
// (uno del partido, otro suelto); y un jugador mensual con sueldo y un descuento.
function sembrar() {
  app.partidos = [
    { id: "p1", fecha: "2026-06-08", rival: "Colon",  numeroFecha: "Fecha 3", condicion: "LOCAL" },
    { id: "p2", fecha: "2026-06-15", rival: "Union",  numeroFecha: "Fecha 4", condicion: "VISITANTE" }
  ];
  app.pjPartidosSel = ["p1"];
  app.configJugadores = [
    { idJugador: "j1", nombre: "PEREZ", frecuencia: "partido", alias: "ali.as", premios: [] },
    { idJugador: "j2", nombre: "GOMEZ", frecuencia: "mensual", alias: "go.mez", premios: [] }
  ];
  app.pagosJugadores = [
    { id: "f-part",  jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: ["p1"], montoFinal: 50000,
      estado: "pendiente", etiqueta: "",       mes: "2026-06", tipo: "partido",   partidoId: "p1" },
    { id: "f-prem1", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [],     montoFinal: 10000,
      estado: "pendiente", etiqueta: "Gol",    mes: "2026-06", tipo: "premio",    partidoId: "p1" },
    { id: "f-prem2", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [],     montoFinal: 4000,
      estado: "pendiente", etiqueta: "Valla",  mes: "2026-06", tipo: "premio",    partidoId: ""   },
    { id: "f-part2", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: ["p2"], montoFinal: 50000,
      estado: "pendiente", etiqueta: "",       mes: "2026-06", tipo: "partido",   partidoId: "p2" },
    { id: "f-sueldo",jugadorId: "j2", jugadorNombre: "GOMEZ", partidosIncluidos: [],     montoFinal: 80000,
      estado: "pendiente", etiqueta: "Junio",  mes: "2026-06", tipo: "periodico", partidoId: ""   },
    { id: "f-desc",  jugadorId: "j2", jugadorNombre: "GOMEZ", partidosIncluidos: [],     montoFinal: -8000,
      estado: "pendiente", etiqueta: "Multa",  mes: "2026-06", tipo: "descuento", partidoId: ""   }
  ];
}

// ══════════════════════════════════════════════════════════════
seccion("1 · El premio NO se arrastra al tildar al jugador");
sembrar();

// Es el bug reportado: se tilda al jugador para pagarle el partido y el premio se cobraba solo.
let ids = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }]);
igual("tildar al jugador trae sólo el partido seleccionado", ids, ["f-part"]);
check("NO arrastra el premio del partido", ids.indexOf("f-prem1") < 0, ids.join(","));
check("NO arrastra el premio suelto",      ids.indexOf("f-prem2") < 0, ids.join(","));
check("NO trae el partido no seleccionado (p2)", ids.indexOf("f-part2") < 0, ids.join(","));

seccion("2 · El premio entra sólo si se lo tilda");
sembrar();
ids = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1"] }]);
igual("partido + el premio tildado", ids.sort(), ["f-part", "f-prem1"]);

ids = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1", "f-prem2"] }]);
igual("partido + los dos premios", ids.sort(), ["f-part", "f-prem1", "f-prem2"]);

seccion("3 · Un jugador con premios pero sin partido pendiente");
sembrar();
// El checkbox principal está deshabilitado (no hay base), pero el premio se tiene que poder cobrar:
// es el caso de M — ya le transfirió el partido y después se acordó del premio.
app.pagosJugadores.find(p => p.id === "f-part").estado  = "pagado";
app.pagosJugadores.find(p => p.id === "f-part2").estado = "pagado";
ids = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: false, premiosIds: ["f-prem1"] }]);
igual("cobra el premio solo, sin el checkbox principal", ids, ["f-prem1"]);

ids = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }]);
igual("y un partido ya pagado no se vuelve a cobrar", ids, []);

seccion("4 · Mensual: el sueldo arrastra su descuento, no los premios");
sembrar();
ids = app.pjIdsDeSeleccion([{ jugadorId: "j2", incluido: true, premiosIds: [] }]);
igual("sueldo y descuento van juntos", ids.sort(), ["f-desc", "f-sueldo"]);
igual("el neto del mes ya viene descontado", app.pjAcumuladoPendiente("j2"), 72000);

seccion("5 · Clasificación de filas viejas (sin columna Tipo)");
sembrar();
app.pagosJugadores.forEach(p => { p.tipo = ""; });   // como estaban antes del backfill
igual("[] + jugador por partido → premio",  app.pjTipoFila(app.pagosJugadores[1]), "premio");
igual("[] + jugador mensual → periodico",   app.pjTipoFila(app.pagosJugadores[4]), "periodico");
igual("con partidosIncluidos → partido",    app.pjTipoFila(app.pagosJugadores[0]), "partido");
ids = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }]);
igual("y el premio viejo tampoco se arrastra", ids, ["f-part"]);

seccion("6 · Neto negativo y avisos");
sembrar();
app.pagosJugadores.find(p => p.id === "f-desc").montoFinal = -95000; // descuento > sueldo
const neg = app.pjJugadorConNetoNegativo(["f-sueldo", "f-desc"]);
check("detecta el jugador con neto negativo", !!neg, JSON.stringify(neg));
igual("con su nombre y el neto", neg && [neg.nombre, neg.neto], ["GOMEZ", -15000]);
igual("un lote sano no dispara el aviso", app.pjJugadorConNetoNegativo(["f-part"]), null);

seccion("7 · Medio de pago por cuenta");
igual("EFECTIVO → EFECTIVO",     app.medioPagoPorCuenta("EFECTIVO"), "EFECTIVO");
igual("MACRO → TRANSFERENCIA",   app.medioPagoPorCuenta("MACRO"),    "TRANSFERENCIA");
igual("MP → TRANSFERENCIA",      app.medioPagoPorCuenta("MP"),       "TRANSFERENCIA");

seccion("8 · Formato con signo");
igual("un descuento se muestra negativo", app.fmtSigned(-8000), "−$8.000");
igual("un cobro no lleva signo",          app.fmtSigned(8000),  "$8.000");
igual("cero es cero",                     app.fmtSigned(0),     "$0");

console.log("\n" + "═".repeat(64));
console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
process.exitCode = _fail === 0 ? 0 : 1;
