/* Pruebas de los datos públicos — `node spec/publico.js`
 *
 * Lo que alimenta al sitio de balances abierto a la comunidad. Dos cosas importan más que el resto:
 *
 *  1. Que no se escape nada personal. Aunque alguien encuentre la URL del endpoint, no puede haber
 *     nombres de jugadores ni adherentes, ni montos individuales — sólo totales.
 *  2. Que `publicado_hasta` frene de verdad. Es el único control que tiene el tesorero sobre qué ve
 *     el pueblo; si filtrara mal, un mes a medio cargar aparecería publicado sin que nadie lo note.
 */

const H = require("./harness.js");
const { reset, hoja, check, igual, seccion, resumen, datosPublicos } = H;

const MOV = ["ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto","Egreso","Ingreso","MontoFinal",
  "Cuenta","CuentaDestino","ModoPago","JugadorCT","Adherente","Observacion","Comprobante","SeguroReintegro",
  "Tipo","timestamp","PartidoID","EventoID","Vinculos","ItemsDetalle","JugadorID","AdherenteID"];
const PAR = ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo","Torneo","EntradasDamas","EntradasCaballeros"];
const EVE = ["ID","Nombre","Fecha","Activo"];
const CFG = ["Clave","Valor"];

function mov(o) {
  const r = new Array(MOV.length).fill("");
  r[0]=o.id; r[2]=o.fecha; r[3]=o.cod||""; r[5]=o.cat||""; r[6]=o.concepto||"";
  r[7]=o.egreso||0; r[8]=o.ingreso||0; r[9]=(o.ingreso||o.egreso||0);
  r[13]=o.jugador||""; r[14]=o.adherente||"";
  r[18]=o.ingreso ? "INGRESO" : "EGRESO"; r[20]=o.partidoId||""; r[21]=o.eventoId||"";
  return r;
}

function sembrar(corte) {
  reset();
  hoja("Config", CFG, corte === null ? [] : [["publicado_hasta", corte]]);
  hoja("Partidos", PAR, [
    ["p1","2026-03-15","Susanense","Fecha 3","LOCAL","true","Apertura",39,42],
    ["p2","2026-04-02","Guadalupe","Fecha 7","VISITANTE","true","Apertura","",""],
  ]);
  hoja("Eventos", EVE, [["e1","Peña de marzo","2026-03-22","true"]]);
  hoja("Movimientos", MOV, [
    // Partido de local: entradas, buffet (ingreso y gasto) y gastos de cancha
    mov({id:"m1", fecha:"2026-03-15", cod:"1",  cat:"Ingresos de cancha", ingreso:540000, partidoId:"p1", concepto:"Entradas"}),
    mov({id:"m2", fecha:"2026-03-15", cod:"2",  cat:"Ingresos de cancha", ingreso:300000, partidoId:"p1"}),
    mov({id:"m3", fecha:"2026-03-15", cod:"2",  cat:"Ingresos de cancha", egreso:120000,  partidoId:"p1"}),
    mov({id:"m4", fecha:"2026-03-15", cod:"12", cat:"Gastos Operativos Cancha", egreso:400000, partidoId:"p1"}),
    // Sueldo imputado al partido: NO entra en el neto de la jornada
    mov({id:"m5", fecha:"2026-03-15", cod:"19", cat:"Jugadores y Cuerpo Técnico", egreso:900000, partidoId:"p1", jugador:"PEREZ"}),
    // Adherente y sponsor
    mov({id:"m6", fecha:"2026-03-20", cod:"6",  cat:"Publicidad, Aportes y Sponsors", ingreso:1200000, adherente:"GONZALEZ"}),
    // Peña
    mov({id:"m7", fecha:"2026-03-22", cod:"54", cat:"Peñas y Eventos", ingreso:800000, eventoId:"e1"}),
    mov({id:"m8", fecha:"2026-03-22", cod:"55", cat:"Peñas y Eventos", egreso:300000,  eventoId:"e1"}),
    // Movilidad
    mov({id:"m9", fecha:"2026-03-25", cod:"15", cat:"Movilidad", egreso:250000}),
    // Posterior al corte
    mov({id:"m10", fecha:"2026-04-02", cod:"1", cat:"Ingresos de cancha", ingreso:370000, partidoId:"p2"}),
  ]);
}

