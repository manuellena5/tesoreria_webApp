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
igual("el neto del mes ya viene descontado",
      app.pjFilasAcumuladoPendiente("j2").reduce((s,p) => s + p.montoFinal, 0), 72000);

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

// ══════════════════════════════════════════════════════════════
// JSON para el generador de placas (armarPlacaJson)
// ══════════════════════════════════════════════════════════════

/** Movimiento mínimo para Resumen > Por Partido: lo que leen calcPartidoResumenRows y sumarMontoAPartido. */
function mov(codRubro, tipo, monto, extra) {
  const rub = app.RUBROS.find(r => r.cod === codRubro) || { nombre: "", cat: "" };
  return Object.assign({
    id: "m" + Math.random().toString(36).slice(2, 8), fecha: "2026-08-03",
    codRubro, rubro: rub.nombre, categoria: rub.cat, concepto: "", tipo,
    ingreso: tipo === "INGRESO" ? monto : 0,
    egreso:  tipo === "EGRESO"  ? monto : 0,
    partidoId: "p1", itemsDetalle: []
  }, extra || {});
}

/** El renglón de la placa con ese concepto, buscando en todos los bloques. */
function item(json, c) {
  for (const b of json.bloques) { const it = b.items.find(x => x.c === c); if (it) return it; }
  return null;
}
function sumaItems(bloque) { return bloque.items.reduce((s, it) => s + it.m, 0); }

function sembrarPartido() {
  app.partidos = [
    { id: "p1", fecha: "2026-08-03", rival: "Colón", numeroFecha: "22", condicion: "LOCAL", torneo: "Clausura" },
    { id: "p2", fecha: "2026-08-10", rival: "Unión", numeroFecha: "23", condicion: "LOCAL", torneo: "Clausura" }
  ];
  app.movimientos = [
    mov("2",   "INGRESO", 1198300),                                   // buffet
    mov("2",   "EGRESO",   817840),
    mov("1",   "INGRESO",  900000),                                   // entradas
    mov("4",   "INGRESO",  345000),                                   // tribuna
    mov("3",   "INGRESO",   82000),                                   // venta número → otros ingresos
    mov("14a", "INGRESO",   25000),                                   // GOPASS → otros ingresos
    mov("13",  "EGRESO",   635436),                                   // policía
    mov("12",  "EGRESO",   790000),                                   // árbitros
    mov("36",  "EGRESO",    85000, { concepto: "Enfermera de la fecha" }),
    mov("36",  "EGRESO",    40000, { concepto: "AMBULANCIA del partido" }),
    mov("14b", "EGRESO",   100000),                                   // filmación
    mov("31",  "EGRESO",    63000),                                   // limpieza → otros gastos
    mov("19",  "EGRESO",   500000),                                   // sueldo jugadores: excluido por categoría
    mov("15",  "EGRESO",    30000),                                   // movilidad: excluida por categoría
    mov("49",  "INTERNO",  200000),                                   // transferencia: no es INGRESO/EGRESO
  ];
}

seccion("9 · Placa: mapeo de rubros a renglones del flyer");
sembrarPartido();
let fila  = app.calcPartidoResumenRows().find(r => r.p.id === "p1");
let placa = app.armarPlacaJson(fila);

igual("ingresos de buffet",        item(placa, "Ingresos buffet (local + visitante)").m,  1198300);
igual("gastos de buffet en negativo", item(placa, "Gastos buffet").m,                     -817840);
igual("entradas + tribuna juntas",  item(placa, "Venta entradas y tribuna").m,             1245000);
igual("venta número queda en otros ingresos",  item(placa, "Otros ingresos (Sorteo)").m,      82000);
igual("GoPass sale como renglón propio",       item(placa, "GoPass").m,                 25000);
igual("policía",                    item(placa, "Policía").m,                             -635436);
igual("árbitros",                   item(placa, "Árbitros").m,                            -790000);
igual("el rubro 36 sin 'ambulancia' va a Enfermera", item(placa, "Enfermera").m,            -85000);
igual("y con 'AMBULANCIA' en el concepto va a Ambulancia", item(placa, "Ambulancia").m,     -40000);
igual("filmación",                  item(placa, "Filmación").m,                            -100000);
igual("limpieza cae en el catch-all de egresos", item(placa, "Otros gastos (limpieza)").m,   -63000);

seccion("10 · Placa: cuadre con la tabla Por Partido");
igual("el neto de BUFFET es el de la tabla",  sumaItems(placa.bloques[0]), fila.netoBuffet);
igual("el saldo final es el Total Neto",      app.placaSaldoFinal(placa),  fila.totalNeto);
igual("y ese Total Neto es el esperado",      fila.totalNeto,              19024);
igual("los gastos de cancha desglosados suman la columna G.Cancha",
      fila.pg.policia + fila.pg.arbitros + fila.pg.enfermera + fila.pg.ambulancia + fila.pg.filmacion,
      fila.pg.gastosCancha);
check("sueldos y movilidad quedan fuera (como en la tabla)",
      app.placaSaldoFinal(placa) === 19024, "saldo = " + app.placaSaldoFinal(placa));

seccion("11 · Placa: contrato del JSON");
const rt = JSON.parse(JSON.stringify(placa));   // parsea y sobrevive el round-trip
igual("fecha es el número de fecha, como texto", rt.fecha, "22");
check("y es string, no número", typeof rt.fecha === "string", typeof rt.fecha);
igual("sub trae rival y fecha del partido", rt.sub, "vs. Colón · 03/08/2026");
igual("título", rt.titulo, "RECAUDACIÓN");
igual("etiqueta del saldo", rt.final, "SALDO FINAL");
igual("pie", rt.pie, "@depmitrefutbolmayor · Fútbol Mayor");
igual("asistencia vacía (la app no tiene el dato)", rt.asistencia, []);
igual("neto es la etiqueta del bloque, no un número", [rt.bloques[0].neto, rt.bloques[1].neto],
      ["NETO BUFFET", "NETO CANCHA"]);

const todosLosItems = rt.bloques.reduce((a, b) => a.concat(b.items), []);
check("ningún monto es string",
      todosLosItems.every(it => typeof it.m === "number"),
      todosLosItems.filter(it => typeof it.m !== "number").map(it => it.c).join(","));
check("ningún monto tiene decimales",
      todosLosItems.every(it => Number.isInteger(it.m)),
      todosLosItems.filter(it => !Number.isInteger(it.m)).map(it => it.c + "=" + it.m).join(","));
check("neg coincide con el signo en todos los renglones cargados",
      todosLosItems.every(it => it.m === 0 || (it.m < 0) === it.neg),
      todosLosItems.filter(it => it.m !== 0 && (it.m < 0) !== it.neg).map(it => it.c).join(","));
igual("policía y árbitros comparten grupo",
      [item(rt, "Policía").g, item(rt, "Árbitros").g], ["Policía y árbitros", "Policía y árbitros"]);
igual("enfermera, filmación y ambulancia comparten grupo",
      [item(rt, "Enfermera").g, item(rt, "Filmación").g, item(rt, "Ambulancia").g],
      ["Enfermera, filmación y ambulancia", "Enfermera, filmación y ambulancia", "Enfermera, filmación y ambulancia"]);
igual("los renglones sueltos van sin grupo",
      [item(rt, "Ingresos buffet (local + visitante)").g, item(rt, "Otros gastos (limpieza)").g], ["", ""]);
check("no se emite el saldo final (lo calcula el generador)",
      !("saldo" in rt) && !("total" in rt), Object.keys(rt).join(","));

seccion("12 · Placa: renglones en 0 y partido sin datos");
sembrarPartido();
app.movimientos = app.movimientos.filter(m => m.codRubro !== "36");
placa = app.armarPlacaJson(app.calcPartidoResumenRows().find(r => r.p.id === "p1"));
igual("sin movimientos de rubro 36, Enfermera va en 0", item(placa, "Enfermera").m, 0);
check("pero el renglón se manda igual, con neg:true", item(placa, "Enfermera").neg === true);
igual("un partido sin movimientos no da datos", app.placaDatosDePartido("p2"), null);

seccion("13 · Placa: pago repartido entre dos partidos (itemsDetalle)");
sembrarPartido();
// Un solo pago de árbitros que cubrió las dos fechas: la placa tiene que imputar lo mismo que la tabla.
app.movimientos = [
  mov("12", "EGRESO", 100000, { partidoId: "", itemsDetalle: [
    { desc: "Fecha 22", monto: 60000, partidoId: "p1" },
    { desc: "Fecha 23", monto: 40000, partidoId: "p2" }
  ]})
];
const filas2 = app.calcPartidoResumenRows();
const pl1 = app.armarPlacaJson(filas2.find(r => r.p.id === "p1"));
const pl2 = app.armarPlacaJson(filas2.find(r => r.p.id === "p2"));
igual("a p1 le toca su parte",  item(pl1, "Árbitros").m, -60000);
igual("a p2 la suya",           item(pl2, "Árbitros").m, -40000);
igual("y cada placa cuadra con su fila", [app.placaSaldoFinal(pl1), app.placaSaldoFinal(pl2)],
      [filas2.find(r => r.p.id === "p1").totalNeto, filas2.find(r => r.p.id === "p2").totalNeto]);

seccion("13a · Por Partido: detalle desplegable de movimientos");
sembrarPartido();
fila = app.calcPartidoResumenRows().find(r => r.p.id === "p1");
igual("el detalle trae los 12 movimientos que la tabla computa", fila.pg.movs.length, 12);
igual("y aparte los 3 que no computa (sueldo, movilidad, interno)", fila.noComputados.length, 3);
igual("los no computados son los esperados",
      fila.noComputados.map(m => m.codRubro).sort(), ["15", "19", "49"]);
check("ningún no computado se coló en las columnas",
      fila.pg.movs.every(m => !["15","19","49"].includes(m.codRubro)),
      fila.pg.movs.map(m => m.codRubro).join(","));
igual("la suma del detalle es exactamente el Total Neto de la fila",
      fila.pg.movs.reduce((s, m) => s + m.montoAplicado, 0), fila.totalNeto);
check("los ingresos van en positivo y los egresos en negativo",
      fila.pg.movs.every(m => m.tipo === "INGRESO" ? m.montoAplicado > 0 : m.montoAplicado < 0));
igual("un egreso no computado conserva su signo",
      app.montoMovNoComputado(fila.noComputados.find(m => m.codRubro === "19")), -500000);
check("el detalle se arma sin romperse", typeof app.renderPartidoResDetalle(fila) === "string");

// Pago repartido: el detalle de cada partido muestra su parte, marcada como tal.
sembrarPartido();
app.movimientos = [
  mov("12", "EGRESO", 100000, { partidoId: "", itemsDetalle: [
    { desc: "Fecha 22", monto: 60000, partidoId: "p1" },
    { desc: "Fecha 23", monto: 40000, partidoId: "p2" }
  ]})
];
const fp1 = app.calcPartidoResumenRows().find(r => r.p.id === "p1");
igual("el detalle muestra la parte imputada, no el total del movimiento",
      fp1.pg.movs[0].montoAplicado, -60000);
check("y queda marcada como repartida", fp1.pg.movs[0].repartido === true);

seccion("13b · Placa: edición de los campos en el modal");
sembrarPartido();
// El modal deja el JSON en placaEdit y lo va editando; refrescarPlacaJson toca el DOM pero
// está todo guardado con `if (el)`, así que la lógica se puede ejercitar sin navegador.
app.placaEdit = app.placaDatosDePartido("p1");
app.setPlacaMonto(0, 0, "1500000");
igual("editar un ingreso lo deja positivo", item(app.placaEdit.json, "Ingresos buffet (local + visitante)").m, 1500000);
app.setPlacaMonto(0, 1, "900000");
igual("editar un egreso lo deja negativo", item(app.placaEdit.json, "Gastos buffet").m, -900000);
// Ojo con los índices: CANCHA es [entradas, GoPass, otros ingresos, Policía, Árbitros, …].
app.setPlacaMonto(1, 3, "1234.67");
igual("los decimales se redondean al peso", item(app.placaEdit.json, "Policía").m, -1235);
app.setPlacaMonto(1, 3, "-500");
igual("un valor negativo tipeado no invierte el signo del renglón", item(app.placaEdit.json, "Policía").m, -500);
app.setPlacaMonto(1, 4, "");
igual("vaciar el campo deja el renglón en 0", item(app.placaEdit.json, "Árbitros").m, 0);
check("y el renglón en 0 conserva neg:true", item(app.placaEdit.json, "Árbitros").neg === true);
app.setPlacaCampo("fecha", "23");
app.setPlacaCampo("sub", "vs. Unión · 10/08/2026");
igual("los campos de cabecera se editan", [app.placaEdit.json.fecha, app.placaEdit.json.sub],
      ["23", "vs. Unión · 10/08/2026"]);
const editado = JSON.parse(JSON.stringify(app.placaEdit.json));
check("tras editar, ningún monto quedó como string",
      editado.bloques.reduce((a,b)=>a.concat(b.items),[]).every(it => typeof it.m === "number"));
igual("y el saldo refleja lo editado", app.placaSaldoFinal(editado),
      1500000 - 900000 + 1245000 + 25000 + 82000 - 500 - 0 - 85000 - 100000 - 40000 - 63000);

seccion("9a · Granos: los kilos no son plata");
igual("fmtKg no pone el signo peso",   app.fmtKg(5010),    "5.010");
igual("separa los miles igual que fmt",app.fmtKg(1234567), "1.234.567");
igual("admite kg con decimales",       app.fmtKg(5010.5),  "5.010,5");
igual("cero es cero",                  app.fmtKg(0),       "0");
igual("y un valor vacío no rompe",     app.fmtKg(undefined), "0");
check("fmt sí lleva el $ (no se tocó)", app.fmt(5010) === "$5.010");

// La descripción del movimiento que genera una venta: cereal, kilos, monto y precio por tonelada.
// El precio sale de los dos números tipeados, así que la línea siempre multiplica bien.
const kgV = 5010, montoV = 1500000;
const conceptoV = `Venta Trigo - ${app.fmtKg(kgV)} kg - ${app.fmt(montoV)} - (precio ${app.fmt(montoV/(kgV/1000))})`;
igual("la descripción tiene el formato pedido", conceptoV,
      "Venta Trigo - 5.010 kg - $1.500.000 - (precio $299.401)");
check("y ya no muestra los kg como pesos", conceptoV.indexOf("$5.010") < 0, conceptoV);
check("el precio por tonelada reconstruye el monto",
      Math.abs((kgV/1000) * (montoV/(kgV/1000)) - montoV) < 0.01);

seccion("9b · Mes de Pagos Jugadores deformado por Sheets");
igual("un Date en texto vuelve a YYYY-MM",
      app.normMesPJ("Sat Aug 01 2026 00:00:00 GMT-0300 (Argentina Standard Time)"), "2026-08");
igual("un mes sano se deja intacto",     app.normMesPJ("2026-08"), "2026-08");
igual("el formato de movimientos también",app.normMesPJ("202608"), "2026-08");
igual("vacío sigue vacío",               app.normMesPJ(""), "");
igual("y una basura no explota",         app.normMesPJ("cualquier cosa"), "");
check("normalizar es idempotente", app.normMesPJ(app.normMesPJ("Sat Aug 01 2026 00:00:00 GMT-0300")) === "2026-08");

// El bug tal como se veía: el descuento traído del servidor no matcheaba el mes seleccionado,
// así que pjFilasMes lo dejaba afuera y desaparecía de la pestaña Mensual.
app.configJugadores = [{ idJugador: "j1", nombre: "GOMEZ", frecuencia: "mensual", premios: [] }];
const crudos = [
  { id:"s1", jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos:[], montoFinal:80000,
    estado:"pendiente", etiqueta:"Agosto", mes:"Sat Aug 01 2026 00:00:00 GMT-0300", tipo:"periodico" },
  { id:"d1", jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos:[], montoFinal:-40000,
    estado:"pendiente", etiqueta:"Adelanto", mes:"Sat Aug 01 2026 00:00:00 GMT-0300", tipo:"descuento" },
];
app.pagosJugadores = crudos;
igual("sin normalizar, la pestaña Mensual no ve nada", app.pjFilasMes("j1", "2026-08").length, 0);
app.pagosJugadores = app.normPagosJugadores(crudos);
igual("normalizado, aparecen el sueldo y el descuento", app.pjFilasMes("j1", "2026-08").length, 2);
igual("y el neto del mes ya viene descontado",
      app.pjFilasMes("j1", "2026-08").reduce((s,p) => s + p.montoFinal, 0), 40000);
check("Transferencias los veía igual (no filtra por mes) — por eso ahí no se notaba",
      app.pjFilasAcumuladoPendiente("j1").length === 2);

// ══════════════════════════════════════════════════════════════
// Cache offline: cupo de localStorage y clasificación de errores
// ══════════════════════════════════════════════════════════════

seccion("14 · Un error de cupo no es un error de red");
const errCupo = Object.assign(new Error("Failed to execute 'setItem' on 'Storage': exceeded the quota."),
                              { name: "QuotaExceededError", code: 22 });
check("QuotaExceededError NO se toma por caída de red", app.isNetworkError(errCupo) === false);
check("pero un fetch caído sí", app.isNetworkError(new TypeError("Failed to fetch")) === true);
check("y un NetworkError también", app.isNetworkError(new Error("NetworkError when attempting to fetch")) === true);

seccion("15 · Con el cupo lleno se liberan las copias diarias más viejas");
/** localStorage de mentira con cupo, para forzar el QuotaExceededError. */
function localStorageConCupo(bytes) {
  const m = new Map();
  const usado = () => [...m.entries()].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    removeItem: k => { m.delete(k); },
    setItem: (k, v) => {
      const previo = m.has(k) ? k.length + m.get(k).length : 0;
      if (usado() - previo + k.length + v.length > bytes) {
        const e = new Error("Failed to execute 'setItem' on 'Storage': exceeded the quota.");
        e.name = "QuotaExceededError"; e.code = 22;
        throw e;
      }
      m.set(k, v);
    },
    _claves: () => [...m.keys()]
  };
}

app.viendoSnapshotHistorico = null;
app.movimientos = []; app.jugadores = []; app.grupos = []; app.adherentes = []; app.pagos = [];
app.partidos = []; app.reservas = []; app.eventos = []; app.configJugadores = [];
app.rosterPartidos = []; app.pagosJugadores = [];
const relleno = "x".repeat(300);
app.localStorage = localStorageConCupo(1200);
// Tres copias diarias viejas que ya ocupan casi todo el cupo: el snapshot vivo no entra
// hasta que se libere al menos una.
["2026-08-01", "2026-08-02", "2026-08-03"].forEach(f =>
  app.localStorage.setItem("clubfm_offline_snapshot_" + f, relleno + f));
app.observacionLarga = relleno;
app.movimientos = [{ id: "m1", concepto: relleno }];   // hace que el snapshot vivo no entre solo

app.saveSnapshotToCache();

const claves = app.localStorage._claves();
check("el snapshot en vivo quedó guardado", claves.includes("clubfm_offline_snapshot"), claves.join(","));
check("se liberó la copia diaria más vieja", !claves.includes("clubfm_offline_snapshot_2026-08-01"), claves.join(","));
igual("y el snapshot guardado es el estado actual",
      JSON.parse(app.localStorage.getItem("clubfm_offline_snapshot")).movimientos.length, 1);

seccion("16 · dropOldestDailySnapshot respeta el orden cronológico");
app.localStorage = localStorageConCupo(100000);
["2026-08-05", "2026-08-02", "2026-08-09"].forEach(f =>
  app.localStorage.setItem("clubfm_offline_snapshot_" + f, "x"));
check("borra la más vieja primero", app.dropOldestDailySnapshot() === true);
check("y era la del 02", !app.localStorage._claves().includes("clubfm_offline_snapshot_2026-08-02"),
      app.localStorage._claves().join(","));
app.localStorage = localStorageConCupo(100000);
check("sin copias diarias devuelve false", app.dropOldestDailySnapshot() === false);

// ══════════════════════════════════════════════════════════════
// El ajuste de "Por partido" vive en una columna de la fila, no en una fila propia como los
// premios. pjItemsDeFila lo separa para que el comprobante muestre el partido y el descuento
// como dos renglones. Tiene que dar lo MISMO que el armado de ItemsDetalle del backend
// (ver la sección 6 de spec/premios.js).
seccion("17 · pjItemsDeFila desglosa el ajuste del pago de partido");

// Filas propias: el sembrar() compartido no tiene montoBase/ajuste y las secciones 1-6 dependen de él.
function filaPartido(extra) {
  return Object.assign({
    id: "f-aj", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: ["p1"],
    montoBase: 10000, ajuste: -2000, motivoAjuste: "Adelanto", montoFinal: 8000,
    estado: "pendiente", etiqueta: "", mes: "2026-06", tipo: "partido", partidoId: "p1"
  }, extra || {});
}

sembrar(); // deja app.partidos con p1 = "Fecha 3 vs Colon"
igual("con ajuste devuelve dos ítems",
      app.pjItemsDeFila(filaPartido()),
      [{ desc: "Fecha 3 vs Colon", monto: 10000 }, { desc: "Adelanto - Colon", monto: -2000 }]);
