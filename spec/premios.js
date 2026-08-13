/* ══════════════════════════════════════════════════════════════
 * Premios, descuentos y tipado de las filas de "Pagos Jugadores".
 * Corre con `node spec/premios.js` (usa el mock de SpreadsheetApp de harness.js).
 *
 * Cubre lo que no se puede probar a ojo sin deployar:
 *  1. Un premio no se cobra solo al confirmar el pago del partido.
 *  2. Un jugador = una transferencia = un movimiento, con los ítems cerrando contra el total.
 *  3. El backfill de Tipo es idempotente y las filas viejas funcionan antes de correrlo.
 *  4. Los descuentos netean y no generan movimientos negativos en silencio.
 *  5. Nada de lo anterior rompió deleteMov ni checkIntegridad.
 * ══════════════════════════════════════════════════════════════ */

const H = require("./harness.js");
const { reset, hoja, filas, check, igual, seccion, resumen, handleAction, SHEETS } = H;

// Las constantes de Code.gs (MOV_SHEET, PJ_COLS…) quedan en el scope del harness, no acá:
// se leen de la instancia cargada con las mismas claves que usa el backend.
const S = {
  MOV: "Movimientos", PJ: "Pagos Jugadores", PAR: "Partidos", JUG: "Jugadores",
  CFGJ: "Config Jugadores", ROS: "Roster Partidos", ADH: "Adherentes", PAG: "Pagos_Adh"
};
const COLS = {
  MOV: ["ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto","Egreso","Ingreso","MontoFinal",
        "Cuenta","CuentaDestino","ModoPago","JugadorCT","Adherente","Observacion","Comprobante",
        "SeguroReintegro","Tipo","timestamp","PartidoID","EventoID","Vinculos","ItemsDetalle","JugadorID","AdherenteID"],
  PJ:  ["ID","JugadorId","JugadorNombre","PartidosIncluidos","MontoBase","Ajuste","MotivoAjuste","MontoFinal",
        "Estado","FechaPago","MedioPago","Etiqueta","MovimientoID","Mes","Tipo","PartidoID"],
  PAR: ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo","Torneo"],
  JUG: ["ID","Nombre","Activo"],
  CFGJ:["IdJugador","Nombre","MontoTitular","MontoSuplenteConMin","MontoSuplente","Frecuencia","Alias","Activo","Premios"],
  ROS: ["IdPartido","JugadorId","JugadorNombre","Rol"],
  ADH: ["ID","Nombre","Activo","CuotaMensual","CuotasAnuales"],
  PAG: ["ID","AdherenteID","AdherenteNombre","Mes","Estado","MovimientoID","timestamp"]
};
const PJ_IX = { ESTADO: 8, MOV_ID: 12, TIPO: 14, PARTIDO_ID: 15 }; // índices 0-based en la fila

/** Planilla base: dos jugadores (uno por partido, uno mensual) y un partido. */
function sembrar() {
  reset();
  hoja(S.MOV, COLS.MOV);
  hoja(S.PJ,  COLS.PJ);
  hoja(S.ROS, COLS.ROS);
  hoja(S.PAG, COLS.PAG);
  hoja(S.ADH, COLS.ADH);
  hoja(S.JUG, COLS.JUG, [["j1","GOMEZ","true"], ["j2","PEREZ","true"]]);
  hoja(S.PAR, COLS.PAR, [["p1","2026-06-14","RIVAL FC","Fecha 3","local","true","Apertura"]]);
  hoja(S.CFGJ, COLS.CFGJ, [
    ["j1","GOMEZ",10000,7000,5000,"partido","alias.gomez","true","[]"],
    ["j2","PEREZ",50000,0,0,"mensual","alias.perez","true","[]"]
  ]);
}

const pjRows   = () => filas(S.PJ);
const pjPorId  = id => pjRows().find(r => r[0] === id);
const movRows  = () => filas(S.MOV).filter(r => r[0]);
const items    = m => JSON.parse(m[23] || "[]");

