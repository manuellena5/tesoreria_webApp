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

const opts = app.opcionesRubroHTML("35");
check("el selector ofrece INDUMENTARIA Y MERCH.", opts.includes('value="35"'), opts.slice(0, 200));
check("y deja seleccionado el que se le pasa",    opts.includes('value="35" selected'), opts.slice(0, 200));
check("agrupa por categoría",                     opts.includes('<optgroup label="Indumentaria y Equipamiento">'));
check("no ofrece los rubros legacy",             !opts.includes('value="16"'));

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

console.log("\n" + "═".repeat(64));
console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
process.exitCode = _fail === 0 ? 0 : 1;