igual("la descripción del partido NO lleva el motivo pegado",
      app.pjItemsDeFila(filaPartido())[0].desc, "Fecha 3 vs Colon");
igual("la suma de los ítems es el montoFinal",
      app.pjItemsDeFila(filaPartido()).reduce((s,it) => s + it.monto, 0), 8000);

igual("motivo vacío → \"Ajuste\"",
      app.pjItemsDeFila(filaPartido({ motivoAjuste: "" }))[1].desc, "Ajuste - Colon");
igual("motivo en blanco también → \"Ajuste\"",
      app.pjItemsDeFila(filaPartido({ motivoAjuste: "   " }))[1].desc, "Ajuste - Colon");

igual("ajuste positivo sale positivo",
      app.pjItemsDeFila(filaPartido({ ajuste: 1500, montoFinal: 11500, motivoAjuste: "Plus" })),
      [{ desc: "Fecha 3 vs Colon", monto: 10000 }, { desc: "Plus - Colon", monto: 1500 }]);

igual("sin ajuste: un solo ítem por el total",
      app.pjItemsDeFila(filaPartido({ ajuste: 0, montoFinal: 10000, motivoAjuste: "" })),
      [{ desc: "Fecha 3 vs Colon", monto: 10000 }]);
igual("motivo sin ajuste: un ítem con el motivo pegado, como salía antes",
      app.pjItemsDeFila(filaPartido({ ajuste: 0, montoFinal: 10000, motivoAjuste: "Viático" })),
      [{ desc: "Fecha 3 vs Colon — Viático", monto: 10000 }]);
igual("montoBase en 0: no hay nada que desglosar",
      app.pjItemsDeFila(filaPartido({ montoBase: 0, ajuste: 8000, motivoAjuste: "Suelto" })),
      [{ desc: "Fecha 3 vs Colon — Suelto", monto: 8000 }]);

// Guarda contra filas viejas: si montoBase + ajuste no da montoFinal, se emite el ítem único
// con montoFinal para que el comprobante no difiera del egreso real.
igual("fila inconsistente: un solo ítem por el montoFinal guardado",
      app.pjItemsDeFila(filaPartido({ montoFinal: 7777 })),
      [{ desc: "Fecha 3 vs Colon — Adelanto", monto: 7777 }]);

igual("partido que ya no existe: descripción genérica",
      app.pjItemsDeFila(filaPartido({ partidosIncluidos: ["borrado"], partidoId: "borrado" }))[0].desc,
      "Pago partido");

// Las filas que no son de partido no se tocan: ya generan su propio ítem.
igual("un premio sigue dando un ítem con su etiqueta",
      app.pjItemsDeFila({ jugadorId:"j1", partidosIncluidos: [], montoBase: 3000, ajuste: 0,
                          motivoAjuste: "", montoFinal: 3000, etiqueta: "Gol", tipo: "premio", partidoId: "p1" }),
      [{ desc: "Gol - Colon", monto: 3000 }]);
igual("premio x2 con el partido",
      app.pjItemsDeFila({ id: "x2", jugadorId: "j1", partidosIncluidos: [], montoBase: 0, ajuste: 0,
                          motivoAjuste: "", montoFinal: 6000, etiqueta: "Gol x2", tipo: "premio", partidoId: "p1" }),
      [{ desc: "Gol x2 - Colon", monto: 6000 }]);
igual("si la etiqueta ya nombra al rival no se repite", app.pjDescConPartido("Gol a Colón", "p1"), "Gol a Colón");
igual("premio sin partido queda como está", app.pjDescConPartido("Valla invicta", ""), "Valla invicta");
igual("un descuento del mes sigue dando un ítem negativo",
      app.pjItemsDeFila({ jugadorId:"j2", partidosIncluidos: [], montoBase: -8000, ajuste: 0,
                          motivoAjuste: "", montoFinal: -8000, etiqueta: "Multa", tipo: "descuento", partidoId: "" }),
      [{ desc: "Multa", monto: -8000 }]);

// ══════════════════════════════════════════════════════════════
// Los premios ya cobrados siguen a la vista en la tabla (con ✓) para poder consultarlos después
// de pagar. Su checkbox está deshabilitado, pero la regla no puede depender de eso: si un id de
// premio pagado llega igual, mandarlo generaría un segundo egreso por el mismo premio.
seccion("18 · Un premio ya cobrado no vuelve a entrar en un pago");
sembrar();
app.pagosJugadores.find(p => p.id === "f-prem1").estado = "pagado";
app.pagosJugadores.find(p => p.id === "f-prem1").movimientoId = "mov-viejo";

igual("el premio pagado se descarta aunque venga tildado",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: false, premiosIds: ["f-prem1"] }]), []);
igual("y no contamina un lote con premios pendientes",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: false, premiosIds: ["f-prem1", "f-prem2"] }]),
      ["f-prem2"]);
igual("el partido pendiente sigue entrando igual",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1"] }]), ["f-part"]);

igual("pjPremiosPendientes ya no lo lista", app.pjPremiosPendientes("j1").map(p => p.id), ["f-prem2"]);
// La vista sí lo muestra: es un premio del partido tildado (p1).
igual("pero la tabla lo sigue mostrando, para poder consultarlo",
      app.pjPremiosDeVista("j1").map(p => p.id), ["f-prem1", "f-prem2"]);
app.pjPartidosSel = ["p2"];
igual("acotado a los partidos tildados: con otro partido elegido, el cobrado no aparece",
      app.pjPremiosDeVista("j1").map(p => p.id), ["f-prem2"]);

// ══════════════════════════════════════════════════════════════
// El celular se guarda tal cual lo escribe el usuario, así que la normalización tiene que
// aguantar los cuatro formatos con los que se anota un número acá: con y sin 0 de larga
// distancia, con y sin el 15 viejo de celular, y ya en formato internacional.
seccion("19 · Normalización del celular para wa.me");
igual("sin prefijos: se le agrega 54 y 9", app.waNormalizarCelular("3492 123456"), "5493492123456");
igual("con 0 de larga distancia y 15 de celular", app.waNormalizarCelular("03492 15 123456"), "5493492123456");
igual("ya internacional con separadores", app.waNormalizarCelular("+54 9 3492 123456"), "5493492123456");
igual("ya normalizado: no lo toca", app.waNormalizarCelular("5493492123456"), "5493492123456");
igual("área de 2 dígitos (11) con 15", app.waNormalizarCelular("011 15 4444 5555"), "5491144445555");
igual("vacío da vacío", app.waNormalizarCelular(""), "");
igual("null da vacío", app.waNormalizarCelular(null), "");

check("los cuatro formatos de la tabla son válidos",
      ["3492 123456", "03492 15 123456", "+54 9 3492 123456", "5493492123456"].every(app.waCelularValido));
check("un número corto no es válido",  !app.waCelularValido("123"));
check("un número larguísimo tampoco",  !app.waCelularValido("54 9 3492 123456 7890"));
check("vacío no es válido",            !app.waCelularValido(""));

sembrar();
app.configJugadores[0].celular = "3492 123456";
igual("waCelularDeJugador devuelve lo guardado, sin normalizar",
      app.waCelularDeJugador("j1"), "3492 123456");
igual("un jugador sin celular cargado da vacío", app.waCelularDeJugador("j2"), "");
igual("un jugador sin config tampoco explota",   app.waCelularDeJugador("nadie"), "");

// ══════════════════════════════════════════════════════════════
// El rubro de contrapartida se elige de RUBROS y se muestra en la pantalla Mensual y en el modal
// de liquidación. Un código que ya no esté en el catálogo tiene que seguir viéndose.
seccion("20 · Rubro de contrapartida de un descuento");
igual("resuelve el nombre del catálogo", app.pjRubroContraLabel("35"), "INDUMENTARIA Y MERCH.");
igual("otro del catálogo",               app.pjRubroContraLabel("10"), "LIGA - FICHAJES Y MULTAS");
igual("un código desconocido se muestra igual", app.pjRubroContraLabel("999"), "999");
igual("sin código, cadena vacía",        app.pjRubroContraLabel(""), "");

const opts = app.opcionesRubroContraHTML("35");
check("el selector ofrece INDUMENTARIA Y MERCH.", opts.includes('value="35"'), opts.slice(0, 200));
check("y deja seleccionado el que se le pasa",    opts.includes('value="35" selected'), opts.slice(0, 200));
check("agrupa por categoría",                     opts.includes('<optgroup label="Indumentaria y Equipamiento">'));
check("no ofrece los rubros legacy",             !opts.includes('value="16"'));

// El pago del sueldo en sí (18 y 19) no puede ser contrapartida: un INGRESO ahí no existe. Es el
// error que ya se cargó en la hoja (un adelanto imputado al 19).
check("NO ofrece SUELDO JUGADORES",              !opts.includes('value="19"'), opts.slice(0, 200));
check("NO ofrece SUELDO DT Y CT",                !opts.includes('value="18"'), opts.slice(0, 200));

// PERO el resto de "Jugadores y Cuerpo Técnico" sí: el club paga botines, vianda o alquiler y
// después recupera parte descontándola del sueldo — ese recupero es un INGRESO real en ese rubro.
// Excluir la categoría entera (como se hizo en la fase 10) se llevaba puestos estos doce.
check("SÍ ofrece la categoría, sin los dos de sueldo",
      opts.includes('<optgroup label="Jugadores y Cuerpo Técnico">'), opts.slice(0, 200));
[["53","Aporte Botines"], ["43","Vianda"], ["45","Alquiler"], ["17","SERVICIO GIMNASIO"],
 ["11","COBROS Y PAGOS PASE JUGADOR"], ["20","GASTOS ATENCION JUGADORES"], ["44","Almacén"],
 ["47","Comida"], ["48","Otros (Refuerzos/DT)"], ["51","Arreglos/Compras Casa Refuerzos"],
 ["52","Impuestos/Servicios Casa Refuerzos"]].forEach(([cod, nombre]) =>
  check("ofrece " + cod + " " + nombre, opts.includes('value="' + cod + '"'), "falta el " + cod));
// El 37 (GASTOS ATENCION REFUERZOS|DT) queda afuera por legacy, no por esta regla: está sólo para
// leer datos viejos, igual que en el selector de rubro del form de movimientos.
check("el 37 sigue afuera por legacy",           !opts.includes('value="37"'), opts.slice(0, 200));

// Una fila vieja que YA tiene un 18/19 guardado lo sigue mostrando: si se ocultara, abrir el
// descuento lo pisaría en silencio y el error quedaría sin verse. Es el caso de la corrección de
// datos de la fase 10, punto 0.
const opts19 = app.opcionesRubroContraHTML("19");
check("un 19 ya guardado se sigue viendo",        opts19.includes('value="19" selected'), opts19.slice(0, 300));
check("y sigue sin ofrecer el 18 al lado",       !opts19.includes('value="18"'), opts19.slice(0, 300));
check("sin dejar de ofrecer el resto",            opts19.includes('value="53"'), opts19.slice(0, 300));

// El selector de "Rubro del sueldo" de la ficha del jugador NO cambia: ahí ofrecer la categoría
// entera es a propósito, y por eso CFGJ_RUBRO_SUELDO_CAT sigue existiendo.
const optsFicha = app.opcionesRubroSueldoHTML("19");
check("la ficha sigue ofreciendo el 19",          optsFicha.includes('value="19"'), optsFicha.slice(0, 200));
check("y el 18",                                  optsFicha.includes('value="18"'), optsFicha.slice(0, 200));
check("y el resto de la categoría",               optsFicha.includes('value="53"'), optsFicha.slice(0, 200));

// ══════════════════════════════════════════════════════════════
// Invariante 1: el comprobante emitido ANTES de liquidar dice exactamente lo mismo que el que
// sale después. Con un descuento con contrapartida hay dos caminos distintos para llegar al mismo
// papel —las filas de Pagos Jugadores por un lado, el movimiento ya grabado más sus INGRESO
// vinculados por el otro— y tienen que dar los mismos ítems, en el mismo orden.
seccion("21 · Los dos caminos del comprobante dan los mismos ítems");
sembrar();
// GOMEZ: sueldo 100 y una camiseta de 20 imputada a INDUMENTARIA Y MERCH.
app.pagosJugadores = [
  { id: "s1", jugadorId: "j2", jugadorNombre: "GOMEZ", partidosIncluidos: [], montoBase: 100,
    ajuste: 0, motivoAjuste: "", montoFinal: 100, estado: "pendiente", etiqueta: "Junio",
    mes: "2026-06", tipo: "periodico", partidoId: "", codRubroContra: "" },
  { id: "d1", jugadorId: "j2", jugadorNombre: "GOMEZ", partidosIncluidos: [], montoBase: -20,
    ajuste: 0, motivoAjuste: "", montoFinal: -20, estado: "pendiente", etiqueta: "Camiseta",
    mes: "2026-06", tipo: "descuento", partidoId: "", codRubroContra: "35" }
];
const filasPrevio = app.pagosJugadores.slice();
const itemsPrevio = app.pjItemsDeFilas(filasPrevio);
igual("antes de liquidar: el sueldo bruto y la camiseta en negativo",
      itemsPrevio, [{ desc: "Junio", monto: 100 }, { desc: "Camiseta — GOMEZ", monto: -20 }]);
igual("y el total es lo que el jugador recibe",
      itemsPrevio.reduce((s,it) => s + it.monto, 0), 80);

// Lo que queda grabado después de liquidar: EGRESO por el bruto (ItemsDetalle de una sola línea,
// invariante 2) + INGRESO de 20 vinculado a él.
app.movimientos = [
  { id: "mov-egr", tipo: "EGRESO", fecha: "2026-06-20", mes: "202606", codRubro: "19",
    rubro: "SUELDO JUGADORES", concepto: "Pago jugador GOMEZ — Junio", egreso: 100, ingreso: 0,
    montoFinal: 100, cuenta: "MACRO", jugadorCT: "GOMEZ", partidoId: "", eventoId: "",
    vinculos: [], itemsDetalle: [{ desc: "Junio", monto: 100 }] },
  { id: "mov-ing", tipo: "INGRESO", fecha: "2026-06-20", mes: "202606", codRubro: "35",
    rubro: "INDUMENTARIA Y MERCH.", concepto: "Camiseta — GOMEZ", egreso: 0, ingreso: 20,
    montoFinal: 20, cuenta: "MACRO", jugadorCT: "GOMEZ", partidoId: "", eventoId: "",
    vinculos: [{ egresoId: "mov-egr", monto: 20 }], itemsDetalle: [] }
];
app.ultimoComprobante = 0;
const compPost = app.movToComprobante(app.movimientos[0]);
igual("después de liquidar: los mismos ítems, en el mismo orden", compPost.items, itemsPrevio);
igual("y el mismo total", compPost.items.reduce((s,it) => s + it.monto, 0), 80);

// Invariante 2 desde el lado del comprobante: el ItemsDetalle del egreso sigue sumando su
// MontoFinal — el descuento NO está adentro, se agrega recién al armar el papel.
igual("el ItemsDetalle del egreso sigue sumando el MontoFinal",
      app.movimientos[0].itemsDetalle.reduce((s,it) => s + it.monto, 0),
      app.movimientos[0].montoFinal);

// Un egreso sin contrapartidas no cambia en nada.
app.movimientos[1].vinculos = [{ egresoId: "otro-egreso", monto: 20 }];
igual("un vínculo que apunta a otro egreso no se cuela",
      app.movToComprobante(app.movimientos[0]).items, [{ desc: "Junio", monto: 100 }]);

// ══════════════════════════════════════════════════════════════
// El botón de WhatsApp sólo aparece si el receptor es un jugador, y sólo se habilita si el celular
// cargado da un número usable: wa.me con un número inválido no falla, abre un chat con nadie.
seccion("22 · Botón de WhatsApp del comprobante");
sembrar();
app.configJugadores[0].celular = "3492 123456";   // j1, válido
app.configJugadores[1].celular = "123";           // j2, inválido

app.compData = { jugadorId: "j1", receptor: "PEREZ", items: [] };
const btnOk = app.compBotonWhatsAppHTML();
check("con celular válido se ofrece el botón", btnOk.includes('id="btn-comp-wa"'), btnOk);
check("y queda habilitado",                   !btnOk.includes("disabled"), btnOk);

app.compData = { jugadorId: "j2", receptor: "GOMEZ", items: [] };
const btnMal = app.compBotonWhatsAppHTML();
check("con celular inválido el botón queda deshabilitado", btnMal.includes("disabled"), btnMal);
check("y el tooltip dice por qué", btnMal.includes("no es un número válido"), btnMal);

app.configJugadores[1].celular = "";
const btnSin = app.compBotonWhatsAppHTML();
check("sin celular cargado también queda deshabilitado", btnSin.includes("disabled"), btnSin);
check("con su propio motivo", btnSin.includes("no tiene celular cargado"), btnSin);

app.compData = { jugadorId: "", receptor: "LOPEZ", items: [] };
igual("un recibo de adherente no muestra el botón", app.compBotonWhatsAppHTML(), "");
app.compData = { jugadorId: "sin-config", receptor: "X", items: [] };
igual("un jugador sin config de cobro tampoco", app.compBotonWhatsAppHTML(), "");

// El armado del texto y la resolución del apodo se verifican en la sección 42; acá sólo que el
// botón y el mensaje se apoyan en el mismo jugador.
app.configJugadores[0].apodo = "Colo";
igual("el mensaje del botón saluda por el apodo de la ficha",
      app.compMensajeWhatsApp(app.compSaludoJugador("j1", "PEREZ")),
      "Hola Colo, esto te va a estar llegando hoy. Cualquier cosa avisame. Abrazo.");

// ══════════════════════════════════════════════════════════════
// El pago en lote se reemplazó por una liquidación jugador por jugador. La regla de que un premio
// no se cobra solo tiene que sobrevivir al rediseño: ahora el jugador va siempre con incluido:true
// (no hay más checkbox de jugador) y lo único opcional siguen siendo los premios.
seccion("23 · La selección de la liquidación de a uno");
sembrar();
// pjIdsDeJugador lee los checkbox del DOM, que en las pruebas no existe: se verifica la regla
// contra pjIdsDeSeleccion, que es donde vive y lo que aquella delega.
igual("liquidar un jugador por partido trae su partido, sin los premios",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }]), ["f-part"]);
igual("con el premio tildado entra también",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1"] }]).sort(),
      ["f-part", "f-prem1"]);
igual("un jugador mensual trae su sueldo y su descuento",
      app.pjIdsDeSeleccion([{ jugadorId: "j2", incluido: true, premiosIds: [] }]).sort(),
      ["f-desc", "f-sueldo"]);
igual("y sigue sin traer el partido que no está en la selección de chips",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }]).indexOf("f-part2"), -1);

// Los dos tipos de jugador producen la misma estructura de liquidación.
seccion("24 · El modal de liquidación: mensual y por partido dan lo mismo");
sembrar();
app.pagosJugadores.find(p => p.id === "f-desc").codRubroContra = "35";  // camiseta, con contrapartida

app.pjLiqData = { jugadorId: "j2", nombre: "GOMEZ",
                  ids: app.pjIdsDeSeleccion([{ jugadorId: "j2", incluido: true, premiosIds: [] }]),
                  cuenta: "MACRO", medioPago: "TRANSFERENCIA", fechaPago: "2026-06-20" };
const movsMensual = app.pjLiqMovimientosPreview();
igual("el mensual da un EGRESO por el bruto y un INGRESO por la contrapartida",
      movsMensual.map(m => [m.tipo, m.codRubro, m.monto]),
      [["EGRESO", "19", 80000], ["INGRESO", "35", 8000]]);
igual("y el neto es lo que el jugador recibe", app.pjLiqNeto(), 72000);

app.pjLiqData = { jugadorId: "j1", nombre: "PEREZ",
                  ids: app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1"] }]),
                  cuenta: "MACRO", medioPago: "TRANSFERENCIA", fechaPago: "2026-06-20" };
const movsPartido = app.pjLiqMovimientosPreview();
igual("el de partido da la misma estructura: un EGRESO en el rubro 19",
      movsPartido.map(m => [m.tipo, m.codRubro]), [["EGRESO", "19"]]);
igual("por el partido más el premio tildado", movsPartido[0].monto, 60000);
igual("y su neto coincide con el egreso, porque no tiene contrapartidas",
      app.pjLiqNeto(), movsPartido[0].monto);

// El comprobante del modal sale de las MISMAS filas que se van a registrar: es lo que impide que
// el jugador se lleve un papel que no coincide con el movimiento.
seccion("25 · El comprobante del modal sale de las filas que se registran");
app.pjLiqData = { jugadorId: "j2", nombre: "GOMEZ",
                  ids: app.pjIdsDeSeleccion([{ jugadorId: "j2", incluido: true, premiosIds: [] }]),
                  cuenta: "MACRO", medioPago: "TRANSFERENCIA", fechaPago: "2026-06-20" };
app.ultimoComprobante = 0;
const compLiq = app.pjLiqComprobanteData();
igual("los ítems son los de las filas, con la contrapartida en negativo",
      compLiq.items, [{ desc: "Junio", monto: 80000 }, { desc: "Multa — GOMEZ", monto: -8000 }]);