// ── 1 · El freno de publicado_hasta ────────────────────────────
seccion("1 · publicado_hasta frena lo que no está cerrado");
sembrar("2026-03-31");
const pub = datosPublicos();
igual("un solo semestre", pub.periodos.length, 1);
igual("y es el primero", pub.periodos[0].id, "2026-S1");
const p = pub.periodos[0];
igual("marzo entró", p.meses.length, 1);
check("abril quedó afuera", !p.partidos.some(x => x.rival === "Guadalupe"));

sembrar(null);
const vacio = datosPublicos();
igual("sin la clave no se publica nada", vacio.periodos.length, 0);
check("y se avisa por qué", /publicado_hasta/.test(vacio.aviso || ""));

// ── 2 · Nada personal ──────────────────────────────────────────
seccion("2 · No se escapa nada personal");
sembrar("2026-03-31");
const txt = JSON.stringify(datosPublicos());
check("no aparece el jugador", txt.indexOf("PEREZ") < 0);
check("no aparece el adherente", txt.indexOf("GONZALEZ") < 0);
check("no aparecen IDs de movimientos", txt.indexOf("m1") < 0 && txt.indexOf('"id":"m') < 0);
check("no aparecen cuentas", txt.indexOf("EFECTIVO") < 0);

// ── 3 · El partido, con el mismo criterio que la app ───────────
seccion("3 · El neto del partido no incluye sueldos");
const q = datosPublicos().periodos[0];
const susanense = q.partidos.filter(x => x.rival === "Susanense")[0];
igual("entradas", susanense.entradas, 540000);
igual("buffet neto", susanense.buffet, 180000);
igual("gastos de cancha", susanense.gastosCancha, 400000);
igual("neto de la jornada", susanense.neto, 320000);
check("el sueldo de 900.000 no se restó", susanense.neto === 540000 + 300000 - 120000 - 400000);
igual("público = damas + caballeros", susanense.publico, 81);

// ── 4 · Abrir la cancha ────────────────────────────────────────
seccion("4 · Abrir la cancha sale de los partidos de local");
igual("costo promedio", q.abrirCancha.costoPromedio, 400000);
igual("precio promedio de la entrada", q.abrirCancha.precioPromedioEntrada, Math.round(540000/81));
igual("público promedio", q.abrirCancha.publicoPromedio, 81);
igual("entradas necesarias", q.abrirCancha.entradasNecesarias, Math.round(400000/Math.round(540000/81)));

// ── 5 · Peñas y plantel ────────────────────────────────────────
seccion("5 · Peñas y plantel");
igual("la peña va por el neto", q.eventos[0].monto, 500000);
igual("nombre de la peña", q.eventos[0].nombre, "Peña de marzo");
const plantel = {};
q.plantel.detalle.forEach(x => plantel[x.nombre.slice(0, 9)] = x.monto);
igual("sueldos", plantel["Jugadores"], 900000);
igual("movilidad", plantel["Movilidad"], 250000);

// ── 6 · Los totales cierran ────────────────────────────────────
// La tabla por categorías y las barras mes a mes salen del mismo conjunto de movimientos: si no
// dieran lo mismo, el sitio mostraría dos totales distintos en la misma página.
seccion("6 · Las categorías cierran contra los meses");
const ing = q.meses.reduce((s, m) => s + m.ingresos, 0);
const egr = q.meses.reduce((s, m) => s + m.egresos, 0);
igual("ingresos", q.categorias.reduce((s, c) => s + c.ingresos, 0), ing);
igual("egresos",  q.categorias.reduce((s, c) => s + c.egresos, 0), egr);
check("las categorías traen ingresos Y egresos",
      q.categorias.every(c => typeof c.ingresos === "number" && typeof c.egresos === "number"));
const jug = q.categorias.filter(c => c.nombre === "Jugadores y Cuerpo Técnico")[0];
igual("Jugadores y CT aparece con su egreso, no como fuente de ingresos", jug.egresos, 900000);

// ── 7 · Meses en temporada ─────────────────────────────────────
seccion("7 · Se marcan los meses en que se jugó");
const marzo = q.meses.filter(m => m.label === "Mar")[0];
check("marzo tuvo partido y queda marcado", marzo.temporada === true);
sembrar("2026-06-30");
const conAbril = datosPublicos().periodos[0].meses.filter(m => m.label === "Abr")[0];
check("abril, con el partido de visitante, también", conAbril && conAbril.temporada === true);

resumen();