/** Alta del pago del partido de j1 vía saveRoster (que es como lo crea la app real). */
function altaPartido(montoFinal) {
  handleAction({ action: "saveRoster", partidoId: "p1", roster: [
    { jugadorId:"j1", jugadorNombre:"GOMEZ", rol:"titular",
      montoBase: montoFinal, ajuste: 0, motivoAjuste: "", montoFinal, mes: "2026-06" }
  ]});
  return pjRows().find(r => r[PJ_IX.TIPO] === "partido")[0];
}

/** Alta de un premio (lo que manda el modal de Premios de index.html). */
function altaPremio(montoFinal, etiqueta, partidoId) {
  const r = handleAction({ action: "savePagoJugador", pago: {
    jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [],
    montoBase: montoFinal, ajuste: 0, motivoAjuste: "", montoFinal,
    estado: "pendiente", etiqueta, mes: "2026-06", tipo: "premio", partidoId: partidoId || ""
  }});
  return r.id;
}

const confirmar = ids => handleAction({
  action: "confirmarPagosJugadores", ids, cuenta: "MACRO", medioPago: "TRANSFERENCIA", fechaPago: "2026-06-20"
});

// ══════════════════════════════════════════════════════════════
seccion("1 · El premio no se cobra solo al confirmar el partido");
sembrar();
const idPartido = altaPartido(10000);
const idPremio  = altaPremio(3000, "Gol", "p1");

igual("saveRoster tipa la fila como pago de partido", pjPorId(idPartido)[PJ_IX.TIPO], "partido");
igual("…y le guarda el PartidoID", pjPorId(idPartido)[PJ_IX.PARTIDO_ID], "p1");
igual("el premio queda tipado como premio", pjPorId(idPremio)[PJ_IX.TIPO], "premio");
igual("…asociado al partido en que se ganó", pjPorId(idPremio)[PJ_IX.PARTIDO_ID], "p1");

const r1 = confirmar([idPartido]);   // sólo el partido, como si el usuario hubiera tildado eso nada más
check("confirmar sólo el partido funciona", r1.ok, r1.error);
igual("el partido queda pagado", pjPorId(idPartido)[PJ_IX.ESTADO], "pagado");
igual("EL PREMIO SIGUE PENDIENTE", pjPorId(idPremio)[PJ_IX.ESTADO], "pendiente");
igual("y se generó un solo movimiento", movRows().length, 1);
igual("por el monto del partido, sin el premio", Number(movRows()[0][7]), 10000);

const r2 = confirmar([idPremio]);    // después se cobra el premio aparte
check("confirmar el premio después funciona", r2.ok, r2.error);
const movPremio = movRows().find(m => Number(m[7]) === 3000);
igual("el ítem del premio se imputa a su partido", items(movPremio)[0].partidoId, "p1");
igual("con la etiqueta como descripción", items(movPremio)[0].desc, "Gol");
check("la Observación trae el desglose del premio",
      movPremio[15].indexOf("Gol") >= 0 && movPremio[15].indexOf("$3.000") >= 0, movPremio[15]);
const movPart = movRows().find(m => Number(m[7]) === 10000);
igual("el ítem del partido también lleva su partidoId", items(movPart)[0].partidoId, "p1");

// ══════════════════════════════════════════════════════════════
seccion("2 · Un jugador = una transferencia = un movimiento");
sembrar();
const idP2  = altaPartido(10000);
const idPr2 = altaPremio(3000, "Gol", "p1");
const idPr3 = altaPremio(1500, "Valla invicta", "");   // premio sin partido puntual

const r3 = confirmar([idP2, idPr2, idPr3]);
check("confirmar partido + premios juntos funciona", r3.ok, r3.error);
igual("sale UN solo movimiento", movRows().length, 1);
const mov = movRows()[0];
igual("con los tres ítems", items(mov).length, 3);
igual("la suma de los ítems cierra con el total",
      items(mov).reduce((s,it) => s + Number(it.monto||0), 0), Number(mov[7]));