igual("el total del comprobante es el neto",
      compLiq.items.reduce((s,it) => s + it.monto, 0), app.pjLiqNeto());
// Los ítems se editan a mano —el comprobante es el papel, no el asiento—, pero el modal lleva
// contra qué comparar para poder avisar si el total se despega de lo que se va a registrar.
igual("informa el neto que se va a registrar", compLiq.netoEsperado, app.pjLiqNeto());
igual("y el botón de volver apunta al jugador", compLiq.volverALiquidar, "j2");
igual("la fecha del comprobante es la del pago elegido", compLiq.fecha, "20/06/2026");

// ══════════════════════════════════════════════════════════════
// El rubro del sueldo sale de la ficha (18 para el cuerpo técnico, 19 para el resto). La
// previsualización del modal tiene que dar el MISMO codRubro que termina grabando el backend: su
// propio docstring dice que si difieren es un bug. Los casos son los mismos que verifica
// spec/premios.js §12-13 contra confirmarPagosJugadores.
seccion("26 · El rubro del sueldo en la previsualización");
sembrar();
const liq = (jugadorId, override) => {
  app.pjLiqData = { jugadorId, nombre: "X",
                    ids: app.pjIdsDeSeleccion([{ jugadorId, incluido: true, premiosIds: [] }]),
                    cuenta: "MACRO", medioPago: "TRANSFERENCIA", fechaPago: "2026-06-20",
                    codRubroSueldo: override || "" };
  return app.pjLiqMovimientosPreview();
};

igual("ficha vacía → 19, como antes de este cambio",
      liq("j2")[0].codRubro, "19");
igual("con el nombre resuelto del catálogo, no escrito a mano",
      liq("j2")[0].rubro, "SUELDO JUGADORES");

app.configJugadores.find(c => c.idJugador === "j2").codRubroSueldo = "18";
igual("ficha en 18 → el egreso se previsualiza en 18", liq("j2")[0].codRubro, "18");
igual("con su nombre",                                 liq("j2")[0].rubro, "SUELDO DT Y CT");

app.configJugadores.find(c => c.idJugador === "j2").codRubroSueldo = "999";
igual("un código que no está en el catálogo cae al 19", liq("j2")[0].codRubro, "19");

app.configJugadores.find(c => c.idJugador === "j2").codRubroSueldo = "19";
igual("el override del modal pisa a la ficha", liq("j2", "18")[0].codRubro, "18");

igual("pjRubroSueldoDe: un jugador sin config da el default",
      app.pjRubroSueldoDe("nadie"), "19");

// El select de la ficha ofrece sólo la categoría de sueldos, y sale de RUBROS filtrado por
// categoría: si mañana se agrega un rubro ahí, aparece solo.
const optsSueldo = app.opcionesRubroSueldoHTML("18");
check("ofrece SUELDO DT Y CT",    optsSueldo.includes('value="18"'), optsSueldo);
check("y SUELDO JUGADORES",       optsSueldo.includes('value="19"'), optsSueldo);
check("deja seleccionado el 18",  optsSueldo.includes('value="18" selected'), optsSueldo);
check("no ofrece rubros de otras categorías (INDUMENTARIA)",
      !optsSueldo.includes('value="35"'), optsSueldo);
check("sin código válido, preselecciona el 19",
      app.opcionesRubroSueldoHTML("").includes('value="19" selected'));
// Un código válido pero de otra categoría (puesto a mano en la planilla) no se pisa en silencio.
check("un código de otra categoría se agrega a la lista en vez de ignorarse",
      app.opcionesRubroSueldoHTML("35").includes('value="35" selected'),
      app.opcionesRubroSueldoHTML("35"));

// ══════════════════════════════════════════════════════════════
// El camino de recuperación: buscar el adelanto desde el modal de descuento, para los egresos que
// se cargaron sin marcar "Descontar del sueldo". La lista sólo sirve si está bien filtrada — con
// las liquidaciones adentro ofrece el sueldo del mes pasado como si fuera un adelanto.
seccion("27 · Candidatos a movimiento de origen de un descuento");

function sembrarMovs() {
  sembrar();
  app.jugadores = [{ id: "j1", nombre: "PEREZ" }, { id: "j2", nombre: "GOMEZ" }];
  app.movimientos = [
    // Adelantos de GOMEZ, uno reciente y uno viejo.
    { id: "m-ade1", fecha: "2026-06-10", tipo: "EGRESO", codRubro: "19", concepto: "Adelanto",
      egreso: 20000, montoFinal: 20000, jugadorCT: "GOMEZ", jugadorId: "j2" },
    { id: "m-ade2", fecha: "2026-02-02", tipo: "EGRESO", codRubro: "19", concepto: "Adelanto viejo",
      egreso: 5000, montoFinal: 5000, jugadorCT: "GOMEZ", jugadorId: "j2" },
    // Movimiento viejo sin JugadorID: se reconoce por el nombre, como hace movEsDeEntidad.
    { id: "m-viejo", fecha: "2026-06-05", tipo: "EGRESO", codRubro: "19", concepto: "Adelanto sin ID",
      egreso: 3000, montoFinal: 3000, jugadorCT: "gomez", jugadorId: "" },
    // La liquidación del mes pasado: es un EGRESO suyo, pero NO es un adelanto.
    { id: "m-liq", fecha: "2026-06-01", tipo: "EGRESO", codRubro: "19", concepto: "Pago jugador GOMEZ",
      egreso: 80000, montoFinal: 80000, jugadorCT: "GOMEZ", jugadorId: "j2" },
    // De otro jugador.
    { id: "m-otro", fecha: "2026-06-11", tipo: "EGRESO", codRubro: "19", concepto: "Adelanto",
      egreso: 9000, montoFinal: 9000, jugadorCT: "PEREZ", jugadorId: "j1" },
    // Un ingreso suyo: tampoco es un adelanto.
    { id: "m-ing", fecha: "2026-06-12", tipo: "INGRESO", codRubro: "35", concepto: "Camiseta",
      ingreso: 4000, montoFinal: 4000, jugadorCT: "GOMEZ", jugadorId: "j2" }
  ];
  // La fila que quedó pagada contra la liquidación es lo que la delata como liquidación.
  app.pagosJugadores = [
    { id: "pj-liq", jugadorId: "j2", jugadorNombre: "GOMEZ", partidosIncluidos: [], montoFinal: 80000,
      estado: "pagado", etiqueta: "Mayo", mes: "2026-05", tipo: "periodico", partidoId: "",
      movimientoId: "m-liq", movimientoOrigenId: "" }
  ];
}

sembrarMovs();
let cands = app.pjMovsCandidatosDescuento("j2", 30, "2026-06-15").map(m => m.id);
igual("los adelantos del jugador, más nuevos primero", cands, ["m-ade1", "m-viejo"]);
check("no ofrece la liquidación como si fuera un adelanto", cands.indexOf("m-liq") < 0, cands.join(","));
check("ni los movimientos de otro jugador",                 cands.indexOf("m-otro") < 0, cands.join(","));
check("ni los ingresos",                                    cands.indexOf("m-ing")  < 0, cands.join(","));
check("el de 2 meses atrás queda fuera de la ventana de 30 días",
      cands.indexOf("m-ade2") < 0, cands.join(","));

cands = app.pjMovsCandidatosDescuento("j2", 0, "2026-06-15").map(m => m.id);
igual("con la ventana en 'todos' aparece el viejo", cands, ["m-ade1", "m-viejo", "m-ade2"]);
check("pero la liquidación sigue afuera", cands.indexOf("m-liq") < 0, cands.join(","));

igual("el otro jugador ve sólo lo suyo",
      app.pjMovsCandidatosDescuento("j1", 30, "2026-06-15").map(m => m.id), ["m-otro"]);
igual("un id que no es de nadie no tiene candidatos",
      app.pjMovsCandidatosDescuento("nadie", 0, "2026-06-15"), []);
// La ventana acota hacia atrás, no hacia adelante: un egreso con fecha posterior a hoy sigue
// siendo un adelanto (se carga con la fecha en que se va a entregar) y tiene que poder elegirse.
igual("un egreso con fecha futura no se pierde por la ventana",
      app.pjMovsCandidatosDescuento("j2", 30, "2026-05-20").map(m => m.id), ["m-ade1", "m-viejo"]);

// ══════════════════════════════════════════════════════════════
// Los descuentos parciales funcionan solos —dos filas apuntando al mismo egreso— y el aviso de
// exceso es lo único que separa "lo descuento en dos veces" de "lo descuento dos veces".
seccion("28 · Descuentos parciales sobre un mismo adelanto");
sembrarMovs();
const parcial = (id, monto) => ({ id, jugadorId: "j2", jugadorNombre: "GOMEZ", partidosIncluidos: [],
  montoBase: -monto, ajuste: 0, motivoAjuste: "", montoFinal: -monto, estado: "pendiente",
  etiqueta: "Adelanto", mes: "2026-06", tipo: "descuento", partidoId: "", codRubroContra: "",
  movimientoOrigenId: "m-ade1" });

igual("sin descuentos cargados, no hay nada descontado", app.pjDescontadoDeMov("m-ade1"), 0);
igual("y queda el adelanto entero",                      app.pjRestanteDeMov("m-ade1"), 20000);

app.pagosJugadores.push(parcial("d1", 8000));
igual("un descuento parcial suma su valor absoluto", app.pjDescontadoDeMov("m-ade1"), 8000);
igual("y el restante baja",                          app.pjRestanteDeMov("m-ade1"), 12000);

app.pagosJugadores.push(parcial("d2", 12000));
igual("los dos parciales suman el adelanto entero", app.pjDescontadoDeMov("m-ade1"), 20000);
igual("sin restante",                               app.pjRestanteDeMov("m-ade1"), 0);
igual("los descuentos de ese movimiento son los dos",
      app.pjDescuentosDeMovimiento("m-ade1").map(p => p.id), ["d1", "d2"]);
igual("y ninguno cuelga del adelanto viejo", app.pjDescuentosDeMovimiento("m-ade2"), []);

// El aviso se dispara por la SUMA, no por el monto suelto: es lo que detecta el mismo adelanto
// descontado dos veces.
app.pagosJugadores = app.pagosJugadores.filter(p => p.id !== "d2");
check("8.000 + 12.000 sobre un adelanto de 20.000 no avisa",
      !app.pjExcedeElAdelanto("m-ade1", 12000), "12000");
check("8.000 + 13.000 sí avisa",
       app.pjExcedeElAdelanto("m-ade1", 13000), "13000");
check("un descuento por el total, con otro ya cargado, avisa",
       app.pjExcedeElAdelanto("m-ade1", 20000), "20000");
// Editando una fila que ya está cargada no se la puede contar contra sí misma.
check("editando la propia fila, su monto viejo no se suma",
      !app.pjExcedeElAdelanto("m-ade1", 20000, "d1"), "excluyendo d1");
check("sin movimiento de origen no hay nada que exceder", !app.pjExcedeElAdelanto("", 999999));
check("contra un movimiento que ya no está, tampoco avisa",
      !app.pjExcedeElAdelanto("m-borrado", 999999));

igual("el label del origen sale del movimiento",
      app.pjMovOrigenLabel("m-ade1"), "10/06/2026 · Adelanto");
igual("y un movimiento borrado se nombra igual, sin romper el render",
      app.pjMovOrigenLabel("m-borrado"), "movimiento borrado");

// ══════════════════════════════════════════════════════════════
seccion("29 · El bloque de movimiento de origen del modal");
sembrarMovs();
app.pagosJugadores.push(parcial("d1", 8000));
// La ventana va en "todos": los movimientos sembrados son de junio de 2026 y la ventana de días se
// mide contra la fecha real del día en que corre la prueba.
app.pjDescCtx = { pagoId: "", volverALiquidar: "", jugadorId: "j2", movOrigenId: "", dias: 0 };
let html = app.pjDescOrigenHTML();
check("ofrece el adelanto reciente",     html.includes('value="m-ade1"'), html);
check("no ofrece la liquidación",       !html.includes('value="m-liq"'),  html);
check("dice cuánto se descontó ya y cuánto queda",
      html.includes("ya descontado") && html.includes("queda"), html);
check("y ofrece ampliar la ventana",     html.includes('value="90"') && html.includes('value="0"'), html);

// Un movimiento ya elegido que cae fuera de la ventana no puede desaparecer del select: el
// descuento quedaría guardado sin el link sin que nadie lo note.
app.pjDescCtx.movOrigenId = "m-ade2";
app.pjDescCtx.dias = 30;                  // ninguno de los sembrados entra en esta ventana
html = app.pjDescOrigenHTML();
check("el elegido fuera de la ventana se sigue mostrando", html.includes('value="m-ade2"'), html);
check("y sigue seleccionado", html.includes('value="m-ade2" selected'), html);

// ── El bloque "Descontar del sueldo" del formulario de movimientos ──
app.F = app.buildDefaultF();
app.F.tipo = "EGRESO"; app.F.codRubro = "19"; app.F.jugadorCT = "GOMEZ";
check("aplica en un EGRESO de sueldo a nombre de un jugador", app.adelantoDescontableAplica());
app.F.jugadorCT = "";
check("sin jugador elegido, no aplica", !app.adelantoDescontableAplica());
app.F.jugadorCT = "GOMEZ"; app.F.codRubro = "35";
check("con otro rubro, tampoco",        !app.adelantoDescontableAplica());
app.F.codRubro = "18";
check("el 18 (cuerpo técnico) también aplica", app.adelantoDescontableAplica());
app.F.tipo = "INGRESO";
check("y un INGRESO nunca", !app.adelantoDescontableAplica());

// El mes por defecto es el de la fecha del movimiento, y tiene que estar en la lista aunque el
// adelanto sea de hace medio año y se esté cargando recién ahora.
app.F.tipo = "EGRESO"; app.F.fecha = "2026-06-10";
igual("el mes por defecto es el de la fecha", app.mesDescuentoDefault(), "2026-06");
const optsMes = app.opcionesMesDescuentoHTML("2026-06");
check("y aparece seleccionado en las opciones", optsMes.includes('value="2026-06" selected'), optsMes);
igual("mesesEntre cuenta cruzando el año", app.mesesEntre("2025-11", "2026-02"), 3);
igual("y hacia atrás da negativo",         app.mesesEntre("2026-02", "2025-11"), -3);

// ══════════════════════════════════════════════════════════════
// Cada fila de Transferencias tiene que tener exactamente tantas celdas como el encabezado. Con
// una de menos el navegador no avisa nada: corre el resto de la fila una columna a la izquierda y
// el premio aparece bajo "Monto", el total bajo "Premios/Ajustes" y el botón bajo "Alias/CBU".
seccion("30 · La tabla de Transferencias no se desalinea");

/** Celdas de una fila de HTML, contando el colspan de cada una. */
function celdas(trHtml) {
  let n = 0, m;
  const re = /<t[dh]\b([^>]*)>/g;
  while ((m = re.exec(trHtml))) {
    const cs = /colspan="(\d+)"/.exec(m[1]);
    n += cs ? Number(cs[1]) : 1;
  }
  return n;
}
/** [celdasDelHeader, [celdasDeCadaFilaDeJugador]] de lo que devuelve renderTransferencias. */
function anchoTabla() {
  const html  = app.renderTransferencias();
  const filas = html.split(/<tr\b/).slice(1);
  const head  = celdas(filas[0]);
  const cuerpo = filas.slice(1).filter(f => f.includes("data-jug=")).map(celdas);
  return [head, cuerpo];
}

sembrar();
app.pjSoloPendientes = false;

// El caso de la captura: ninguna fecha tildada. El encabezado cae en una sola columna "Monto" y
// el jugador por partido no emitía ninguna.
app.pjPartidosSel = [];
let [head, cuerpo] = anchoTabla();
igual("sin fechas tildadas el encabezado tiene 6 columnas", head, 6);
check("y todas las filas tienen esas mismas 6",
      cuerpo.length > 0 && cuerpo.every(n => n === head), `head=${head} filas=${cuerpo.join(",")}`);

// Con una fecha, y con dos: el jugador mensual usa colspan y el por partido una celda por fecha.
app.pjPartidosSel = ["p1"];
[head, cuerpo] = anchoTabla();
check("con una fecha tildada siguen cuadrando",
      cuerpo.length > 0 && cuerpo.every(n => n === head), `head=${head} filas=${cuerpo.join(",")}`);
app.pjPartidosSel = ["p1", "p2"];
[head, cuerpo] = anchoTabla();
igual("con dos fechas el encabezado crece a 7", head, 7);
check("y las filas también",
      cuerpo.length > 0 && cuerpo.every(n => n === head), `head=${head} filas=${cuerpo.join(",")}`);

// ══════════════════════════════════════════════════════════════
// El filtro por fecha decía estar y no estaba: se aplicaba sólo a los premios ya cobrados y los
// pendientes se colaban todos. Con "La Emilia" tildado aparecía el gol de otra fecha, y "Tildar
// todos los premios" se lo llevaba puesto en esa liquidación.
seccion("31 · Los premios se acotan a las fechas tildadas");
sembrar();
// f-prem1 es de p1; f-prem2 no tiene partido; se agrega uno de p2 y uno ya cobrado de p1.
app.pagosJugadores.push(
  { id: "f-prem3", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [], montoFinal: 7000,
    estado: "pendiente", etiqueta: "Gol p2", mes: "2026-06", tipo: "premio", partidoId: "p2" },
  { id: "f-prem4", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [], montoFinal: 2000,
    estado: "pagado",   etiqueta: "Cobrado p1", mes: "2026-06", tipo: "premio", partidoId: "p1" });

app.pjPartidosSel = ["p1"];
let vistos = app.pjPremiosDeVista("j1").map(p => p.id);
check("el premio de la fecha tildada está",        vistos.includes("f-prem1"), vistos.join(","));
check("el ya cobrado de esa fecha también, para poder consultarlo", vistos.includes("f-prem4"), vistos.join(","));
check("el premio sin partido no lo esconde ninguna fecha", vistos.includes("f-prem2"), vistos.join(","));
check("PERO el de la otra fecha NO aparece",      !vistos.includes("f-prem3"), vistos.join(","));

app.pjPartidosSel = ["p2"];
vistos = app.pjPremiosDeVista("j1").map(p => p.id);
check("al tildar la otra fecha, aparece el suyo",  vistos.includes("f-prem3"), vistos.join(","));
check("y se va el de p1",                         !vistos.includes("f-prem1"), vistos.join(","));
check("el ya cobrado de p1 tampoco se cuela",     !vistos.includes("f-prem4"), vistos.join(","));

app.pjPartidosSel = ["p1", "p2"];
vistos = app.pjPremiosDeVista("j1").map(p => p.id);
check("con las dos tildadas están los dos", vistos.includes("f-prem1") && vistos.includes("f-prem3"), vistos.join(","));

// Sin ninguna fecha tildada no hay contra qué filtrar: se ven todos los pendientes, que es el modo
// "cobrar premios sueltos". Los ya cobrados sí se van: no hay fecha que los justifique en pantalla.
app.pjPartidosSel = [];
vistos = app.pjPremiosDeVista("j1").map(p => p.id);
check("sin fechas tildadas se ven todos los pendientes",
      ["f-prem1","f-prem2","f-prem3"].every(id => vistos.includes(id)), vistos.join(","));
check("y ninguno ya cobrado", !vistos.includes("f-prem4"), vistos.join(","));

// Lo que el filtro esconde se cuenta para poder avisarlo: un premio que desaparece sin decir por
// qué no se cobra nunca.
app.pjPartidosSel = ["p1"];
igual("se avisa el premio de la fecha no tildada",
      app.pjPremiosOcultosPorFecha().map(p => p.id), ["f-prem3"]);
app.pjPartidosSel = ["p1", "p2"];
igual("con todas las fechas tildadas no hay nada oculto", app.pjPremiosOcultosPorFecha(), []);
app.pjPartidosSel = [];
igual("y sin fechas tampoco: ahí se muestran todos", app.pjPremiosOcultosPorFecha(), []);

// ══════════════════════════════════════════════════════════════
// El Mes de una fila de roster nunca puede quedar vacío: sin él la fila desaparece de todos los
// filtros por mes y no se la encuentra más.
seccion("30 · El Mes de un roster cae al mes actual, nunca a vacío");
sembrar();
igual("un partido con fecha da su mes", app.pjMesDeRoster("p1"), "2026-06");
app.partidos.push({ id: "p3", fecha: "", rival: "Sin fecha", numeroFecha: "Fecha 5" });
igual("un partido sin fecha cae al mes actual", app.pjMesDeRoster("p3"), app.nowMes());
igual("y un partido que no existe tampoco queda vacío", app.pjMesDeRoster("nope"), app.nowMes());

