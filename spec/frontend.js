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
igual("venta número + GOPASS → otros ingresos", item(placa, "Otros ingresos (Sorteo)").m,   107000);
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
igual("pie", rt.pie, "@cdmitre · Fútbol Mayor");
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
app.setPlacaMonto(1, 2, "1234.67");
igual("los decimales se redondean al peso", item(app.placaEdit.json, "Policía").m, -1235);
app.setPlacaMonto(1, 2, "-500");
igual("un valor negativo tipeado no invierte el signo del renglón", item(app.placaEdit.json, "Policía").m, -500);
app.setPlacaMonto(1, 3, "");
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
      1500000 - 900000 + 1245000 + 107000 - 500 - 0 - 85000 - 100000 - 40000 - 63000);

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
      [{ desc: "Fecha 3 vs Colon", monto: 10000 }, { desc: "Adelanto", monto: -2000 }]);
igual("la descripción del partido NO lleva el motivo pegado",
      app.pjItemsDeFila(filaPartido())[0].desc, "Fecha 3 vs Colon");
igual("la suma de los ítems es el montoFinal",
      app.pjItemsDeFila(filaPartido()).reduce((s,it) => s + it.monto, 0), 8000);

igual("motivo vacío → \"Ajuste\"",
      app.pjItemsDeFila(filaPartido({ motivoAjuste: "" }))[1].desc, "Ajuste");
igual("motivo en blanco también → \"Ajuste\"",
      app.pjItemsDeFila(filaPartido({ motivoAjuste: "   " }))[1].desc, "Ajuste");

igual("ajuste positivo sale positivo",
      app.pjItemsDeFila(filaPartido({ ajuste: 1500, montoFinal: 11500, motivoAjuste: "Plus" })),
      [{ desc: "Fecha 3 vs Colon", monto: 10000 }, { desc: "Plus", monto: 1500 }]);

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
      [{ desc: "Gol", monto: 3000 }]);
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

igual("el mensaje sale con los datos interpolados",
      app.compMensajeWhatsApp("PEREZ", "Junio 2026", "$80.000"),
      "Hola PEREZ, te paso el comprobante de la liquidación de Junio 2026.\n" +
      "Total transferido: $80.000.\n" +
      "Cualquier cosa avisame.");
check("sin período no queda la preposición colgada",
      !app.compMensajeWhatsApp("PEREZ", "", "$80.000").includes("liquidación de ."),
      app.compMensajeWhatsApp("PEREZ", "", "$80.000"));

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
const detalleVistaJ1 = app.pjDetalleFilasHTML(app.pjFilasDeVistaPartido("j1"));
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

console.log("\n" + "═".repeat(64));
console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
process.exitCode = _fail === 0 ? 0 : 1;