igual("total = partido + premios", Number(mov[7]), 14500);
igual("el premio del partido se imputa a p1", items(mov).find(it => it.desc === "Gol").partidoId, "p1");
igual("el premio sin partido queda sin imputar (se prorratea en el resumen)",
      items(mov).find(it => it.desc === "Valla invicta").partidoId, "");
check("el concepto avisa que hay premios", mov[6].indexOf("premios") >= 0, mov[6]);
check("la Observación lista los dos premios con su monto",
      mov[15].indexOf("Gol $3.000") >= 0 && mov[15].indexOf("Valla invicta $1.500") >= 0, mov[15]);
igual("y las tres filas quedaron pagadas contra ese movimiento",
      [idP2, idPr2, idPr3].map(id => pjPorId(id)[PJ_IX.MOV_ID]), [mov[0], mov[0], mov[0]]);

// ══════════════════════════════════════════════════════════════
seccion("3 · Filas viejas sin Tipo: funcionan igual, y el backfill es idempotente");
sembrar();
// Filas como las que ya están cargadas en la planilla real: sin Tipo ni PartidoID.
SHEETS[S.PJ].rows.push(
  ["v1","j1","GOMEZ",'["p1"]',10000,0,"",10000,"pendiente","","","","","2026-06"],
  ["v2","j1","GOMEZ","[]",     3000,0,"", 3000,"pendiente","","","Gol","","2026-06"],
  ["v3","j2","PEREZ","[]",    50000,0,"",50000,"pendiente","","","Junio","","2026-06"]
);

const rViejo = confirmar(["v1"]);
check("una fila vieja se puede confirmar sin haber corrido el backfill", rViejo.ok, rViejo.error);
igual("se la trata como pago de partido (fallback por PartidosIncluidos)",
      items(movRows()[0])[0].partidoId, "p1");
igual("y el premio viejo del mismo jugador sigue pendiente", pjPorId("v2")[PJ_IX.ESTADO], "pendiente");

const b1 = handleAction({ action: "backfillTipoPagos" });
igual("el backfill completa las tres filas viejas", b1.completados, 3);
igual("v1 (un partido) → partido", pjPorId("v1")[PJ_IX.TIPO], "partido");
igual("…copiando el partido a PartidoID", pjPorId("v1")[PJ_IX.PARTIDO_ID], "p1");
igual("v2 ([] + jugador por partido) → premio", pjPorId("v2")[PJ_IX.TIPO], "premio");
igual("v3 ([] + jugador mensual) → periodico", pjPorId("v3")[PJ_IX.TIPO], "periodico");

const antes = JSON.stringify(pjRows());
const b2 = handleAction({ action: "backfillTipoPagos" });
igual("correrlo de nuevo no completa nada", b2.completados, 0);
igual("y no cambia ninguna fila", JSON.stringify(pjRows()), antes);

// ══════════════════════════════════════════════════════════════
seccion("4 · Descuentos: netean, se revierten y no generan movimientos negativos");
sembrar();
const idSueldo = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: 50000, ajuste: 0,
  motivoAjuste: "", montoFinal: 50000, estado: "pendiente", etiqueta: "Junio", mes: "2026-06", tipo: "periodico"
}}).id;
const idDesc = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: -8000, ajuste: 0,
  motivoAjuste: "", montoFinal: -8000, estado: "pendiente", etiqueta: "Multa", mes: "2026-06", tipo: "descuento"
}}).id;
igual("el descuento se guarda en negativo", Number(pjPorId(idDesc)[7]), -8000);