// ══════════════════════════════════════════════════════════════
// La columna "Otros" de Por partido y la columna "Detalle" de Mensual salen de la MISMA función.
// Si divergieran mostrarían cosas distintas para los mismos datos — y antes "Otros" pintaba sólo
// el neto: con $100.000 de premios y $150.000 de adelanto decía −$50.000 y nada más.
seccion("31 · El detalle de Otros y el de Mensual son el mismo componente");
sembrar();
// Un jugador por partido con premio + descuento linkeado a un adelanto, para ejercitar todo.
app.movimientos = [{ id: "adel9", fecha: "2026-06-21", concepto: "Adelanto", tipo: "EGRESO", egreso: 150000 }];
app.pagosJugadores.push({
  id: "f-desc-j1", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [], montoFinal: -150000,
  estado: "pendiente", etiqueta: "Adelanto entregado", mes: "2026-06", tipo: "descuento",
  partidoId: "p1", movimientoOrigenId: "adel9", fecha: "2026-06-21" });

const filasJ1  = app.pjFilasAcumuladoPendiente("j1");
const detalleJ1 = app.pjDetalleFilasHTML(filasJ1);
igual("el neto solo no alcanza para explicarlo",
      app.pjFilasAcumuladoPendiente("j1").reduce((s,p) => s + p.montoFinal, 0), -136000);

// Cada fila aparece con su etiqueta: es lo que distingue el detalle del neto pelado.
check("lista cada fila, no el neto",
      filasJ1.every(f => detalleJ1.includes(f.etiqueta + ": ")) && filasJ1.length === 3, detalleJ1);
check("el premio con su etiqueta y monto", detalleJ1.includes("Gol: " + app.fmtSigned(10000)), detalleJ1);
check("el descuento con signo",            detalleJ1.includes(app.fmtSigned(-150000)), detalleJ1);
check("y en rojo",                         detalleJ1.includes("color:var(--red)"), detalleJ1);
check("con la fecha del hecho",            detalleJ1.includes("21/06/2026"), detalleJ1);
check("y el ← del movimiento de origen",   detalleJ1.includes("← " ) && detalleJ1.includes("adel9"), detalleJ1);
check("formato inline, no lista vertical", !detalleJ1.includes("<li"), detalleJ1);

// La ✕ va sólo en los descuentos pendientes: los premios se gestionan desde el 🏆 y
// deletePagoJugador rechaza borrar una fila confirmada.
igual("una sola ✕, la del descuento", (detalleJ1.match(/quitarDescuento/g) || []).length, 1);
check("apunta al descuento",          detalleJ1.includes("quitarDescuento('f-desc-j1')"), detalleJ1);
app.pagosJugadores.find(p => p.id === "f-desc-j1").estado = "pagado";
const detallePagado = app.pjDetalleFilasHTML(app.pjFilasAcumuladoPendiente("j1"));
check("un descuento ya pagado no la lleva", !detallePagado.includes("quitarDescuento"), detallePagado);
app.pagosJugadores.find(p => p.id === "f-desc-j1").estado = "pendiente";

// Las mismas filas por los dos caminos dan exactamente la misma salida. Por partido acota al
// partido a la vista (fase 11), así que se lo para en p1, que es de donde son estas filas.
app.pjPartidoSel = "p1";
// En Por partido va sin el nombre del partido: todo lo que lista es del que está a la vista.
const detalleVistaJ1 = app.pjDetalleFilasHTML(app.pjFilasDeVistaPartido("j1"), "", { sinPartido: true });
check("Por partido no repite el partido a la vista", !detalleVistaJ1.includes("Colon 08/06"), detalleVistaJ1);
check("Mensual sí dice de qué partido es cada premio", detalleJ1.includes("Colon 08/06"), detalleJ1);
const htmlPartido = app.renderPagoPartido();
const htmlMensual = (app.pjMesSel = "2026-06", app.renderPagoMensual());
check("Por partido pinta ese detalle", htmlPartido.includes(detalleVistaJ1), detalleVistaJ1.slice(0, 120));
igual("y Mensual, el de sus propias filas por la misma función",
      htmlMensual.includes(app.pjDetalleFilasHTML(app.pjFilasMes("j2", "2026-06"))), true);

// Sin filas, cada pantalla pone su propio texto y ninguna rompe.
igual("sin filas devuelve el vacío que le pasan",
      app.pjDetalleFilasHTML([], "Sin cargos este mes"),
      '<span class="pj-acumulado">Sin cargos este mes</span>');

// ══════════════════════════════════════════════════════════════
// El Total de la fila de Transferencias tiene que coincidir con el neto del modal de liquidación:
// las dos cuentas salen de las mismas filas y si difieren, es un bug. Antes el descuento entraba en
// info.sueldo, se sumaba al Total… y no se pintaba en ninguna columna: el número cambiaba y no
// había forma de saber por qué.
seccion("32 · El Total de Transferencias coincide con pjLiqNeto");
sembrar();
app.movimientos = [{ id: "adel9", fecha: "2026-06-21", concepto: "Adelanto", tipo: "EGRESO", egreso: 20000 }];
// PEREZ cobra por partido: p1 pendiente, dos premios y un descuento linkeado a un adelanto.
app.pagosJugadores.push({
  id: "f-desc-j1", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [], montoFinal: -20000,
  estado: "pendiente", etiqueta: "Adelanto entregado", mes: "2026-06", tipo: "descuento",
  partidoId: "p1", movimientoOrigenId: "adel9", fecha: "2026-06-21" });

const netoDe = ids => { app.pjLiqData = { jugadorId: "j1", nombre: "PEREZ", ids }; return app.pjLiqNeto(); };

// Sin premios tildados: partido pendiente + descuento.
igual("la base son el partido y el descuento", app.pjTransfBase("j1"), 30000);
igual("y coincide con el neto de la liquidación",
      netoDe(app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }])),
      app.pjTransfBase("j1"));

// Con los dos premios tildados: el Total de la fila es base + lo tildado.
const idsConPremios = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1", "f-prem2"] }]);
const totalFila = app.pjTransfBase("j1") + 10000 + 4000;
igual("con premios tildados también cierra", netoDe(idsConPremios), totalFila);
igual("y el número es el esperado", totalFila, 44000);

// El descuento se ve en la celda, sin checkbox: entra siempre, no es opcional.
const htmlTransf = app.renderTransferencias();
check("el descuento se pinta en la tabla", htmlTransf.includes("Adelanto entregado"), "no aparece");
check("con el monto en rojo y con signo",
      htmlTransf.includes(app.fmtSigned(-20000)) && htmlTransf.includes("color:var(--red)"));
check("y con el ← de su movimiento de origen", htmlTransf.includes("openMovModal(&#39;adel9&#39;)") ||
      htmlTransf.includes("openMovModal('adel9')"), "sin flecha");
check("SIN checkbox: no es opcional",
      !htmlTransf.includes('class="pj-premio-cb" value="f-desc-j1"'), "tiene checkbox");
check("y sin ✕: repintar se llevaría los premios tildados",
      !htmlTransf.includes("quitarDescuento(&#39;f-desc-j1&#39;)") &&
      !htmlTransf.includes("quitarDescuento('f-desc-j1')"), "tiene la cruz");
check("el encabezado nombra los descuentos", htmlTransf.includes("<th>Premios y descuentos</th>"));

// Un jugador mensual: el descuento también tiene que verse.
igual("la base del mensual ya viene neteada", app.pjTransfBase("j2"), 72000);
check("y su descuento se pinta igual", htmlTransf.includes("Multa"), "no aparece el de GOMEZ");

// ══════════════════════════════════════════════════════════════
// "Por partido" muestra lo del partido a la vista, no todo lo pendiente del jugador. El premio de
// valla invicta de la fecha pasada seguía apareciendo al cambiar de partido, y los descuentos
// también. Las filas SIN partido se muestran siempre: son cargos generales del jugador (un adelanto
// cargado desde Mensual o desde el formulario de movimientos), no filas de otra fecha.
seccion("33 · Otros se acota al partido seleccionado");
sembrar();
app.pagosJugadores.push(
  // Descuento cargado desde Por partido en p1 (desde la fase 10.1c guarda su partidoId).
  { id: "f-desc-p1", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [], montoFinal: -5000,
    estado: "pendiente", etiqueta: "Multa p1", mes: "2026-06", tipo: "descuento", partidoId: "p1" },
  // Adelanto cargado desde el formulario de movimientos: sin partido, es un cargo general.
  { id: "f-desc-gral", jugadorId: "j1", jugadorNombre: "PEREZ", partidosIncluidos: [], montoFinal: -3000,
    estado: "pendiente", etiqueta: "Adelanto", mes: "2026-06", tipo: "descuento", partidoId: "",
    movimientoOrigenId: "adelX" });

// f-prem1 es el premio de p1; f-prem2 no tiene partido.
app.pjPartidoSel = "p1";
let vistas = app.pjFilasDeVistaPartido("j1").map(p => p.id).sort();
igual("en p1 entran las suyas y las generales", vistas, ["f-desc-gral", "f-desc-p1", "f-prem1", "f-prem2"]);

app.pjPartidoSel = "p2";
vistas = app.pjFilasDeVistaPartido("j1").map(p => p.id).sort();
igual("en p2 quedan sólo las generales", vistas, ["f-desc-gral", "f-prem2"]);
check("el premio de p1 NO aparece",   !vistas.includes("f-prem1"), vistas.join(","));
check("el descuento de p1 tampoco",   !vistas.includes("f-desc-p1"), vistas.join(","));

app.pjPartidoSel = "p1";
check("y al volver a su fecha reaparecen",
      app.pjFilasDeVistaPartido("j1").map(p => p.id).includes("f-prem1"));

// El neto sale de las MISMAS filas que el detalle: si no, contradice la línea de al lado.
igual("el neto de p1 suma sus cuatro filas",  app.pjAcumuladoDeVistaPartido("j1"), 10000 + 4000 - 5000 - 3000);
app.pjPartidoSel = "p2";
igual("el de p2, sólo las generales",         app.pjAcumuladoDeVistaPartido("j1"), 4000 - 3000);
igual("y coincide con la suma del detalle",
      app.pjFilasDeVistaPartido("j1").reduce((s,p) => s + p.montoFinal, 0),
      app.pjAcumuladoDeVistaPartido("j1"));

// Lo que el filtro esconde se avisa: un premio que no se ve no se cobra nunca.
igual("se avisan las filas de la otra fecha",
      app.pjFilasOcultasPorPartido().map(p => p.id).sort(), ["f-desc-p1", "f-prem1"]);
app.pjPartidoSel = "p1";
igual("estando en su fecha no hay nada oculto", app.pjFilasOcultasPorPartido(), []);

// El data-premios de la fila (que usa pjRecalcRow para la columna Final) sale del mismo número.
app.pjPartidoSel = "p2";
const htmlP2 = app.renderPagoPartido();
check("data-premios usa el neto filtrado", htmlP2.includes('data-premios="1000"'), "no está");
check("y el aviso al pie nombra la otra fecha", htmlP2.includes("no se muestran acá"), "sin aviso");
check("el detalle no menciona el premio de p1", !htmlP2.includes("Gol: "), "se coló");

// ── Transferencias no cambia: usa pjPartidosSel (plural) y su propia lógica ──
seccion("34 · El filtro de Por partido no toca Transferencias");
app.pjPartidosSel = ["p1"];
app.pjPartidoSel  = "p2";   // una fecha distinta a la tildada, para que se note si se cruzaran
igual("pjPremiosDeVista sigue mirando lo tildado",
      app.pjPremiosDeVista("j1").map(p => p.id).sort(), ["f-prem1", "f-prem2"]);
// La base de Transferencias arrastra TODOS los descuentos del jugador, sean de la fecha que sean:
// se liquidan juntos, y ahí no hay un partido "a la vista" que los acote.
igual("la base de Transferencias no se acota por pjPartidoSel",
      app.pjTransfBase("j1"), 50000 - 5000 - 3000);
const idsT = app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: ["f-prem1"] }]);
app.pjLiqData = { jugadorId: "j1", nombre: "PEREZ", ids: idsT };
igual("y el Total sigue coincidiendo con pjLiqNeto",
      app.pjLiqNeto(), app.pjTransfBase("j1") + 10000);


// ── Fase 13: jugadorCT guarda UN solo nombre, el del jugador o el del grupo. Buscar a un
// jugador tiene que traer también lo que se cargó a los grupos donde está adentro. ──
seccion("35 · Buscar un jugador también trae sus grupos");
app.jugadores = [
  { id: "j-len", nombre: "Lencina Nicolás" },
  { id: "j-gom", nombre: "Gómez Pablo" }
];
app.grupos = [
  { id: "g-mor", nombre: "Ref. Morteros", miembros: ["j-len", "j-gom"] },
  { id: "g-fre", nombre: "Ref. Freyre",   miembros: [] }
];

igual("expande al grupo que contiene al jugador",
      [...app.gruposQueContienen("lencina")], ["ref. morteros"]);
check("el jugador matchea por su propio nombre",
      app.matchJugadorOGrupo("Lencina Nicolás", "Lencina", app.gruposQueContienen("Lencina")));
check("y el grupo matchea por el miembro",
      app.matchJugadorOGrupo("Ref. Morteros", "Lencina", app.gruposQueContienen("Lencina")));
check("sin acentos ni mayúsculas también",
      app.matchJugadorOGrupo("Ref. Morteros", "LENCINA", app.gruposQueContienen("LENCINA")));
check("un grupo que no lo tiene NO matchea",
      !app.matchJugadorOGrupo("Ref. Freyre", "Lencina", app.gruposQueContienen("Lencina")));
check("búsqueda vacía deja pasar todo",
      app.matchJugadorOGrupo("Cualquier Cosa", "", app.gruposQueContienen("")));
check("el prefijo viejo GRP: no rompe el match",
      app.matchJugadorOGrupo("GRP:Ref. Morteros", "Lencina", app.gruposQueContienen("Lencina")));
check("un texto que no está en ningún lado no matchea",
      !app.matchJugadorOGrupo("Ref. Morteros", "zzz", app.gruposQueContienen("zzz")));

// De punta a punta sobre el filtro real de Reportes: el resto de los filtros en neutro para
// que lo único que decida sea jugadorCT.
app.movimientos = [
  { id: "m-len", tipo: "EGRESO",  fecha: "2026-03-10", mes: "2026-03", categoria: "Fútbol",
    codRubro: "1", rubro: "Sueldos", cuenta: "CAJA", jugadorCT: "Lencina Nicolás",
    adherente: "", concepto: "sueldo", observacion: "", monto: 10000 },
  { id: "m-grp", tipo: "EGRESO",  fecha: "2026-03-11", mes: "2026-03", categoria: "Fútbol",
    codRubro: "1", rubro: "Sueldos", cuenta: "CAJA", jugadorCT: "Ref. Morteros",
    adherente: "", concepto: "viáticos", observacion: "", monto: 5000 },
  { id: "m-gom", tipo: "INGRESO", fecha: "2026-03-12", mes: "2026-03", categoria: "Fútbol",
    codRubro: "1", rubro: "Sueldos", cuenta: "CAJA", jugadorCT: "Gómez Pablo",
    adherente: "", concepto: "devolución", observacion: "", monto: 3000 }
];
app.reportesState = { anio: "2026", meses: [], cuentas: [], categoria: "", rubroCod: "",
                      jugadorCT: "Lencina", adherente: "", search: "",
                      catExpandido: new Set(), rubroExpandido: new Set() };
igual("Reportes trae el del jugador Y el del grupo, no el de Gómez",
      app.getMovimientosReportes().map(m => m.id), ["m-len", "m-grp"]);
app.reportesState.jugadorCT = "";
igual("y sin búsqueda siguen pasando los tres",
      app.getMovimientosReportes().map(m => m.id), ["m-len", "m-grp", "m-gom"]);

// ── Fase 14: lo cargado a un grupo se reparte entre sus integrantes. La regla que no se puede
// romper es que ningún alcance duplique ni pierda plata. ──
seccion("36 · Prorrateo de los gastos de grupo");

igual("reparto exacto: [-34,-33,-33]", app.repartirEntero(-100, 3), [-34, -33, -33]);
igual("el signo espeja el reparto, no lo cambia", app.repartirEntero(100, 3), [34, 33, 33]);
igual("n = 1 devuelve el monto entero", app.repartirEntero(50, 1), [50]);
igual("n = 0 no reparte nada", app.repartirEntero(50, 0), []);
const partes887 = app.repartirEntero(-887412, 3);
igual("y la suma de las partes es EXACTA", partes887.reduce((a, b) => a + b, 0), -887412);
check("ninguna parte difiere de otra en más de 1",
      Math.max(...partes887) - Math.min(...partes887) <= 1, partes887.join(","));

// Ana está en tres grupos (uno con un id que ya no existe), Caro solo en uno; "Vacío" no tiene
// a nadie y "Proveedor Suelto" es texto libre de un import: ninguno de los dos se puede repartir.
app.jugadores = [{ id:"j1", nombre:"Ana" }, { id:"j2", nombre:"Beto" }, { id:"j3", nombre:"Caro" }];
app.grupos = [
  { id:"g1", nombre:"Casa Norte",  miembros:["j1","j2","j3"] },
  { id:"g2", nombre:"Viajes",      miembros:["j1","j2"] },
  { id:"g3", nombre:"Vacío",       miembros:[] },
  { id:"g4", nombre:"Con borrado", miembros:["j1","j-borrado"] }
];
const mov36 = (id, jugadorCT, codRubro, egreso, ingreso, fecha) => ({
  id, jugadorCT, codRubro, egreso, ingreso, fecha, mes: fecha.slice(0,7),
  tipo: egreso ? "EGRESO" : "INGRESO", concepto: id, rubro: "R" + codRubro, cuenta: "CAJA"
});
app.movimientos = [
  mov36("m1", "Ana",              "18", 100000, 0, "2026-01-05"),  // propio
  mov36("m2", "Casa Norte",       "45",    100, 0, "2026-02-10"),  // grupo de 3 → 34/33/33
  mov36("m3", "Viajes",           "43",   1000, 0, "2026-01-12"),  // grupo de 2 → 500/500
  mov36("m4", "Vacío",            "21",   5000, 0, "2026-01-15"),  // sin miembros
  mov36("m5", "Proveedor Suelto", "44",    700, 0, "2026-01-18"),  // texto libre
  mov36("m6", "Con borrado",      "18",    300, 0, "2026-01-19"),  // queda 1 miembro vivo
  mov36("m7", "Viajes",           "44",      0, 100, "2026-01-20") // ingreso: mismo reparto espejado
];
const netoSembrado = app.movimientos.reduce((s, m) => s + (m.ingreso - m.egreso), 0);
const sumaTotales  = rows => rows.reduce((s, r) => s + r.total, 0);
const fila36       = (rows, n) => rows.find(r => r.nombre === n);

const indiv = app.calcJugadoresResumen("", [], "individuos", "totales");
const ambos = app.calcJugadoresResumen("", [], "ambos", "totales");
const soloG = app.calcJugadoresResumen("", [], "grupos", "totales");

// La invariante: el TOTALES de la tabla tiene que cubrir toda la plata, una sola vez.
igual("Individuos cubre exactamente toda la plata", sumaTotales(indiv), netoSembrado);
igual("Ambos da el mismo número (sin prorrateo, sin duplicar)", sumaTotales(ambos), netoSembrado);
igual("Grupos solo cubre lo cargado a grupos", sumaTotales(soloG), -100 - 1000 - 5000 - 300 + 100);

// Ana: lo suyo (-100000) + Casa Norte (-34 y +34) + Viajes (-500) + Con borrado (-300)
igual("un jugador en varios grupos suma la parte de todos", fila36(indiv, "Ana").total, -100784);
igual("y en Ambos vuelve a mostrar solo lo suyo", fila36(ambos, "Ana").total, -100000);
igual("el resto del reparto cae en los otros miembros",
      [fila36(indiv, "Beto").total, fila36(indiv, "Caro").total], [-483, -33]);
igual("el ingreso se reparte igual que el egreso, espejado",
      fila36(indiv, "Ana").almacen, 50);
igual("el miembro borrado no se lleva su parte: la cobra el que queda",
      fila36(indiv, "Ana").sueldos, -100000 - 300);

const vacio = fila36(indiv, "Vacío");
check("un grupo sin miembros queda como fila residual marcada", vacio && vacio.sinRepartir === true);
igual("con toda su plata, que sigue contando en el total", vacio.total, -5000);
const suelto = fila36(indiv, "Proveedor Suelto");
check("el texto libre que no es jugador ni grupo mantiene su fila", suelto && suelto.esGrupo === false);
igual("y va entero, sin repartir", suelto.total, -700);

// El detalle de la fila tiene que reconciliar contra el total, o los números no se pueden auditar.
const movsAna = fila36(indiv, "Ana").movimientos;
igual("la suma de los montos aplicados da el total de la fila",
      movsAna.reduce((s, m) => s + m.montoAplicado, 0), fila36(indiv, "Ana").total);
const desdeGrupo = movsAna.find(m => m.id === "m3");
igual("los movimientos de grupo traen de dónde salieron",
      [desdeGrupo.grupoOrigen, desdeGrupo.divisor, desdeGrupo.montoGrupo], ["Viajes", 2, -1000]);
check("y los propios no traen grupoOrigen", !movsAna.find(m => m.id === "m1").grupoOrigen);
check("el detalle muestra el divisor del grupo",
      app.renderJugadorResDetalle(fila36(indiv, "Ana")).includes("÷3"), "sin la marca ÷3");

// Promedios: divide por los meses en que ESA fila tuvo movimientos, propios o heredados del grupo.
const prom = app.calcJugadoresResumen("", [], "individuos", "promedios");
igual("un mes con gasto solo del grupo igual cuenta como mes",
      fila36(prom, "Ana").mesesConGasto, 2);
igual("y el promedio divide el total por esos meses", fila36(prom, "Ana").total, -50392);
igual("Caro solo tiene el mes de su grupo", fila36(prom, "Caro").mesesConGasto, 1);

// ══════════════════════════════════════════════════════════════
seccion("36 · Aviso al guardar un gasto médico sin reintegro");

// La condición tiene que ser la MISMA que muestra el checkbox en el formulario: avisar por
// una casilla que el usuario no vio sería peor que no avisar.
app.F = { codRubro: "21", tipo: "EGRESO", seguroReintegro: 0 };
check("gasto médico egreso sin tildar → avisa", app.faltaMarcarReintegro());

app.F = { codRubro: "21", tipo: "EGRESO", seguroReintegro: 1 };
check("con el reintegro tildado NO avisa", !app.faltaMarcarReintegro());

app.F = { codRubro: "21", tipo: "INGRESO", seguroReintegro: 0 };
check("el reintegro que entra (INGRESO del 21) NO avisa", !app.faltaMarcarReintegro());

app.F = { codRubro: "19", tipo: "EGRESO", seguroReintegro: 0 };
check("otro rubro NO avisa", !app.faltaMarcarReintegro());

// AJUSTE fuerza codRubro 99 y su propio tipo, así que nunca puede disparar el aviso.
app.F = { codRubro: "99", tipo: "AJUSTE", seguroReintegro: 0 };
check("un ajuste de conciliación NO avisa", !app.faltaMarcarReintegro());

// ══════════════════════════════════════════════════════════════
seccion("37 · Doble 'atrás' para salir de la app");

// Sin modal y sin aviso previo: el primer toque avisa, no sale.
igual("primer toque → avisa", app.accionBotonAtras(false, false), "avisar");
// Ya avisamos y estamos dentro de la ventana: este toque deja salir.
igual("segundo toque seguido → sale", app.accionBotonAtras(false, true), "salir");
// Un modal abierto se lleva el toque: cerrarlo es lo que se espera, y NO arma la salida.
igual("con modal abierto → cierra el modal", app.accionBotonAtras(true, false), "cerrar-modal");
// Y sigue ganando el modal aunque ya se hubiera avisado: no se puede salir sin verlo cerrarse.
igual("el modal gana incluso si ya se avisó", app.accionBotonAtras(true, true), "cerrar-modal");

// En una pestaña común no se secuestra el botón atrás: matchMedia del harness devuelve
// matches:false y navigator.standalone no existe.
check("fuera de la app instalada no se intercepta nada", !app.esAppInstalada());

// ══════════════════════════════════════════════════════════════
seccion("38 · Resumen > Adherentes: buscador y orden de columnas");

function sembrarAdherentes() {
  app.adhResFiltro = ""; app.adhResOrdenCol = ""; app.adhResOrdenDir = -1;
  app.adhResumenSoloPendientesMes = false;
  app.adherenteAnio = "2026";
  app.adherentes = [
    { nombre: "Perez Juan",  cuotaMensual: 1000, cuotasAnuales: 12 },
    { nombre: "Gomez Ana",   cuotaMensual: 2000, cuotasAnuales: 12 },
    { nombre: "Álvarez Bea", cuotaMensual: 0,    cuotasAnuales: 0  }
  ];
  // Perez pagó de más (OK), Gomez algo (PARCIAL), Álvarez sin compromiso pero con un aporte.
  app.movimientos = [
    { tipo:"INGRESO", fecha:"2026-03-05", codRubro:"6", adherente:"Perez Juan",  ingreso:15000, egreso:0, concepto:"", cuenta:"EFECTIVO" },
    { tipo:"INGRESO", fecha:"2026-04-05", codRubro:"6", adherente:"Gomez Ana",   ingreso:4000,  egreso:0, concepto:"", cuenta:"EFECTIVO" },
    { tipo:"INGRESO", fecha:"2026-03-09", codRubro:"6", adherente:"Álvarez Bea", ingreso:9000,  egreso:0, concepto:"", cuenta:"EFECTIVO" }
  ];
}

sembrarAdherentes();
const nombres = () => app.filasAdherentesRes().map(r => r.adherente);

igual("sin filtro salen los tres", nombres().sort(), ["Gomez Ana", "Perez Juan", "Álvarez Bea"]);

app.adhResFiltro = "gomez";
igual("el buscador filtra por nombre", nombres(), ["Gomez Ana"]);

app.adhResFiltro = "GOMEZ";
igual("no distingue mayúsculas", nombres(), ["Gomez Ana"]);

app.adhResFiltro = "alvarez";
igual("ni acentos (Álvarez se encuentra escribiendo alvarez)", nombres(), ["Álvarez Bea"]);

app.adhResFiltro = "zzz";
igual("un nombre que no existe no devuelve nada", nombres(), []);

app.adhResFiltro = "";

// ── Orden ──
// Por defecto: primero el que no llegó (PARCIAL), después el que no tiene compromiso, último el OK.
igual("orden por defecto: los que deben primero",
      app.ordenarAdherentesRes(app.filasAdherentesRes()).map(r => r.adherente),
      ["Gomez Ana", "Álvarez Bea", "Perez Juan"]);

app.adhResOrdenCol = "acumulado"; app.adhResOrdenDir = -1;
igual("por Acumulado, mayor a menor",
      app.ordenarAdherentesRes(app.filasAdherentesRes()).map(r => r.totalAportado),
      [15000, 9000, 4000]);

app.adhResOrdenDir = 1;
igual("el segundo clic invierte",
      app.ordenarAdherentesRes(app.filasAdherentesRes()).map(r => r.totalAportado),
      [4000, 9000, 15000]);

app.adhResOrdenCol = "adherente"; app.adhResOrdenDir = 1;
igual("por nombre ordena alfabético ignorando acentos",
      app.ordenarAdherentesRes(app.filasAdherentesRes()).map(r => r.adherente),
      ["Álvarez Bea", "Gomez Ana", "Perez Juan"]);

// Una columna de mes: solo Perez y Álvarez pagaron en marzo.
app.adhResOrdenCol = "mes:2026-03"; app.adhResOrdenDir = -1;
igual("por una columna de mes, el que no pagó ese mes queda último",
      app.ordenarAdherentesRes(app.filasAdherentesRes()).map(r => r.adherente),
      ["Perez Juan", "Álvarez Bea", "Gomez Ana"]);

// Sin compromiso no hay "resta": vale 0 y no simula una deuda.
app.adhResOrdenCol = ""; 
const bea = app.filasAdherentesRes().find(r => r.adherente === "Álvarez Bea");
igual("un adherente sin compromiso tiene resta 0, no deuda", app.adhResOrdenValor(bea, "resta"), 0);

// El buscador y el orden se combinan sin pisarse.
app.adhResFiltro = "e"; app.adhResOrdenCol = "acumulado"; app.adhResOrdenDir = -1;
igual("filtro + orden juntos",
      app.ordenarAdherentesRes(app.filasAdherentesRes()).map(r => r.adherente),
      ["Perez Juan", "Álvarez Bea", "Gomez Ana"]);
app.adhResFiltro = ""; app.adhResOrdenCol = "";

// ══════════════════════════════════════════════════════════════
seccion("39 · Placa de redes: GoPass como renglón propio");

// pg tal como lo arma calcPartidoResumenRows: gopass es un desglose de otrosIng (está DENTRO),
// igual que policia/arbitros son un desglose de gastosCancha.
const pgPlaca = {
  buffetIng: 100000, buffetEgr: 30000,
  entradas: 200000, otrosIng: 55000, gopass: 40000, otrosEgr: 5000,
  policia: 10000, arbitros: 12000, enfermera: 3000, filmacion: 8000, ambulancia: 4000,
  gastosCancha: 37000,
  ingresos: 355000, egresos: 72000
};
const pPlaca = { id:"p1", fecha:"2026-08-15", rival:"Colón", numeroFecha:"Fecha 3" };
const jsonPlaca = app.armarPlacaJson({ p: pPlaca, pg: pgPlaca });
const cancha = jsonPlaca.bloques.find(b => b.nombre === "CANCHA");
const itemPlaca = c => cancha.items.find(i => i.c === c);

check("existe el renglón GoPass", !!itemPlaca("GoPass"), cancha.items.map(i=>i.c).join(" | "));
igual("GoPass lleva su propio monto", itemPlaca("GoPass").m, 40000);
igual("y va como ingreso, no como egreso", itemPlaca("GoPass").neg, false);
// Lo importante: no se cuenta dos veces. Otros ingresos baja en lo que se llevó GoPass.
igual("Otros ingresos descuenta GoPass", itemPlaca("Otros ingresos (Sorteo)").m, 15000);
igual("los dos renglones siguen sumando el otrosIng original",
      itemPlaca("GoPass").m + itemPlaca("Otros ingresos (Sorteo)").m, 55000);
// El saldo de la placa tiene que seguir cuadrando con el Total Neto de la tabla.
igual("el saldo de la placa sigue dando el Total Neto",
      app.placaSaldoFinal(jsonPlaca), pgPlaca.ingresos - pgPlaca.egresos);

// Un partido sin GoPass no cambia respecto de antes.
const sinGopass = app.armarPlacaJson({ p: pPlaca, pg: { ...pgPlaca, gopass: 0 } });
const canchaSin = sinGopass.bloques.find(b => b.nombre === "CANCHA");
igual("sin GoPass el renglón queda en 0", canchaSin.items.find(i=>i.c==="GoPass").m, 0);
igual("y Otros ingresos queda intacto",
      canchaSin.items.find(i=>i.c==="Otros ingresos (Sorteo)").m, 55000);

// ══════════════════════════════════════════════════════════════
seccion("40 · Placa: la palabra \"Fecha\" no se duplica");

// El generador dibuja "FECHA " + lo que venga en el JSON, así que el JSON manda sólo el número.
igual("con la palabra adelante, se saca",   app.placaNumeroFecha("Fecha 22"), "22");
igual("en minúscula también",               app.placaNumeroFecha("fecha 22"), "22");
igual("sin espacio",                        app.placaNumeroFecha("Fecha22"),  "22");
igual("con Nº",                             app.placaNumeroFecha("Fecha Nº 5"), "5");
igual("un número pelado no se toca",        app.placaNumeroFecha("22"),       "22");
igual("Semi no se toca",                    app.placaNumeroFecha("Semi"),     "Semi");
igual("Final no se toca",                   app.placaNumeroFecha("Final"),    "Final");
// El lookahead protege palabras que apenas empiezan igual, sin bloquear el caso sin espacio.
igual("'Fechas especiales' no se mutila",   app.placaNumeroFecha("Fechas especiales"), "Fechas especiales");
igual("sólo 'Fecha' no deja identificador", app.placaNumeroFecha("Fecha"),    "");
igual("vacío o ausente no rompe",           app.placaNumeroFecha(undefined),  "");

// Y en el JSON completo, que es donde se veía el bug.
app.partidos = [{ id:"pf", fecha:"2026-08-03", rival:"Colón", numeroFecha:"Fecha 22", condicion:"LOCAL" }];
const jsonF = app.armarPlacaJson({ p: app.partidos[0], pg: {
  buffetIng:0, buffetEgr:0, entradas:0, otrosIng:0, gopass:0, otrosEgr:0,
  policia:0, arbitros:0, enfermera:0, ambulancia:0, filmacion:0, ingresos:0, egresos:0 } });
igual("el JSON lleva sólo el número de fecha", jsonF.fecha, "22");

// ══════════════════════════════════════════════════════════════
seccion("41 · Transferencias: sin fechas por defecto, filtros y selección");

sembrar();
app.pjLiquidadosSesion = new Set();
app.pjSoloPendientes = false;
app.pjExcluirMensuales = false;

// ── Ninguna fecha tildada de entrada ──
app.pjPartidosSel = [];
igual("sin fechas tildadas, el jugador por partido no arrastra nada", app.pjTransfBase("j1"), 0);
// El mensual no depende de las fechas: su sueldo y su descuento entran igual.
igual("el mensual sigue trayendo su sueldo neto", app.pjTransfBase("j2"), 80000 - 8000);
// Al tildar una fecha recién ahí aparece la plata del partido.
app.pjPartidosSel = ["p1"];
igual("tildando la fecha, el partido suma", app.pjTransfBase("j1"), 50000);
app.pjPartidosSel = [];

// ── Celda del alias con botón de copiar ──
igual("sin alias no hay botón, sólo el guión",
      app.pjAliasCeldaHTML("j1", ""), '<span style="color:var(--text3)">—</span>');
igual("un alias en blanco cuenta como sin alias",
      app.pjAliasCeldaHTML("j1", "   "), '<span style="color:var(--text3)">—</span>');
igual("el guión que pone la tabla tampoco genera botón",
      app.pjAliasCeldaHTML("j1", "—"), '<span style="color:var(--text3)">—</span>');
const celdaAlias = app.pjAliasCeldaHTML("j1", "perez.mp");
check("con alias se muestra el texto", celdaAlias.includes("perez.mp"), celdaAlias);
check("y aparece el botón de copiar", celdaAlias.includes("pjCopiarAlias('j1')"), celdaAlias);
// El onclick recibe el ID, no el alias: así un alias con comillas no puede romper el atributo.
check("el onclick no interpola el alias", !celdaAlias.includes("pjCopiarAlias('perez.mp')"), celdaAlias);

// ── Quién cobra por mes ──
check("GOMEZ cobra por mes",        app.pjEsMensual("j2"));
check("PEREZ no (cobra por partido)", !app.pjEsMensual("j1"));
check("un id que no existe no es mensual", !app.pjEsMensual("no-existe"));

// ── La tabla ──
let htmlTr = app.renderTransferencias();
check("cada fila trae su checkbox tildado",
      (htmlTr.match(/class="pj-jug-cb" checked/g) || []).length >= 1,
      "checkbox por fila no encontrado");
check("y hay un maestro en el encabezado", htmlTr.includes("pj-jug-all"), "sin maestro");
check("las filas arrancan contando para el total", htmlTr.includes('data-incluido="1"'), "sin data-incluido");
check("sin fechas tildadas el encabezado cae en la columna Monto", htmlTr.includes("<th>Monto</th>"), "sin fallback");
check("con 0 fechas, el KPI de partidos incluidos dice 0",
      htmlTr.includes('<div class="stat-val">0</div>'), "el KPI no arrancó en 0");

// ── Filtro de mensuales ──
check("sin filtro, el mensual está en la tabla", htmlTr.includes("GOMEZ"), "GOMEZ no aparece");
app.pjExcluirMensuales = true;
htmlTr = app.renderTransferencias();
check("con el filtro, el mensual desaparece", !htmlTr.includes("GOMEZ"), "GOMEZ sigue estando");
check("y el que cobra por partido se queda", htmlTr.includes("PEREZ"), "PEREZ desapareció");
check("se avisa cuántos quedaron sin mostrar", htmlTr.includes("sin mostrar"), "sin aviso de ocultos");
app.pjExcluirMensuales = false;

// El checkbox del jugador NO toca pjIdsDeSeleccion: la liquidación sigue siendo de a uno con el
// botón de la fila, y esa regla es la que evitó que un premio se cobrara solo.
app.pjPartidosSel = ["p1"];
igual("liquidar un jugador sigue trayendo sólo lo suyo",
      app.pjIdsDeSeleccion([{ jugadorId: "j1", incluido: true, premiosIds: [] }]), ["f-part"]);
app.pjPartidosSel = [];

// ══════════════════════════════════════════════════════════════
seccion("42 · Apodo y mensaje de WhatsApp del comprobante");

app.configJugadores = [
  { idJugador: "j1", nombre: "LENCINA Nicolás", apodo: "Nico",  frecuencia: "partido", premios: [] },
  { idJugador: "j2", nombre: "GOMEZ Pablo",     apodo: "",      frecuencia: "mensual", premios: [] },
  { idJugador: "j3", nombre: "PEREZ Juan",      apodo: "   ",   frecuencia: "partido", premios: [] }
];

igual("con apodo cargado, saluda por el apodo",  app.compSaludoJugador("j1", "LENCINA Nicolás"), "Nico");
igual("sin apodo, cae al nombre completo",       app.compSaludoJugador("j2", "GOMEZ Pablo"),     "GOMEZ Pablo");
igual("un apodo de puros espacios no cuenta",    app.compSaludoJugador("j3", "PEREZ Juan"),      "PEREZ Juan");
igual("un jugador sin ficha usa el nombre que traiga el comprobante",
      app.compSaludoJugador("no-existe", "Alguien"), "Alguien");

igual("el mensaje es exactamente el pedido",
      app.compMensajeWhatsApp("Nico"),
      "Hola Nico, esto te va a estar llegando hoy. Cualquier cosa avisame. Abrazo.");
// El monto vive en la imagen del comprobante, no en el texto: si estuviera en los dos lados,
// tarde o temprano uno de los dos quedaría desactualizado.
check("el texto no repite el monto ni el período",
      !/\$|total|liquidaci/i.test(app.compMensajeWhatsApp("Nico")),
      app.compMensajeWhatsApp("Nico"));

// ══════════════════════════════════════════════════════════════
seccion("43 · Envío de comprobantes en lote");

app.configJugadores = [
  { idJugador: "j1", nombre: "PEREZ",  celular: "3492 123456", frecuencia: "partido", premios: [] },
  { idJugador: "j2", nombre: "GOMEZ",  celular: "123",         frecuencia: "partido", premios: [] },
  { idJugador: "j3", nombre: "LOPEZ",  celular: "",            frecuencia: "partido", premios: [] }
];

// ── Quién puede recibir ──
igual("con celular válido no hay bloqueo", app.pjLoteMotivoBloqueo("j1"), "");
check("un celular inválido frena",  app.pjLoteMotivoBloqueo("j2").includes("no es un número válido"), app.pjLoteMotivoBloqueo("j2"));
check("sin celular también frena",  app.pjLoteMotivoBloqueo("j3").includes("no tiene celular cargado"), app.pjLoteMotivoBloqueo("j3"));
check("un jugador sin ficha de cobro frena", app.pjLoteMotivoBloqueo("nadie").includes("no tiene cobro configurado"),
      app.pjLoteMotivoBloqueo("nadie"));

// ── La contabilidad de la cola ──
const lote = { items: [{jugadorId:"j1",nombre:"PEREZ"},{jugadorId:"j2",nombre:"GOMEZ"},{jugadorId:"j3",nombre:"LOPEZ"}],
               i: 0, enviados: [], salteados: [] };
app.pjLoteAvanzar(lote, "enviado");
igual("el enviado queda registrado", lote.enviados.map(e => e.nombre), ["PEREZ"]);
igual("y la cola avanza", lote.i, 1);

app.pjLoteAvanzar(lote, "salteado", "no tiene celular cargado");
igual("el salteado guarda el motivo", lote.salteados, [{ nombre: "GOMEZ", motivo: "no tiene celular cargado" }]);
igual("y no cuenta como enviado", lote.enviados.map(e => e.nombre), ["PEREZ"]);

app.pjLoteAvanzar(lote, "enviado");
igual("al terminar, enviados + salteados = total",
      lote.enviados.length + lote.salteados.length, lote.items.length);
igual("la cola quedó al final", lote.i, 3);

// Pasado el final no sigue acumulando: sin esto, un doble clic en "Siguiente" duplicaba un nombre.
app.pjLoteAvanzar(lote, "enviado");
igual("avanzar de más no agrega nada", lote.enviados.length + lote.salteados.length, 3);
igual("ni mueve el índice", lote.i, 3);

// Un motivo vacío no deja el resumen mudo.
const lote2 = { items: [{jugadorId:"j1",nombre:"PEREZ"}], i: 0, enviados: [], salteados: [] };
app.pjLoteAvanzar(lote2, "salteado");
igual("saltear sin motivo deja uno por defecto", lote2.salteados[0].motivo, "salteado");

// La barra sólo aparece con una cola en curso.
app.pjLote = null;
igual("sin lote no hay barra", app.pjLoteBarraHTML(), "");
app.pjLote = { items: [{jugadorId:"j1",nombre:"PEREZ"},{jugadorId:"j2",nombre:"GOMEZ"}], i: 0, enviados: [], salteados: [] };
check("con lote muestra la posición", app.pjLoteBarraHTML().includes("1 de 2"), app.pjLoteBarraHTML());
check("y ofrece seguir", app.pjLoteBarraHTML().includes("Siguiente"), "");
app.pjLote.i = 1;
check("en el último dice Terminar", app.pjLoteBarraHTML().includes("Terminar"), app.pjLoteBarraHTML());
app.pjLote.i = 2;
igual("terminada la cola la barra desaparece", app.pjLoteBarraHTML(), "");
app.pjLote = null;