const r4 = confirmar([idSueldo, idDesc]);
check("se confirman juntos", r4.ok, r4.error);
igual("un solo movimiento", movRows().length, 1);
igual("por el NETO, no por el sueldo bruto", Number(movRows()[0][7]), 42000);
igual("sigue siendo un EGRESO", movRows()[0][18], "EGRESO");
igual("montoFinal normalizado también es el neto", Number(movRows()[0][9]), 42000);
igual("los ítems cierran con el neto",
      items(movRows()[0]).reduce((s,it) => s + Number(it.monto||0), 0), 42000);

const rDel = handleAction({ action: "deleteMov", id: movRows()[0][0] });
igual("borrar el movimiento revierte las dos filas", rDel.revertido.jugadores.length, 2);
igual("el sueldo vuelve a pendiente", pjPorId(idSueldo)[PJ_IX.ESTADO], "pendiente");
igual("el descuento también", pjPorId(idDesc)[PJ_IX.ESTADO], "pendiente");
igual("y sin MovimientoID", pjPorId(idDesc)[PJ_IX.MOV_ID], "");

// Descuento mayor al sueldo: tiene que cortar antes de escribir nada.
const idDescGrande = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: -60000, ajuste: 0,
  motivoAjuste: "", montoFinal: -60000, estado: "pendiente", etiqueta: "Adelanto", mes: "2026-06", tipo: "descuento"
}}).id;
const movsAntes = movRows().length;
const r5 = confirmar([idSueldo, idDesc, idDescGrande]);
check("un neto negativo no se confirma", !r5.ok, JSON.stringify(r5));
check("el error explica de quién es el problema", (r5.error||"").indexOf("PEREZ") >= 0, r5.error);
igual("no se creó ningún movimiento", movRows().length, movsAntes);
igual("y las filas siguen pendientes", pjPorId(idSueldo)[PJ_IX.ESTADO], "pendiente");

// Un lote con dos jugadores donde sólo uno da negativo no puede quedar a medio confirmar.
sembrar();
const idOk   = altaPartido(10000);
const idNeg  = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: -5000, ajuste: 0,
  motivoAjuste: "", montoFinal: -5000, estado: "pendiente", etiqueta: "Multa", mes: "2026-06", tipo: "descuento"
}}).id;
const r6 = confirmar([idOk, idNeg]);
check("el lote entero se rechaza", !r6.ok, JSON.stringify(r6));
igual("no se escribió el movimiento del jugador que sí estaba bien", movRows().length, 0);
igual("ni se marcó su fila como pagada", pjPorId(idOk)[PJ_IX.ESTADO], "pendiente");

// ══════════════════════════════════════════════════════════════
seccion("5 · No se rompió lo de antes");
sembrar();
hoja(S.ADH, COLS.ADH, [["a1","LOPEZ","true",5000,8]]);
const idP5  = altaPartido(10000);
const idPr5 = altaPremio(3000, "Gol", "p1");
confirmar([idP5, idPr5]);

// Cuota de adherente pagada contra un movimiento aparte, para chequear el cascade completo.
handleAction({ action: "saveMov", mov: {
  id: "mAdh", mes: "202606", fecha: "2026-06-05", codRubro: "6", concepto: "Cuota",
  ingreso: 5000, cuenta: "MACRO", modoPago: "TRANSFERENCIA",
  adherente: "LOPEZ", adherenteId: "a1", tipo: "INGRESO"
}});
igual("la cuota del adherente quedó PAGADO", filas(S.PAG)[0][4], "PAGADO");

const rInt = handleAction({ action: "checkIntegridad" });
igual("checkIntegridad no encuentra errores en una planilla sana", rInt.errores, 0);

const movPago = movRows().find(m => m[0] !== "mAdh");
const rDel5 = handleAction({ action: "deleteMov", id: movPago[0] });
igual("deleteMov sigue revirtiendo los pagos a jugadores", rDel5.revertido.jugadores.length, 2);
igual("el partido volvió a pendiente", pjPorId(idP5)[PJ_IX.ESTADO], "pendiente");
igual("el premio también", pjPorId(idPr5)[PJ_IX.ESTADO], "pendiente");

const rDelAdh = handleAction({ action: "deleteMov", id: "mAdh" });
igual("y sigue revirtiendo las cuotas de adherentes", rDelAdh.revertido.cuotas.length, 1);
igual("la cuota volvió a PENDIENTE", filas(S.PAG)[0][4], "PENDIENTE");

// Un premio apuntando a un partido borrado tiene que salir en el chequeo.
handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [], montoBase: 2000, ajuste: 0,
  motivoAjuste: "", montoFinal: 2000, estado: "pendiente", etiqueta: "Gol", mes: "2026-06",
  tipo: "premio", partidoId: "p-borrado"
}});
const rInt2 = handleAction({ action: "checkIntegridad" });
check("checkIntegridad detecta el premio colgado de un partido borrado",
      rInt2.problemas.some(p => p.grupo === "Pagos a jugadores" && p.detalle.indexOf("partido que se borró") >= 0),
      JSON.stringify(rInt2.problemas));

// ══════════════════════════════════════════════════════════════
// El ajuste de "Por partido" vive en una columna de la fila, no en una fila propia como los
// premios. Sin desglosarlo, el comprobante muestra el neto y esconde de dónde salió.
seccion("6 · El ajuste se desglosa como ítem propio en ItemsDetalle");

/** Alta de un pago de partido con ajuste (lo que graba saveRoster desde la pantalla Por partido). */
function altaPartidoConAjuste(montoBase, ajuste, motivoAjuste) {
  handleAction({ action: "saveRoster", partidoId: "p1", roster: [
    { jugadorId:"j1", jugadorNombre:"GOMEZ", rol:"titular",
      montoBase, ajuste, motivoAjuste, montoFinal: montoBase + ajuste, mes: "2026-06" }
  ]});
  return pjRows().find(r => r[PJ_IX.TIPO] === "partido")[0];
}

sembrar();
const idAj = altaPartidoConAjuste(10000, -2000, "Adelanto");
const rAj  = confirmar([idAj]);
check("se confirma el pago con ajuste", rAj.ok, rAj.error);
const movAj = movRows()[0];
igual("ItemsDetalle trae DOS ítems", items(movAj).length, 2);
igual("el primero es el partido, por el monto base",
      { desc: items(movAj)[0].desc, monto: items(movAj)[0].monto },
      { desc: "Fecha 3 vs RIVAL FC", monto: 10000 });
igual("el segundo es el ajuste, con el motivo tal cual y el signo tal cual",
      { desc: items(movAj)[1].desc, monto: items(movAj)[1].monto },
      { desc: "Adelanto", monto: -2000 });
igual("los dos se imputan al mismo partido",
      items(movAj).map(it => it.partidoId), ["p1", "p1"]);
igual("la suma de los ítems cierra con el neto",
      items(movAj).reduce((s,it) => s + Number(it.monto||0), 0), 8000);
igual("el Egreso del movimiento es el neto", Number(movAj[7]), 8000);
igual("y el MontoFinal también", Number(movAj[9]), 8000);
check("la Observación sigue trayendo el motivo", movAj[15].indexOf("Adelanto") >= 0, movAj[15]);

sembrar();
const idSinAj = altaPartidoConAjuste(10000, 0, "");
confirmar([idSinAj]);
igual("sin ajuste sigue saliendo UN solo ítem", items(movRows()[0]).length, 1);
igual("con el texto de siempre", items(movRows()[0])[0].desc, "Fecha 3 vs RIVAL FC");
igual("y por el total", Number(movRows()[0][7]), 10000);

// Motivo cargado pero ajuste en 0: no hay nada que desglosar, así que el motivo se sigue
// pegando a la descripción como venía saliendo.
sembrar();
const idMotivoSolo = altaPartidoConAjuste(10000, 0, "Viático");
confirmar([idMotivoSolo]);
igual("motivo sin ajuste: un ítem con el motivo pegado", items(movRows()[0]).length, 1);
igual("…y el texto de siempre", items(movRows()[0])[0].desc, "Fecha 3 vs RIVAL FC — Viático");