// ══════════════════════════════════════════════════════════════
seccion("44 · Mensaje para el chat de Mercado Pago");

const enviadosMP = [
  { jugadorId: "j1", nombre: "BERNAUS",  alias: "federico.bernaus", monto: 170000 },
  { jugadorId: "j2", nombre: "CARRANZA", alias: "maticarranza04",   monto: 110000 },
  { jugadorId: "j3", nombre: "DIAZ",     alias: "jonatandv7",       monto: 300000 }
];

igual("el mensaje sale con el formato que pide Mercado Pago",
      app.pjLoteMensajeMP(enviadosMP, "10/09/2026"),
      "Fecha: 10/09/2026\n\n" +
      "1. alias: federico.bernaus — monto: $170.000\n" +
      "2. alias: maticarranza04 — monto: $110.000\n" +
      "3. alias: jonatandv7 — monto: $300.000");

// ── El alias tiene que ser usable ──
igual("un alias normal pasa",        app.pjAliasParaMP("federico.bernaus"), "federico.bernaus");
igual("el guión de la tabla no",     app.pjAliasParaMP("—"), "");
igual("un guión común tampoco",      app.pjAliasParaMP("-"), "");
igual("vacío tampoco",               app.pjAliasParaMP("   "), "");
igual("se le sacan los espacios",    app.pjAliasParaMP("  mati.mp  "), "mati.mp");

// Quien no tiene alias no genera línea —Mercado Pago la rechazaría sin decir cuál— pero se avisa
// aparte para que no desaparezca en silencio.
const conUnoSinAlias = [...enviadosMP, { jugadorId: "j4", nombre: "SIN ALIAS", alias: "—", monto: 50000 }];
check("el que no tiene alias no entra en el mensaje",
      !app.pjLoteMensajeMP(conUnoSinAlias, "10/09/2026").includes("50.000"),
      app.pjLoteMensajeMP(conUnoSinAlias, "10/09/2026"));
igual("la numeración no deja huecos",
      app.pjLoteMensajeMP(conUnoSinAlias, "10/09/2026").split("\n").filter(l => /^\d+\./.test(l)).length, 3);
igual("y se lo reporta aparte",
      app.pjLoteSinAlias(conUnoSinAlias).map(e => e.nombre), ["SIN ALIAS"]);
igual("sin faltantes la lista viene vacía", app.pjLoteSinAlias(enviadosMP), []);

// ── Prompt "Transferir lo siguiente" (botón de la tabla, desde los tildados) ──
igual("el prompt de transferencias sale con el formato pedido",
      app.pjMensajeTransferenciasMP(enviadosMP),
      "Transferir lo siguiente\n" +
      "1. alias: federico.bernaus — monto: $170.000\n" +
      "2. alias: maticarranza04 — monto: $110.000\n" +
      "3. alias: jonatandv7 — monto: $300.000");
igual("los sin alias van al final, marcados",
      app.pjMensajeTransferenciasMP([conUnoSinAlias[3], ...enviadosMP]).split("\n").pop(),
      "4. alias: ⚠️ SIN ALIAS (SIN ALIAS) — monto: $50.000");
check("un total en cero no entra",
      !app.pjMensajeTransferenciasMP([...enviadosMP, { nombre: "X", alias: "x.mp", monto: 0 }]).includes("x.mp"));

// Los montos se formatean como plata argentina, sin decimales.
igual("un monto con centavos se redondea al peso",
      app.pjLoteMensajeMP([{ alias: "x.y", monto: 170000.4 }], "10/09/2026"),
      "Fecha: 10/09/2026\n\n1. alias: x.y — monto: $170.000");

// Mercado Pago exige fecha futura: el default del modal es mañana, no hoy.
check("la fecha por defecto es posterior a hoy", app.manana() > app.today(),
      app.manana() + " vs " + app.today());

// ══════════════════════════════════════════════════════════════
seccion("45 · Recordatorio de sueldo mensual");

// ── El día real de cobro: el 31 no existe en todos los meses ──
igual("un día normal queda igual",        app.recordFechaCobro("2026-09", 15), "2026-09-15");
igual("el 31 en septiembre (30 días) cae al 30", app.recordFechaCobro("2026-09", 31), "2026-09-30");
igual("el 31 en febrero cae al 28",       app.recordFechaCobro("2026-02", 31), "2026-02-28");
igual("y en un febrero bisiesto al 29",   app.recordFechaCobro("2028-02", 31), "2028-02-29");
igual("un día menor a 1 se lleva al 1",   app.recordFechaCobro("2026-09", 0),  "2026-09-01");

igual("los días se cuentan derecho",      app.recordDiasEntre("2026-09-09", "2026-09-15"), 6);
igual("y en negativo cuando ya pasó",     app.recordDiasEntre("2026-09-20", "2026-09-15"), -5);
// Cruce de mes: sin esto, un cobro del 1 visto desde el 29 daba cualquier cosa.
igual("cruzando el mes también",          app.recordDiasEntre("2026-08-30", "2026-09-01"), 2);

// ── Cuándo aparece ──
app.configJugadores = [
  { idJugador: "m1", nombre: "PEREZ", frecuencia: "mensual", diaPago: 15, premios: [] },
  { idJugador: "m2", nombre: "GOMEZ", frecuencia: "mensual", diaPago: 0,  premios: [] },  // sin día
  { idJugador: "p1", nombre: "LOPEZ", frecuencia: "partido", diaPago: 15, premios: [] }   // no es mensual
];
app.pagosJugadores = [];

const recNombres = h => app.recordatoriosSueldo(h).map(r => r.nombre);
igual("faltando 10 días todavía no avisa", recNombres("2026-09-05"), []);
igual("faltando 3 días ya avisa",          recNombres("2026-09-12"), ["PEREZ"]);
igual("el día del pago sigue avisando",    recNombres("2026-09-15"), ["PEREZ"]);
igual("y vencido también",                 recNombres("2026-09-20"), ["PEREZ"]);
check("sin día de cobro nunca avisa",      !recNombres("2026-09-12").includes("GOMEZ"));
check("un jugador por partido tampoco",    !recNombres("2026-09-12").includes("LOPEZ"));

// ── Los dos estados ──
igual("sin filas del mes, el aviso es que falta CARGAR el monto",
      app.recordatoriosSueldo("2026-09-12")[0].estado, "sin-cargar");

app.pagosJugadores = [
  { id: "f1", jugadorId: "m1", jugadorNombre: "PEREZ", mes: "2026-09", tipo: "periodico",
    montoFinal: 180000, estado: "pendiente", partidosIncluidos: [], etiqueta: "", partidoId: "" }
];
const conFila = app.recordatoriosSueldo("2026-09-12")[0];
igual("cargado y sin pagar, el aviso es de PAGO", conFila.estado, "pendiente");
igual("y lleva el monto pendiente", conFila.monto, 180000);

app.pagosJugadores[0].estado = "pagado";
igual("pagado el mes, deja de avisar", recNombres("2026-09-12"), []);
igual("y tampoco avisa aunque esté vencido", recNombres("2026-09-25"), []);

// ── Los textos ──
igual("hoy",        app.recordCuandoTxt(0),  "hoy");
igual("mañana",     app.recordCuandoTxt(1),  "mañana");
igual("en N días",  app.recordCuandoTxt(3),  "en 3 días");
igual("ayer",       app.recordCuandoTxt(-1), "venció ayer");
igual("hace N días",app.recordCuandoTxt(-4), "venció hace 4 días");

app.pagosJugadores[0].estado = "pendiente";
check("el texto de pago nombra al jugador y el monto",
      app.recordTextoAviso(app.recordatoriosSueldo("2026-09-12")[0]).includes("PEREZ"), "");
app.pagosJugadores = [];
check("el texto de 'falta cargar' dice justamente eso",
      app.recordTextoAviso(app.recordatoriosSueldo("2026-09-12")[0]).startsWith("Falta cargar"),
      app.recordTextoAviso(app.recordatoriosSueldo("2026-09-12")[0]));

// ── Ocultar dura un día ──
app.localStorage.removeItem(app.RECORD_OCULTOS_KEY);
igual("sin nada oculto la lista viene vacía", app.recordOcultosHoy("2026-09-12"), []);
app.recordOcultar("m1", "2026-09-12");
igual("ocultado hoy queda registrado",  app.recordOcultosHoy("2026-09-12"), ["m1"]);
igual("pero mañana vuelve a aparecer",  app.recordOcultosHoy("2026-09-13"), []);
app.recordOcultar("m1", "2026-09-12");
igual("ocultar dos veces no lo duplica", app.recordOcultosHoy("2026-09-12"), ["m1"]);
app.localStorage.removeItem(app.RECORD_OCULTOS_KEY);

// ══════════════════════════════════════════════════════════════
seccion("46 · Resumen > Reintegros: buscador y orden de columnas");

// Rubro 21 = médico. El EGRESO marcado con seguroReintegro es lo que el seguro debería devolver;
// el INGRESO vinculado es lo que volvió.
app.reintegroFiltro = ""; app.reintegroOrdenCol = ""; app.reintegroOrdenDir = -1;
app.reintegroAnio = "2026";
app.movimientos = [
  // PEREZ: abonó 100.000 y no volvió nada → SIN
  { id:"e1", tipo:"EGRESO", fecha:"2026-05-10", codRubro:"21", jugadorCT:"PEREZ Juan",
    egreso:100000, ingreso:0, seguroReintegro:1, concepto:"Kinesiología", vinculos:[] },
  // ÁLVAREZ: abonó 60.000 y le reintegraron todo → OK
  { id:"e2", tipo:"EGRESO", fecha:"2026-05-12", codRubro:"21", jugadorCT:"Álvarez Bea",
    egreso:60000, ingreso:0, seguroReintegro:1, concepto:"Estudios", vinculos:[] },
  { id:"i2", tipo:"INGRESO", fecha:"2026-06-01", codRubro:"21", jugadorCT:"Álvarez Bea",
    egreso:0, ingreso:60000, concepto:"Reintegro", vinculos:[{ egresoId:"e2", monto:60000 }] },
  // GOMEZ: abonó 200.000 y volvió la mitad → PARCIAL
  { id:"e3", tipo:"EGRESO", fecha:"2026-05-20", codRubro:"21", jugadorCT:"GOMEZ Ana",
    egreso:200000, ingreso:0, seguroReintegro:1, concepto:"Traumatólogo", vinculos:[] },
  { id:"i3", tipo:"INGRESO", fecha:"2026-06-05", codRubro:"21", jugadorCT:"GOMEZ Ana",
    egreso:0, ingreso:50000, concepto:"Reintegro parcial", vinculos:[{ egresoId:"e3", monto:50000 }] }
];

const reintNombres = () => app.filasReintegros().map(r => r.jugador);
igual("sin filtro salen los tres",
      reintNombres().slice().sort((a,b) => a.localeCompare(b, "es")),
      ["Álvarez Bea", "GOMEZ Ana", "PEREZ Juan"]);

app.reintegroFiltro = "gomez";
igual("el buscador filtra por jugador", reintNombres(), ["GOMEZ Ana"]);
app.reintegroFiltro = "GOMEZ";
igual("no distingue mayúsculas", reintNombres(), ["GOMEZ Ana"]);
app.reintegroFiltro = "alvarez";
igual("ni acentos", reintNombres(), ["Álvarez Bea"]);
app.reintegroFiltro = "zzz";
igual("un nombre inexistente no devuelve nada", reintNombres(), []);
app.reintegroFiltro = "";

// ── Orden ──
const reintOrden = () => app.ordenarReintegros(app.filasReintegros()).map(r => r.jugador);
igual("sin columna elegida manda el default: más pendiente primero",
      reintOrden(), ["GOMEZ Ana", "PEREZ Juan", "Álvarez Bea"]);

app.reintegroOrdenCol = "abonado"; app.reintegroOrdenDir = -1;
igual("por Abonado, mayor a menor", reintOrden(), ["GOMEZ Ana", "PEREZ Juan", "Álvarez Bea"]);
app.reintegroOrdenDir = 1;
igual("el segundo clic invierte", reintOrden(), ["Álvarez Bea", "PEREZ Juan", "GOMEZ Ana"]);

app.reintegroOrdenCol = "jugador"; app.reintegroOrdenDir = 1;
igual("por nombre, alfabético ignorando acentos",
      reintOrden(), ["Álvarez Bea", "GOMEZ Ana", "PEREZ Juan"]);

// Estado: el primer clic (mayor a menor) tiene que dejar arriba al que no cobró nada.
app.reintegroOrdenCol = "estado"; app.reintegroOrdenDir = -1;
igual("por Estado, lo más urgente primero",
      app.ordenarReintegros(app.filasReintegros()).map(r => r.estado), ["SIN", "PARCIAL", "OK"]);

// El pendiente se ordena por el mismo número que muestra la tabla (con piso en 0), no por el
// crudo: un saldo a favor no es una deuda negativa que deba quedar última.
const filaOK = app.filasReintegros().find(r => r.jugador === "Álvarez Bea");
igual("un pendiente saldado vale 0 al ordenar", app.reintegroOrdenValor(filaOK, "pendiente"), 0);

// Filtro y orden se combinan sin pisarse.
app.reintegroFiltro = "e"; app.reintegroOrdenCol = "abonado"; app.reintegroOrdenDir = -1;
igual("filtro + orden juntos", reintOrden(), ["GOMEZ Ana", "PEREZ Juan", "Álvarez Bea"]);
app.reintegroFiltro = ""; app.reintegroOrdenCol = "";

// ══════════════════════════════════════════════════════════════
seccion("47 · Reintegros: período (3 meses / historial) y datos del PDF");

igual("hace 3 meses desde el 29/09", app.reintegroDesde3m("2026-09-29"), "2026-06-29");
igual("cruza el año", app.reintegroDesde3m("2026-02-15"), "2025-11-15");
check("un gasto de hace 2 meses entra en 3m",  app.reintegroEnPeriodo("2026-08-01", "3m", "2026-09-29"));
check("uno de hace 4 meses no",               !app.reintegroEnPeriodo("2026-05-20", "3m", "2026-09-29"));
check("el historial trae todo",                app.reintegroEnPeriodo("2019-01-01", ""));
check("por año sigue andando",                 app.reintegroEnPeriodo("2025-03-01", "2025") && !app.reintegroEnPeriodo("2026-03-01", "2025"));

app.reintegroFiltro = ""; app.reintegroAnio = "";
app.movimientos = [
  { id:"a1", tipo:"EGRESO", fecha:"2026-03-12", codRubro:"21", jugadorCT:"PEREZ", egreso:25000, seguroReintegro:1, concepto:"Consulta", vinculos:[] },
  { id:"a2", tipo:"EGRESO", fecha:"2026-05-02", codRubro:"21", jugadorCT:"PEREZ", egreso:90000, seguroReintegro:1, concepto:"Resonancia", vinculos:[] },
  { id:"a3", tipo:"EGRESO", fecha:"2026-05-03", codRubro:"21", jugadorCT:"PEREZ", egreso:6200,  seguroReintegro:0, concepto:"Venda", vinculos:[] },
  { id:"ai", tipo:"INGRESO", fecha:"2026-04-01", codRubro:"21", jugadorCT:"PEREZ", ingreso:25000, concepto:"Reintegro", vinculos:[{ egresoId:"a1", monto:25000 }] },
  { id:"b1", tipo:"EGRESO", fecha:"2026-05-10", codRubro:"21", jugadorCT:"OK", egreso:1000, seguroReintegro:1, concepto:"x", vinculos:[] },
  { id:"bi", tipo:"INGRESO", fecha:"2026-05-11", codRubro:"21", jugadorCT:"OK", ingreso:1000, concepto:"r", vinculos:[{ egresoId:"b1", monto:1000 }] }
];
const pdf = app.reintPdfDatos(app.filasReintegros(), app.buildVinculosIndex().porEgreso);
igual("sólo los jugadores con pendiente", pdf.jugadores.map(j => j.jugador), ["PEREZ"]);
igual("una fila por gasto, sin las filas de ingreso", pdf.jugadores[0].filas.map(f => f.movimiento), ["Consulta", "Resonancia", "Venda"]);
igual("se resalta sólo el que tiene Reintegrado = $0 y seguro", pdf.jugadores[0].filas.map(f => f.pendiente), [false, true, false]);
igual("el gasto sin seguro no aplica", pdf.jugadores[0].filas[2].conSeguro, false);
igual("total pendiente", pdf.totalPendiente, 90000);
igual("gastos sin reintegrar", pdf.gastosSinReintegrar, 1);
igual("totales de la sección", [pdf.jugadores[0].totMonto, pdf.jugadores[0].totReintegrado], [121200, 25000]);

// Con "últimos 3 meses" (al 29/09) el gasto de marzo y el de mayo quedan afuera: sin pendiente, no hay PDF.
const rows3m = app.calcReintegrosPorJugador("3m").filter(r => r.pendiente > 0);
check("en 3 meses no queda nada de mayo para atrás", rows3m.every(r => r.movs.filter(m => m.tipo === "EGRESO").every(m => m.fecha >= app.reintegroDesde3m())));
app.reintegroAnio = "3m";

// ══════════════════════════════════════════════════════════════
seccion("48 · Comprobantes adjuntos");

igual("una foto de celular vertical baja a 1600 de alto", app.adjDimensionesDestino(3000, 4000), { w: 1200, h: 1600 });
igual("una horizontal, a 1600 de ancho",               app.adjDimensionesDestino(4032, 3024), { w: 1600, h: 1200 });
igual("una chica no se agranda",                        app.adjDimensionesDestino(800, 600),   { w: 800,  h: 600 });
igual("exactamente 1600 queda igual",                   app.adjDimensionesDestino(1600, 900),  { w: 1600, h: 900 });
igual("sin dimensiones no revienta",                    app.adjDimensionesDestino(0, 0),       { w: 0,    h: 0 });

igual("la foto re-codificada viaja como .jpg",      app.adjNombreSubida("IMG_2034.HEIC", "image/jpeg"), "IMG_2034.jpg");
igual("el PDF conserva su extensión",               app.adjNombreSubida("orden medica.pdf", "application/pdf"), "orden medica.pdf");
igual("sin nombre, 'comprobante'",                  app.adjNombreSubida("", "image/png"), "comprobante.png");
igual("un nombre con puntos sólo pierde la última", app.adjNombreSubida("ticket.farmacia.png", "image/jpeg"), "ticket.farmacia.jpg");

const gasto = { tipo: "EGRESO", seguroReintegro: 1, adjuntos: [] };
check("gasto con reintegro sin archivos → aviso 'sin comprobante'", app.reintegroSinComprobante(gasto));
check("con un adjunto ya no",        !app.reintegroSinComprobante({ ...gasto, adjuntos: [{ id: "f1" }] }));
check("sin reintegro no se avisa",   !app.reintegroSinComprobante({ ...gasto, seguroReintegro: 0 }));
check("un ingreso no se avisa",      !app.reintegroSinComprobante({ ...gasto, tipo: "INGRESO" }));
check("un movimiento viejo sin el campo adjuntos se toma como sin comprobante",
      app.reintegroSinComprobante({ tipo: "EGRESO", seguroReintegro: 1 }));

igual("sincronizado y con conexión se puede adjuntar", app.adjMotivoNoDisponible({ id: "m1" }), null);
check("pendiente de sincronizar no", /sincronizado/.test(app.adjMotivoNoDisponible({ id: "m1", _pending: true })));
app.navigator.onLine = false;
check("sin conexión no", /sincronizado/.test(app.adjMotivoNoDisponible({ id: "m1" })));
app.navigator.onLine = true;

// El detalle por jugador de Reintegros: 📎 que abre el archivo, y el aviso en el que no tiene.
const filaCon = app.renderMovGrupoRow({ id: "g1", tipo: "EGRESO", fecha: "2026-08-14", egreso: 1000, seguroReintegro: 1, concepto: "RX",
  adjuntos: [{ id: "f1", nombre: "rx.jpg", url: "https://drive.google.com/file/d/f1/view", mime: "image/jpeg" }] }, "EGRESO", false);
check("el gasto con adjunto muestra el 📎 con el link", filaCon.includes("📎") && filaCon.includes("drive.google.com/file/d/f1"));
check("y no el aviso", !filaCon.includes("sin comprobante"));
const filaSin = app.renderMovGrupoRow({ id: "g2", tipo: "EGRESO", fecha: "2026-08-14", egreso: 1000, seguroReintegro: 1, concepto: "RX" }, "EGRESO", false);
check("el que no tiene muestra 'sin comprobante'", filaSin.includes("sin comprobante") && !filaSin.includes("📎"));

// Alta desde el formulario: sólo el egreso del rubro 21 pregunta si se guarda sin adjunto.
const Fprev = app.F;
app.F = { ...app.buildDefaultF(), codRubro: "21", tipo: "EGRESO" };
check("egreso 21 sin archivos → pregunta",            app.faltaAdjuntoGastoMedico([], false));
check("con un archivo elegido no",                    !app.faltaAdjuntoGastoMedico([{ name: "rx.jpg" }], false));
check("editando no (igual que el aviso del reintegro)", !app.faltaAdjuntoGastoMedico([], true));
app.F.tipo = "INGRESO";
check("un ingreso del 21 no",                         !app.faltaAdjuntoGastoMedico([], false));
app.F = { ...app.buildDefaultF(), codRubro: "6", tipo: "EGRESO" };
check("otro rubro no",                                !app.faltaAdjuntoGastoMedico([], false));
app.F = { ...app.buildDefaultF(), codRubro: "21", tipo: "EGRESO" };
app.adjFormArchivos = [{ name: "orden.pdf", type: "application/pdf", size: 20480 }];
const campo = app.renderAdjFormField();
check("el formulario muestra el botón y lo elegido", campo.includes("Adjuntar archivo") && campo.includes("orden.pdf") && campo.includes("20 KB"));
app.resetF();
igual("resetF descarta lo elegido", app.adjFormArchivos.length, 0);
app.F = Fprev;

// ══════════════════════════════════════════════════════════════
seccion("49 · Movimientos: filtro por columna estilo Excel");

app.sharedMes = "2026-09";
app.listFiltros = { rubro: "", cat: "", cuenta: "", tipo: "", adherente: "", jugadorCT: "", partido: "", evento: "", search: "" };
app.movColFiltros = {};
app.movimientos = [
  { id: "c1", tipo: "INGRESO", fecha: "2026-09-01", mes: "202609", rubro: "ENTRADAS", categoria: "Cancha", concepto: "Entradas", ingreso: 1000, egreso: 0, montoFinal: 1000, cuenta: "EFECTIVO" },
  { id: "c2", tipo: "EGRESO",  fecha: "2026-09-02", mes: "202609", rubro: "ARBITROS", categoria: "Cancha", concepto: "Terna",    ingreso: 0, egreso: 400, montoFinal: 400,  cuenta: "EFECTIVO" },
  { id: "c3", tipo: "EGRESO",  fecha: "2026-09-02", mes: "202609", rubro: "ARBITROS", categoria: "Cancha", concepto: "Terna 2",  ingreso: 0, egreso: 400, montoFinal: 400,  cuenta: "MACRO", jugadorCT: "PEREZ" },
  { id: "c4", tipo: "INTERNO", fecha: "2026-09-03", mes: "202609", rubro: "TRANSFERENCIA", categoria: "Internos", concepto: "Depósito", ingreso: 0, egreso: 500, montoFinal: 500, cuenta: "EFECTIVO", cuentaDestino: "MACRO" },
  { id: "c5", tipo: "INGRESO", fecha: "2026-08-30", mes: "202608", rubro: "ENTRADAS", categoria: "Cancha", concepto: "Otro mes", ingreso: 9, egreso: 0, montoFinal: 9, cuenta: "EFECTIVO" }
];
const ids2 = () => app.getMovimientosFiltrados().map(m => m.id).sort();
igual("sin filtros, todo el mes", ids2(), ["c1", "c2", "c3", "c4"]);

igual("valores distintos de Rubro con su cantidad",
      app.movColValoresDistintos(app.getMovimientosFiltrados("rubro"), "rubro").map(v => v.etiqueta + ":" + v.cantidad),
      ["ARBITROS:2", "ENTRADAS:1", "TRANSFERENCIA:1"]);
igual("la cuenta de un interno es 'ORIGEN → DESTINO', como en la celda",
      app.movColValoresDistintos(app.movimientos.slice(0, 4), "cuenta").map(v => v.valor), ["EFECTIVO", "EFECTIVO → MACRO", "MACRO"]);
igual("montos con signo y ordenados de menor a mayor",
      app.movColValoresDistintos(app.movimientos.slice(0, 4), "monto").map(v => v.etiqueta), [-500, -400, 1000].map(n => (n < 0 ? "-" : "+") + app.fmt(Math.abs(n))));
igual("(Vacías) va al final", app.movColValoresDistintos(app.movimientos.slice(0, 4), "entidad").map(v => v.etiqueta), ["PEREZ", "(Vacías)"]);

app.movColFiltros = { rubro: new Set(["ARBITROS"]) };
igual("filtrar un rubro deja sólo esos", ids2(), ["c2", "c3"]);
check("y cuenta como filtro activo (la nota de KPIs lo muestra)", app.listFiltrosActive());
app.movColFiltros.cuenta = new Set(["MACRO"]);
igual("dos columnas se combinan (Y)", ids2(), ["c3"]);
igual("los valores de Cuenta salen de lo que dejan las OTRAS columnas, no de sí misma",
      app.movColValoresDistintos(app.getMovimientosFiltrados("cuenta"), "cuenta").map(v => v.valor), ["EFECTIVO", "MACRO"]);
app.movColFiltros = { entidad: new Set([""]) };
igual("se puede filtrar por (Vacías)", ids2(), ["c1", "c2", "c4"]);

app.movColFiltros = { fecha: new Set(["2026-09-02"]), rubro: new Set(["ARBITROS"]) };
app.changeMes(-1);
check("cambiar de mes descarta el filtro de fecha", !("fecha" in app.movColFiltros));
check("pero conserva el de rubro", "rubro" in app.movColFiltros);
const renderMovPrev = app.renderMovimientos;
app.renderMovimientos = () => {};   // sin DOM en las pruebas
app.clearListFilters();
app.renderMovimientos = renderMovPrev;
igual("'Ver mes completo' limpia también los de columna", Object.keys(app.movColFiltros), []);
app.sharedMes = "2026-09";

seccion("50 · Movimientos: el texto de la tabla también filtra los KPIs");
app.movColFiltros = {};
app.detTablaCols.movlist = app.MOV_TABLE_COLS;
app.detTablaGetState("movlist").filtro = "terna";
app.movVista = "tabla";
igual("en vista tabla, el texto recorta lo que suman los KPIs", ids2(), ["c2", "c3"]);
igual("sinTexto devuelve la base que recibe la tabla (para poder borrar letras)",
      app.getMovimientosFiltrados(undefined, true).map(m => m.id).sort(), ["c1", "c2", "c3", "c4"]);
check("cuenta como filtro activo", app.listFiltrosActive());
app.detTablaGetState("movlist").filtro = "02/09/2026";
igual("busca en lo que muestra la celda (la fecha como dd/mm/aaaa)", ids2(), ["c2", "c3"]);
app.detTablaGetState("movlist").filtro = "efectivo → macro";
igual("y en la cuenta de un interno", ids2(), ["c4"]);
app.detTablaGetState("movlist").filtro = "400";
igual("no busca en el monto (igual que la tabla)", ids2(), []);
app.detTablaGetState("movlist").filtro = "perez";
app.detTablaGetHidden("movlist").add("entidad");
igual("ni en una columna oculta", ids2(), []);
app.detTablaGetHidden("movlist").delete("entidad");
igual("al volver a mostrarla, sí", ids2(), ["c3"]);
app.movColFiltros = { cuenta: new Set(["MACRO"]) };
igual("se combina con los filtros de columna", ids2(), ["c3"]);
app.movVista = "tarjetas";
check("en tarjetas el campo no se ve, así que no filtra", ids2().length === 1 && !app.movTextoTablaActivo());
app.movVista = "tabla";
app.renderMovimientos = () => {};
app.clearListFilters();
app.renderMovimientos = renderMovPrev;
igual("'Ver mes completo' borra también el texto", app.detTablaGetState("movlist").filtro, "");

// ══════════════════════════════════════════════════════════════
seccion("51 · Filtro Excel: componente compartido");
const vals3 = [{ valor: "a" }, { valor: "b" }, { valor: "c" }];
igual("todo tildado = sin filtro (null)", app.filtroExcelResultado(vals3, new Set(["a", "b", "c"])), null);
igual("una parte = Set con esos", [...app.filtroExcelResultado(vals3, new Set(["a", "c"]))], ["a", "c"]);
igual("valoresDistintos cuenta y pone (Vacías) al final",
      app.valoresDistintos([{ x: "b" }, { x: "" }, { x: "a" }, { x: "b" }], it => it.x).map(v => v.etiqueta + ":" + v.cantidad),
      ["a:1", "b:2", "(Vacías):1"]);

seccion("52 · Resumen > Reportes: Categorías y Rubros");
app.movimientos = [
  { id: "r1", tipo: "EGRESO",  fecha: "2026-05-02", mes: "202605", categoria: "Gastos cancha", codRubro: "8",  rubro: "ARBITRAJE", egreso: 40000, ingreso: 0, cuenta: "CAJA", concepto: "Terna" },
  { id: "r2", tipo: "EGRESO",  fecha: "2026-05-03", mes: "202605", categoria: "Gastos cancha", codRubro: "9",  rubro: "SEGURIDAD", egreso: 20000, ingreso: 0, cuenta: "CAJA", concepto: "Policía" },
  { id: "r3", tipo: "EGRESO",  fecha: "2026-05-04", mes: "202605", categoria: "Gastos Medicos", codRubro: "21", rubro: "GASTOS MEDICOS", egreso: 30000, ingreso: 0, cuenta: "MACRO", concepto: "RX" },
  { id: "r4", tipo: "INGRESO", fecha: "2026-05-05", mes: "202605", categoria: "Ingresos de cancha", codRubro: "1", rubro: "ENTRADAS", egreso: 0, ingreso: 150000, cuenta: "CAJA", concepto: "Entradas" }
];
app.reportesState = { anio: "2026", meses: ["2026-05"], cuentas: [], filtroCat: null, filtroRubro: null,
                      jugadorCT: "", adherente: "", search: "", catExpandido: new Set(), rubroExpandido: new Set() };
const repIds = () => app.getMovimientosReportes().map(m => m.id);
igual("sin filtros, todo", repIds(), ["r1", "r2", "r3", "r4"]);
igual("categorías disponibles con su cantidad", app.repFiltroValores("cat").map(v => v.etiqueta + ":" + v.cantidad),
      ["Gastos cancha:2", "Gastos Medicos:1", "Ingresos de cancha:1"]);
app.reportesState.filtroCat = new Set(["Gastos cancha", "Gastos Medicos"]);
igual("varias categorías a la vez (antes era una sola)", repIds(), ["r1", "r2", "r3"]);
igual("los rubros ofrecidos son sólo los de esas categorías", app.repFiltroValores("rubro").map(v => v.etiqueta),
      ["ARBITRAJE", "GASTOS MEDICOS", "SEGURIDAD"]);
app.reportesState.filtroRubro = new Set(["8", "21"]);
igual("rubro por código, combinado con categoría", repIds(), ["r1", "r3"]);
igual("el botón resume 'n de total'", app.repFiltroResumen("rubro"), "2 de 3");
const cuerpoRep = app.renderReportesBody();
check("el TOTAL de la tabla suma sólo lo filtrado", cuerpoRep.includes(app.fmt(70000)) && !cuerpoRep.includes(app.fmt(150000)));
app.reportesState.filtroCat = new Set(["Gastos cancha"]);
igual("un rubro tildado de otra categoría no se cuenta en el resumen", app.repFiltroResumen("rubro"), "1 de 2");
app.reportesState.filtroCat = null; app.reportesState.filtroRubro = null;
igual("sin filtros vuelve todo", repIds().length, 4);

seccion("52b · Resumen > Reportes: filtro de Conceptos y nivel de la tabla");
app.movimientos.push({ id: "r5", tipo: "EGRESO", fecha: "2026-05-06", mes: "202605", categoria: "Gastos cancha", codRubro: "8", rubro: "ARBITRAJE", egreso: 10000, ingreso: 0, cuenta: "CAJA", concepto: " Terna " });
igual("conceptos disponibles con su cantidad (sin contar espacios de más)", app.repFiltroValores("concepto").map(v => v.etiqueta + ":" + v.cantidad),
      ["Entradas:1", "Policía:1", "RX:1", "Terna:2"]);
igual("sin filtro el botón dice Todos", app.repFiltroResumen("concepto"), "Todos");
app.reportesState.filtroConcepto = new Set(["Terna", "RX"]);
igual("varios conceptos a la vez", repIds(), ["r1", "r3", "r5"]);
igual("el botón resume 'n de total'", app.repFiltroResumen("concepto"), "2 de 4");
igual("las categorías ofrecidas son sólo las de esos conceptos", app.repFiltroValores("cat").map(v => v.etiqueta), ["Gastos cancha", "Gastos Medicos"]);
igual("y los rubros también", app.repFiltroValores("rubro").map(v => v.etiqueta), ["ARBITRAJE", "GASTOS MEDICOS"]);
app.reportesState.filtroCat = new Set(["Gastos cancha"]);
igual("concepto combinado con categoría", repIds(), ["r1", "r5"]);
igual("los conceptos ofrecidos son sólo los de esa categoría", app.repFiltroValores("concepto").map(v => v.etiqueta), ["Policía", "Terna"]);
check("el TOTAL suma sólo los conceptos elegidos", app.renderReportesBody().includes(app.fmt(50000)) && !app.renderReportesBody().includes(app.fmt(20000)));
app.reportesState.filtroCat = null; app.reportesState.filtroConcepto = null;

const repFilas = () => [...app.renderReportesBody().matchAll(/[▸▾] ([^<]+?) <span/g)].map(x => x[1]);
const repEncabezado = () => app.renderReportesBody().match(/<thead><tr><th[^>]*>([\s\S]*?)<\/th>/)[1].replace(/<button[\s\S]*?<\/button>/g, "");
igual("sin nivel elegido la tabla es la de siempre: categorías", [app.repNivel(), repFilas()],
      ["catrubro", ["Gastos cancha", "Gastos Medicos", "Ingresos de cancha"]]);
igual("con encabezado Categoría / Rubro", repEncabezado(), "Categoría / Rubro");
app.reportesState.catExpandido.add("Gastos cancha");
igual("al abrir una categoría aparecen sus rubros", repFilas(), ["Gastos cancha", "ARBITRAJE", "SEGURIDAD", "Gastos Medicos", "Ingresos de cancha"]);
check("y no todavía los movimientos", !app.renderReportesBody().includes("Policía"));
app.reportesState.nivel = "cat";
igual("sólo Categoría: mismas categorías, sin rubros", repFilas(), ["Gastos cancha", "Gastos Medicos", "Ingresos de cancha"]);
check("la categoría abierta muestra directo sus movimientos", app.renderReportesBody().includes("Policía") && !app.renderReportesBody().includes("SEGURIDAD"));
igual("encabezado Categoría", repEncabezado(), "Categoría");
app.reportesState.nivel = "rubro";
igual("sólo Rubro: una fila por rubro, de mayor a menor egreso", repFilas(), ["ARBITRAJE", "GASTOS MEDICOS", "SEGURIDAD", "ENTRADAS"]);
igual("encabezado Rubro", repEncabezado(), "Rubro");
check("ningún rubro abierto todavía", !app.renderReportesBody().includes("Policía"));
app.reportesState.rubroExpandido.add("||9");
check("el rubro abierto muestra sus movimientos", app.renderReportesBody().includes("Policía") && !app.renderReportesBody().includes("Terna"));
for (const n of ["catrubro", "cat", "rubro"]) {
  app.reportesState.nivel = n;
  const h = app.renderReportesBody();
  check(`nivel ${n}: el TOTAL no cambia`, h.includes(app.fmt(150000)) && h.includes(app.fmt(100000)) && h.includes("5 movimientos"));
}
app.reportesState.filtroConcepto = new Set(["Terna"]);
app.reportesState.nivel = "rubro";
igual("el filtro de conceptos vale en cualquier nivel", repFilas(), ["ARBITRAJE"]);
app.reportesState.filtroConcepto = null;
app.reportesState.nivel = "cualquiera";
igual("un nivel desconocido cae en Categoría / Rubro", app.repNivel(), "catrubro");

const xlsCR = app.reportesFilasExcel(app.getMovimientosReportes(), "catrubro");
igual("Excel Categoría / Rubro: columnas de siempre", xlsCR.headers, ["Categoría", "Rubro", "Fecha", "Concepto", "Ingreso", "Egreso", "Cuenta"]);
igual("categoría, rubro y movimientos por fecha", xlsCR.rows.slice(0, 4),
      [["Gastos cancha", "", "", "", "", 70000, ""], ["", "ARBITRAJE", "", "", "", 50000, ""],
       ["", "", "2026-05-02", "Terna", "", 40000, "CAJA"], ["", "", "2026-05-06", " Terna ", "", 10000, "CAJA"]]);
igual("total al final", xlsCR.rows[xlsCR.rows.length - 1], ["TOTAL PERÍODO FILTRADO", "", "", "", 150000, 100000, ""]);
const xlsC = app.reportesFilasExcel(app.getMovimientosReportes(), "cat");
igual("Excel sólo Categoría: sin columna Rubro", xlsC.headers, ["Categoría", "Fecha", "Concepto", "Ingreso", "Egreso", "Cuenta"]);
igual("la categoría y debajo sus movimientos", xlsC.rows.slice(0, 2), [["Gastos cancha", "", "", "", 70000, ""], ["", "2026-05-02", "Terna", "", 40000, "CAJA"]]);
igual("3 categorías + 5 movimientos + total", xlsC.rows.length, 9);
const xlsR = app.reportesFilasExcel(app.getMovimientosReportes(), "rubro");
igual("Excel sólo Rubro: primera columna Rubro", [xlsR.headers[0], xlsR.rows.filter(r => r[0]).map(r => r[0])],
      ["Rubro", ["ARBITRAJE", "GASTOS MEDICOS", "SEGURIDAD", "ENTRADAS", "TOTAL PERÍODO FILTRADO"]]);
igual("mismo total en los tres", [xlsC.rows[8].slice(3, 5), xlsR.rows[xlsR.rows.length - 1].slice(3, 5)], [[150000, 100000], [150000, 100000]]);
app.reportesState.nivel = "catrubro"; app.reportesState.catExpandido.clear(); app.reportesState.rubroExpandido.clear();

seccion("53 · Reintegros: filtro de Jugadores y Estado");
app.reintegroFiltro = ""; app.reintegroAnio = ""; app.reintegroOrdenCol = ""; app.reintegroColFiltros = {};
app.movimientos = [
  { id:"a1", tipo:"EGRESO", fecha:"2026-03-12", codRubro:"21", jugadorCT:"PEREZ", egreso:25000, seguroReintegro:1, concepto:"Consulta", vinculos:[] },
  { id:"a2", tipo:"EGRESO", fecha:"2026-05-02", codRubro:"21", jugadorCT:"GOMEZ", egreso:90000, seguroReintegro:1, concepto:"Resonancia", vinculos:[] },
  { id:"b1", tipo:"EGRESO", fecha:"2026-05-10", codRubro:"21", jugadorCT:"LOPEZ", egreso:1000, seguroReintegro:1, concepto:"x", vinculos:[] },
  { id:"bi", tipo:"INGRESO", fecha:"2026-05-11", codRubro:"21", jugadorCT:"LOPEZ", ingreso:1000, concepto:"r", vinculos:[{ egresoId:"b1", monto:1000 }] }
];
const jugs = () => app.filasReintegros().map(r => r.jugador).sort();
igual("sin filtros, los tres", jugs(), ["GOMEZ", "LOPEZ", "PEREZ"]);
igual("jugadores disponibles", app.reintFiltroValores("jugador").map(v => v.valor), ["GOMEZ", "LOPEZ", "PEREZ"]);
igual("estados ordenados por urgencia", app.reintFiltroValores("estado").map(v => v.etiqueta + ":" + v.cantidad), ["🔴 Pendiente:2", "✅ OK:1"]);
app.reintegroColFiltros = { jugador: new Set(["PEREZ", "LOPEZ"]) };
igual("filtrar varios jugadores", jugs(), ["LOPEZ", "PEREZ"]);
app.reintegroColFiltros.estado = new Set(["SIN"]);
igual("combinado con estado", jugs(), ["PEREZ"]);
igual("los estados ofrecidos salen de los jugadores elegidos", app.reintFiltroValores("estado").map(v => v.valor), ["SIN", "OK"]);
const tablaR = app.renderReintegrosTabla(app.filasReintegros());
check("los TOTALES de la tabla suman sólo lo filtrado", tablaR.includes(app.fmt(25000)) && !tablaR.includes(app.fmt(90000)));
check("el PDF sale de lo filtrado", app.reintPdfDatos(app.filasReintegros(), app.buildVinculosIndex().porEgreso).jugadores.map(j => j.jugador).join() === "PEREZ");
check("y el botón lo avisa", app.reintPdfLabel().includes("(filtrado)"));
app.reintegroColFiltros = { jugador: new Set(["NADIE"]) };
const vacioReint = app.renderReintegrosBody();
check("si no queda nada, la barra de filtros sigue para poder deshacerlo", vacioReint.includes("Jugadores:") && vacioReint.includes("Sin jugadores para estos filtros"));
app.reintegroColFiltros = {};