// Ajuste positivo (un plus, no un descuento): el signo sale tal cual está guardado.
sembrar();
const idPlus = altaPartidoConAjuste(10000, 1500, "Premio al esfuerzo");
confirmar([idPlus]);
igual("el plus sale en positivo", items(movRows()[0])[1].monto, 1500);
igual("y el total es la suma", Number(movRows()[0][7]), 11500);

// Fila vieja inconsistente: MontoFinal que no cierra con MontoBase + Ajuste. La guarda tiene
// que dejar el ítem único con MontoFinal para que el comprobante no difiera del egreso.
sembrar();
SHEETS[S.PJ].rows.push(
  ["roto","j1","GOMEZ",'["p1"]',10000,-2000,"Adelanto",7777,"pendiente","","","","","2026-06","partido","p1"]
);
confirmar(["roto"]);
igual("una fila que no cierra queda con UN solo ítem", items(movRows()[0]).length, 1);
igual("por el MontoFinal guardado", items(movRows()[0])[0].monto, 7777);
igual("y el egreso coincide con ese monto", Number(movRows()[0][7]), 7777);

// Partido + premio + ajuste juntos: sigue siendo un solo movimiento, ahora con tres ítems.
sembrar();
const idAj2 = altaPartidoConAjuste(10000, -2000, "Adelanto");
const idPr6 = altaPremio(3000, "Gol", "p1");
confirmar([idAj2, idPr6]);
igual("un solo movimiento", movRows().length, 1);
igual("con tres ítems: partido, ajuste y premio",
      items(movRows()[0]).map(it => it.desc), ["Fecha 3 vs RIVAL FC", "Adelanto", "Gol"]);
igual("la suma cierra con el total",
      items(movRows()[0]).reduce((s,it) => s + Number(it.monto||0), 0), Number(movRows()[0][7]));
igual("que es 10000 - 2000 + 3000", Number(movRows()[0][7]), 11000);

// ══════════════════════════════════════════════════════════════
// El Celular del jugador viaja tal cual se escribió: la normalización a formato wa.me vive en el
// front (waNormalizarCelular) y se aplica recién al armar el link, no al guardar.
seccion("7 · Celular del jugador");
sembrar();
handleAction({ action: "saveConfigJugador", config: {
  idJugador: "j1", nombre: "GOMEZ", montoTitular: 10000, montoSuplenteConMin: 7000,
  montoSuplente: 5000, frecuencia: "partido", alias: "alias.gomez", premios: [],
  celular: "03492 15 123456"
}});
const cfgJ1 = () => handleAction({ action: "listConfigJugadores" }).configJugadores.find(c => c.idJugador === "j1");
igual("el update guarda el celular sin tocarlo", cfgJ1().celular, "03492 15 123456");
igual("y no pisó el resto de la config",         cfgJ1().alias,   "alias.gomez");

handleAction({ action: "saveConfigJugador", config: {
  idJugador: "j3", nombre: "NUEVO", montoTitular: 0, montoSuplenteConMin: 0, montoSuplente: 0,
  frecuencia: "mensual", alias: "", premios: [], celular: "+54 9 3492 123456"
}});
const cfgJ3 = handleAction({ action: "listConfigJugadores" }).configJugadores.find(c => c.idJugador === "j3");
igual("el alta también lo escribe", cfgJ3.celular, "+54 9 3492 123456");

// Una fila anterior a la columna (planilla sin migrar) tiene que seguir leyéndose.
igual("un jugador sin celular cargado da vacío",
      handleAction({ action: "listConfigJugadores" }).configJugadores.find(c => c.idJugador === "j2").celular, "");

resumen();