seccion("54 · Granos: cobro por precio y monto, liquidación pedida y ajuste por comisión");
// El caso tal cual se usa: se piden liquidar 200 qq de soja, van entrando pagos y cada uno se carga
// con el precio de la liquidación y el monto recibido. Al final sobra lo que se llevó la comisión.
const filaG = (o) => Object.assign({ nota:"", movimientoId:"", precioTn:0, pedidoId:"" }, o);
app.preciosGranos = { Soja: 480000, Trigo: 293600 };
app.cuentas = ["MACRO"]; app.metodos = ["TRANSFERENCIA"];
app.movimientos = [
  { id:"mv1", tipo:"INGRESO", fecha:"2026-10-01", mes:"202610", ingreso:1000000, montoFinal:1000000, observacion:"",
    concepto:"Venta Soja - 2.083,33 kg - $1.000.000 - (precio $480.000)" },
  { id:"mv2", tipo:"INGRESO", fecha:"2026-10-05", mes:"202610", ingreso:2000000, montoFinal:2000000, observacion:"",
    concepto:"Venta Soja - 4.000 kg - $2.000.000 - (precio $500.000)" },
  { id:"mvViejo", tipo:"INGRESO", fecha:"2026-08-10", mes:"202608", ingreso:1500000, montoFinal:1500000, observacion:"",
    concepto:"Venta Trigo - 5.010 kg - $1.500.000 - (precio $299.401)" },
];
app.reservas = [
  filaG({ id:"c1", fecha:"2026-06-30", grano:"Soja",  tipo:"COSECHA", kg:36020, nota:"Stock inicial" }),
  filaG({ id:"c2", fecha:"2026-06-30", grano:"Trigo", tipo:"COSECHA", kg:43860, nota:"Stock inicial" }),
  filaG({ id:"v0", fecha:"2026-08-10", grano:"Trigo", tipo:"VENTA",   kg:5010, movimientoId:"mvViejo" }),
  filaG({ id:"p1", fecha:"2026-09-28", grano:"Soja",  tipo:"PEDIDO",  kg:20000 }),
  filaG({ id:"v1", fecha:"2026-10-01", grano:"Soja",  tipo:"VENTA",   kg:2083.33, movimientoId:"mv1", precioTn:480000, pedidoId:"p1" }),
  filaG({ id:"v2", fecha:"2026-10-05", grano:"Soja",  tipo:"VENTA",   kg:4000,    movimientoId:"mv2", precioTn:500000, pedidoId:"p1" }),
];
igual("los kilos salen de monto / precio por tonelada", app.kgDeVenta(1000000, 480000), 2083.33);
igual("2 millones a $500.000 la tonelada son 40 qq", app.fmtQq(app.kgDeVenta(2000000, 500000)), "40");
igual("sin precio no hay kilos (no divide por cero)", app.kgDeVenta(1000000, 0), 0);
igual("ni con monto vacío", app.kgDeVenta("", 480000), 0);
igual("pedir la liquidación NO descuenta stock; los cobros sí", app.calcStockGranos().Soja, 29936.67);
igual("el trigo sigue como antes", app.calcStockGranos().Trigo, 38850);
let ped = app.pedidosGranos()[0];
igual("lo cobrado de la liquidación", [ped.cobros, ped.cobradoKg, ped.montoCobrado], [2, 6083.33, 3000000]);
igual("lo que falta cobrar", ped.pendienteKg, 13916.67);
check("y sigue abierta", ped.abierto === true);
igual("una venta vieja sin precio guardado lo deduce de monto y kilos",
      Math.round(app.precioDeVenta(app.reservas[2])), 299401);
igual("una nueva usa el precio que se tipeó", app.precioDeVenta(app.reservas[4]), 480000);

let htmlG = app.renderGranos();
check("la pantalla muestra la liquidación en curso", htmlG.includes("Liquidaciones en curso") && htmlG.includes("200 qq pedidos"));
check("con lo que falta en quintales", htmlG.includes("faltan 139,17 qq"));
check("el stock avisa lo pedido sin cobrar", htmlG.includes("Pedido a liquidar, sin cobrar"));
check("cada fila del historial se puede editar", app.reservas.every(r => htmlG.includes(`editarReserva('${r.id}')`)));
check("el cobro muestra kilos, quintales, monto y precio",
      htmlG.includes("2.083,33 kg") && htmlG.includes("20,83 qq") && htmlG.includes("$1.000.000") && htmlG.includes("(precio $480.000)"));
check("el formulario de venta pide precio y monto, no kilos",
      htmlG.includes('id="venta-precio"') && htmlG.includes('id="venta-monto"') && !htmlG.includes('id="venta-kg"'));
check("y ya apunta a la liquidación abierta", /<option value="p1" selected>/.test(htmlG));
check("no avisa de servidor viejo cuando las filas traen la liquidación", !htmlG.includes("Falta actualizar el servidor"));

igual("texto del cálculo mientras se tipea",
      app.ventaCalcTexto(480000, 1000000, "").replace(/<[^>]+>/g, ""),
      "Se descuentan 2.083,33 kg · 20,83 qq ($48.000 por quintal)");
check("contra una liquidación dice cuánto queda", app.ventaCalcTexto(500000, 1000000, "p1").includes("Quedan 119,17 qq por cobrar"));
check("y avisa si el cobro supera lo pedido", app.ventaCalcTexto(100000, 2000000, "p1").includes("Supera lo pedido en 60,83 qq"));
check("al editar, los kilos propios no se cuentan dos veces",
      app.ventaCalcTexto(500000, 0, "p1", 4000, 4000).includes("Quedan 139,17 qq"));

// Precio, monto y kilos van atados: el monto es la plata que entró, así que manda.
igual("cambiar el precio recalcula los kilos", app.ventaRecalcular("precio", { precio:500000, monto:1000000, kg:2083.33 }).kg, 2000);
igual("cambiar el monto también", app.ventaRecalcular("monto", { precio:480000, monto:960000, kg:2083.33 }).kg, 2000);
igual("cambiar los kilos acomoda el precio, no el monto",
      app.ventaRecalcular("kg", { precio:480000, monto:1000000, kg:2000 }), { precio:500000, monto:1000000, kg:2000 });

// Editar el cobro reescribe el ingreso que generó.
const v1 = app.reservas[4];
const movEd = app.movDeVentaEditado(app.movimientos[0], v1, Object.assign({}, v1, { fecha:"2026-11-02", kg:2000, precioTn:500000, nota:"ok" }), 1000000);
igual("la descripción automática se rearma con los kilos y el precio nuevos", movEd.concepto,
      "Venta Soja - 2.000 kg - $1.000.000 - (precio $500.000)");
igual("la fecha y el mes del ingreso acompañan", [movEd.fecha, movEd.mes], ["2026-11-02", "202611"]);
igual("y la nota viaja a la observación si era la misma", movEd.observacion, "ok");
const movManual = Object.assign({}, app.movimientos[0], { concepto:"Pago Cooperativa soja", observacion:"ver liquidación 123" });
const movEd2 = app.movDeVentaEditado(movManual, v1, Object.assign({}, v1, { kg:2000, precioTn:500000, nota:"ok" }), 1100000);
igual("una descripción escrita a mano se respeta", movEd2.concepto, "Pago Cooperativa soja");
igual("igual que una observación propia", movEd2.observacion, "ver liquidación 123");
igual("pero el monto sí se actualiza", [movEd2.ingreso, movEd2.montoFinal], [1100000, 1100000]);

// Stock: ningún alta ni edición puede dejarlo en negativo.
igual("un cobro por más kilos de los que hay se frena",
      app.errorStockTrasCambio(null, filaG({ grano:"Soja", tipo:"VENTA", kg:30000 })), "No alcanza el stock de Soja: faltarían 63,33 kg");
igual("uno que entra justo pasa", app.errorStockTrasCambio(null, filaG({ grano:"Soja", tipo:"VENTA", kg:29936.67 })), "");
igual("achicar una cosecha por debajo de lo ya vendido se frena",
      app.errorStockTrasCambio(app.reservas[0], Object.assign({}, app.reservas[0], { kg:6000 })), "No alcanza el stock de Soja: faltarían 83,33 kg");
igual("corregirla hacia arriba pasa", app.errorStockTrasCambio(app.reservas[0], Object.assign({}, app.reservas[0], { kg:36500 })), "");
igual("editar un pedido nunca toca el stock", app.errorStockTrasCambio(app.reservas[3], Object.assign({}, app.reservas[3], { kg:999999 })), "");

// Cierre: lo que sobra es la comisión. Se descuenta como ajuste, sin movimiento de plata.
const nMovs = app.movimientos.length;
app.reservas.push(filaG({ id:"a1", fecha:"2026-10-20", grano:"Soja", tipo:"AJUSTE", kg:ped.pendienteKg, nota:app.NOTA_AJUSTE_COMISION, pedidoId:"p1" }));
ped = app.pedidosGranos()[0];
igual("tras el ajuste no queda nada pendiente", ped.pendienteKg, 0);
check("la liquidación queda cerrada", ped.abierto === false);
igual("el stock bajó los 200 qq completos: cobros + ajuste", app.calcStockGranos().Soja, 16020);
igual("y no se generó ningún movimiento", app.movimientos.length, nMovs);
htmlG = app.renderGranos();
check("ya no aparece entre las liquidaciones en curso", !htmlG.includes("Liquidaciones en curso"));
check("en el historial figura como cerrada", htmlG.includes("200 qq pedidos") && htmlG.includes("cerrada"));
check("y el ajuste con su motivo", htmlG.includes("Ajuste por comisión") && htmlG.includes("13.916,67 kg"));
check("la pantalla no muestra ningún identificador interno",
      !/>[^<]*\b(p1|v1|a1|mv1)\b[^<]*</.test(htmlG));
igual("sin liquidación abierta, el cobro queda como venta suelta",
      app.ventaPedidoOptionsHtml("Soja").replace(/<[^>]+>/g, ""), "Sin liquidación pedida");

// Servidor sin actualizar: las filas llegan sin el dato de la liquidación.
app.reservas = [{ id:"c1", fecha:"2026-06-30", grano:"Soja", tipo:"COSECHA", kg:36020, nota:"", movimientoId:"" }];
check("se avisa en la pantalla en vez de fallar en silencio", app.renderGranos().includes("Falta actualizar el servidor"));
app.reservas = []; app.movimientos = [];

seccion("55 · Granos: tarjetas plegables");
// Cada sección de la pantalla es una tarjeta que se pliega. Qué queda abierto se recuerda en el
// dispositivo, y plegar no re-renderiza (no se pierde lo tipeado en los otros formularios).
const filaS = (o) => Object.assign({ nota:"", movimientoId:"", precioTn:0, pedidoId:"" }, o);
const tarjetas = (h) => [...h.matchAll(/class="sec-card( cerrada)?" id="gsec-(\w+)"/g)].map(m => m[2] + (m[1] ? ":plegada" : ":abierta"));
app.localStorage.removeItem("clubfm_granos_sec");
app.granosSecAbiertas = app.leerGranosSec();
app.preciosGranos = { Soja: 480000 };
app.movimientos = [];
app.reservas = [filaS({ id:"c1", fecha:"2026-06-30", grano:"Soja", tipo:"COSECHA", kg:36020 })];
igual("sin liquidaciones en curso no hay tarjeta de liquidaciones; el resto, con su estado inicial",
      tarjetas(app.renderGranos()),
      ["stock:abierta", "cobro:abierta", "pedido:plegada", "ajuste:plegada", "cosecha:plegada", "historial:abierta"]);
app.reservas.push(filaS({ id:"p1", fecha:"2026-09-28", grano:"Soja", tipo:"PEDIDO", kg:20000 }));
let htmlS = app.renderGranos();
igual("con una liquidación abierta aparece su tarjeta, después del stock", tarjetas(htmlS).slice(0, 3),
      ["stock:abierta", "liquidaciones:abierta", "cobro:abierta"]);
check("el encabezado del stock resume el total valuado", /Stock de granos<\/span>\s*<span class="sec-resumen">\$17\.289\.600</.test(htmlS));
check("el de liquidaciones, cuántas hay en curso", /Liquidaciones en curso<\/span>\s*<span class="sec-resumen">1 en curso</.test(htmlS));
check("y el del historial, cuántos registros", /Historial<\/span>\s*<span class="sec-resumen">2 registros</.test(htmlS));
check("una tarjeta plegada conserva su formulario (sólo se oculta)", htmlS.includes('id="pedido-qq"') && htmlS.includes('id="ajuste-kg"') && htmlS.includes('id="cosecha-kg"'));
app.granoSecToggle("stock");
app.granoSecToggle("cosecha");
igual("tocar el encabezado invierte el estado, y sobrevive al re-render",
      tarjetas(app.renderGranos()).filter(x => /^(stock|cosecha):/.test(x)), ["stock:plegada", "cosecha:abierta"]);
igual("queda guardado en el dispositivo", JSON.parse(app.localStorage.getItem("clubfm_granos_sec")).stock, false);
igual("y es lo que se lee al volver a abrir la app", [app.leerGranosSec().stock, app.leerGranosSec().cosecha], [false, true]);
app.granoSecToggle("cobro", false);
app.granoSecToggle("cobro", true); app.granoSecToggle("cobro", true);
igual("se puede forzar abierta (lo usa \"+ Cargar cobro\") sin que un segundo toque la cierre", app.granosSecAbiertas.cobro, true);
app.localStorage.setItem("clubfm_granos_sec", "{roto");
igual("un guardado ilegible no rompe la pantalla: vuelve al estado inicial", app.leerGranosSec(), app.GRANOS_SEC_DEFAULT);
app.localStorage.setItem("clubfm_granos_sec", JSON.stringify({ historial:false }));
igual("una sección que el guardado no conoce toma su valor inicial", [app.leerGranosSec().historial, app.leerGranosSec().stock, app.leerGranosSec().ajuste], [false, true, false]);
app.localStorage.removeItem("clubfm_granos_sec");
app.granosSecAbiertas = app.leerGranosSec();
app.reservas = []; app.movimientos = [];

// ══════════════════════════════════════════════════════════════
// Un premio por partido. El modal viejo tenía un solo selector de partido y una cantidad por tipo
// de premio: tres asistencias del PF sólo entraban como "x3" contra un mismo partido. Ahora cada
// una es una fila propia, con su partido, que se edita o se quita sola.
seccion("Premios · uno por partido, cada uno en su fila");
sembrar();
app.partidos.push({ id: "p0", fecha: "2026-06-01", rival: "Piamonte", numeroFecha: "Fecha 2", condicion: "LOCAL" });
app.configJugadores.push({ idJugador: "j3", nombre: "GON", frecuencia: "mensual",
                           premios: [{ descripcion: "Asist. partido", monto: 25000 }, { descripcion: "Gol", monto: 3000 }] });
const altaPF = (id, d, extra) => {
  const fila = Object.assign(app.pjPremioArmarFila("j3", "GON", Object.assign({ desc: "Asist. partido", monto: 25000, cant: 1, mes: "2026-06" }, d)), { id }, extra || {});
  app.pagosJugadores.push(fila);
  return fila;
};
const a2 = altaPF("pf-p2", { partidoId: "p2" });
const a1 = altaPF("pf-p1", { partidoId: "p1" });
igual("dos asistencias son dos filas, ordenadas por la fecha del partido",
      app.pjPremiosCargados("j3").map(p => p.id), ["pf-p1", "pf-p2"]);
igual("cada una con su partido", app.pjPremiosCargados("j3").map(p => p.partidoId), ["p1", "p2"]);
igual("y con el monto de UNA", app.pjPremiosCargados("j3").map(p => p.montoFinal), [25000, 25000]);
igual("la fila es de tipo premio, sin partidosIncluidos (no se confunde con el pago del partido)",
      [a1.tipo, a1.partidosIncluidos.length, a1.estado, a1.etiqueta], ["premio", 0, "pendiente", "Asist. partido"]);
igual("no le aparecen los premios de otro jugador", app.pjPremiosCargados("j3").some(p => p.jugadorId !== "j3"), false);

// La cantidad queda para lo que se repite dentro de un mismo partido.
const gol = altaPF("pf-gol", { desc: "Gol", monto: 3000, cant: 2, partidoId: "p1" });
igual("dos goles en un partido: una fila, x2", [gol.etiqueta, gol.montoFinal], ["Gol x2", 6000]);
igual("la etiqueta se vuelve a separar en premio y cantidad",
      app.pjPremioParse("Gol x2", app.pjPremiosCatalogo("j3")), { desc: "Gol", cant: 2 });
igual("sin cantidad vale por uno", app.pjPremioParse("Asist. partido", app.pjPremiosCatalogo("j3")), { desc: "Asist. partido", cant: 1 });
igual("un premio que se llama \"Copa x2\" en el catálogo no se parte",
      app.pjPremioParse("Copa x2", [{ descripcion: "Copa x2", monto: 1 }]), { desc: "Copa x2", cant: 1 });

// Editar: mismo id, y no pierde lo que el modal no maneja.
const editada = app.pjPremioArmarFila("j3", "GON", { desc: "Asist. partido", monto: 25000, cant: 1, partidoId: "p0", mes: "2026-07" },
                                      Object.assign({}, a2, { fecha: "2026-06-15" }));
igual("editar conserva el id y cambia partido y mes", [editada.id, editada.partidoId, editada.mes], ["pf-p2", "p0", "2026-07"]);
igual("y lo que el modal no toca", editada.fecha, "2026-06-15");
igual("un alta va sin id: lo pone la planilla",
      app.pjPremioArmarFila("j3", "GON", { desc: "Gol", monto: 3000, cant: 1, partidoId: "", mes: "" }).id, "");

// La misma asistencia dos veces es el error fácil.
igual("mismo premio y mismo partido: avisa cuál es", (app.pjPremioRepetido("j3", "Asist. partido", "p1", "") || {}).id, "pf-p1");
igual("otro partido no es repetido", app.pjPremioRepetido("j3", "Asist. partido", "p0", ""), null);
igual("otro premio en el mismo partido tampoco", app.pjPremioRepetido("j3", "Valla", "p1", ""), null);
igual("el que se está editando no choca consigo mismo", app.pjPremioRepetido("j3", "Asist. partido", "p1", "pf-p1"), null);
igual("sin partido no hay contra qué comparar", app.pjPremioRepetido("j3", "Asist. partido", "", ""), null);
igual("\"Gol x2\" cuenta como Gol", (app.pjPremioRepetido("j3", "Gol", "p1", "") || {}).id, "pf-gol");
a1.estado = "pagado";
igual("uno ya pagado también se detecta", (app.pjPremioRepetido("j3", "Asist. partido", "p1", "") || {}).estado, "pagado");
igual("y sale de la lista de pendientes", app.pjPremiosCargados("j3").map(p => p.id), ["pf-gol", "pf-p2"]);
a1.estado = "pendiente";

// Partido propuesto: en Mensual, el último ya jugado que todavía no tiene ese premio.
app.pagosJugTab = "mensual";
igual("propone el último partido jugado sin ese premio", app.pjPremioPartidoPropuesto("j3", "Asist. partido"), "p0");
igual("para otro premio, el más reciente", app.pjPremioPartidoPropuesto("j3", "Valla"), "p2");
altaPF("pf-p0", { partidoId: "p0" });
igual("con todos cargados no propone ninguno", app.pjPremioPartidoPropuesto("j3", "Asist. partido"), "");
app.partidos.push({ id: "pfut", fecha: "2099-01-01", rival: "Futuro", numeroFecha: "Fecha 9" });
igual("un partido que todavía no se jugó no se propone", app.pjPremioPartidoPropuesto("j3", "Asist. partido"), "");
app.pagosJugTab = "partido"; app.pjPartidoSel = "p2";
igual("desde Por partido es el que está a la vista", app.pjPremioPartidoPropuesto("j3", "Asist. partido"), "p2");

// Lo cargado con el modal viejo se sigue viendo, como un premio más (y se puede partir a mano).
app.pagosJugadores.push({ id: "pf-viejo", jugadorId: "j3", jugadorNombre: "GON", partidosIncluidos: [], montoFinal: 75000,
                          estado: "pendiente", etiqueta: "Asist. partido x3", mes: "2026-05", tipo: "", partidoId: "" });
app.pagosJugadores.push({ id: "pf-sueldo", jugadorId: "j3", jugadorNombre: "GON", partidosIncluidos: [], montoFinal: 300000,
                          estado: "pendiente", etiqueta: "Junio", mes: "2026-06", tipo: "periodico", partidoId: "" });
check("una fila vieja sin tipo se reconoce por la etiqueta", app.pjPremiosCargados("j3").some(p => p.id === "pf-viejo"));
igual("y va al final, por no tener partido", app.pjPremiosCargados("j3").slice(-1)[0].id, "pf-viejo");
check("el sueldo no se cuela en la lista de premios", !app.pjPremiosCargados("j3").some(p => p.id === "pf-sueldo"));

// En Mensual cada premio dice de qué partido es: si no, dos asistencias son dos líneas idénticas.
const detallePF = app.pjDetalleFilasHTML(app.pjFilasMes("j3", "2026-06"));
check("el detalle distingue las asistencias por partido",
      detallePF.includes("Colon 08/06") && detallePF.includes("Union 15/06") && detallePF.includes("Piamonte 01/06"), detallePF);
igual("una línea por premio", (detallePF.match(/Asist\. partido: /g) || []).length, 3);
app.pagosJugTab = "partido"; app.pjPartidoSel = null;

console.log("\n" + "═".repeat(64));
console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
process.exitCode = _fail === 0 ? 0 : 1;
