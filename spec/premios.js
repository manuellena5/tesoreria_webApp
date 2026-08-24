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
 *  6. Un descuento con CodRubroContra NO netea: el egreso queda por el sueldo bruto y el cobro
 *     del club sale como un ingreso propio, vinculado al egreso y sin partido.
 *  7. Un descuento con MovimientoOrigenID (adelanto ya entregado) NO crea ninguna contabilidad:
 *     el egreso ya está asentado y el vínculo es sólo documental.
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
// Índices 0-based en la fila. MOV_ID es el movimiento que la liquidación GENERÓ con esta fila;
// MOV_ORIGEN es el que la JUSTIFICA (el egreso del adelanto que ya se le entregó). Van al revés.
const PJ_IX = { ESTADO: 8, MOV_ID: 12, TIPO: 14, PARTIDO_ID: 15, CONTRA: 16, MOV_ORIGEN: 17 };

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

// ══════════════════════════════════════════════════════════════
// CodRubroContra distingue el adelanto ya entregado (vacío, netea como siempre) del descuento con
// contrapartida real (con código, genera un ingreso propio). Acá sólo se verifica que el dato
// viaje entero por las dos ramas de savePagoJugador; lo que hace con él, en la sección 9.
seccion("8 · La columna CodRubroContra va y vuelve entera");
sembrar();
const idDescRubro = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [], montoBase: -20000, ajuste: 0,
  motivoAjuste: "", montoFinal: -20000, estado: "pendiente", etiqueta: "Camiseta",
  mes: "2026-06", tipo: "descuento", partidoId: "", codRubroContra: "35"
}}).id;
const leerPJ = id => handleAction({ action: "listPagosJugadores" }).pagosJugadores.find(p => p.id === id);
igual("el alta lo escribe", leerPJ(idDescRubro).codRubroContra, "35");

handleAction({ action: "savePagoJugador", pago: {
  id: idDescRubro, jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [], montoBase: -20000,
  ajuste: 0, motivoAjuste: "", montoFinal: -20000, estado: "pendiente", etiqueta: "Camiseta",
  mes: "2026-06", tipo: "descuento", partidoId: "", codRubroContra: "10"
}});
igual("el update por id también", leerPJ(idDescRubro).codRubroContra, "10");

const idAdelanto = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [], montoBase: -5000, ajuste: 0,
  motivoAjuste: "", montoFinal: -5000, estado: "pendiente", etiqueta: "Adelanto",
  mes: "2026-06", tipo: "descuento", partidoId: ""
}}).id;
igual("un descuento sin rubro queda vacío, no undefined", leerPJ(idAdelanto).codRubroContra, "");
igual("y un premio tampoco lo trae", leerPJ(altaPremio(3000, "Gol", "p1")).codRubroContra, "");

// ══════════════════════════════════════════════════════════════
// El corazón del cambio: un descuento con contrapartida deja de netear adentro del rubro 19.
// El egreso pasa a ser el sueldo BRUTO y el cobro del club se registra en su propio rubro, que es
// donde tiene que estar para que la imputación cierre además del saldo de la cuenta.
seccion("9 · Descuento con contrapartida: sueldo bruto + ingreso propio");

/** Alta de un descuento del sueldo, con o sin rubro de contrapartida. */
function altaDescuento(monto, etiqueta, codRubroContra) {
  return handleAction({ action: "savePagoJugador", pago: {
    jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [],
    montoBase: -monto, ajuste: 0, motivoAjuste: "", montoFinal: -monto,
    estado: "pendiente", etiqueta, mes: "2026-06", tipo: "descuento", partidoId: "",
    codRubroContra: codRubroContra || ""
  }}).id;
}
/** Alta del sueldo mensual de j2. */
function altaSueldo(monto) {
  return handleAction({ action: "savePagoJugador", pago: {
    jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [],
    montoBase: monto, ajuste: 0, motivoAjuste: "", montoFinal: monto,
    estado: "pendiente", etiqueta: "Junio", mes: "2026-06", tipo: "periodico", partidoId: ""
  }}).id;
}
const egresoDe  = () => movRows().find(m => m[18] === "EGRESO");
const ingresosDe = () => movRows().filter(m => m[18] === "INGRESO");

sembrar();
const idSueldo9 = altaSueldo(100);
const idCamiseta = altaDescuento(20, "Camiseta", "35"); // 35 = INDUMENTARIA Y MERCH.
const r9 = confirmar([idSueldo9, idCamiseta]);
check("la confirmación sale bien", r9.ok, JSON.stringify(r9));
igual("se crean dos movimientos", movRows().length, 2);

const egr9 = egresoDe(), ing9 = ingresosDe();
igual("el EGRESO va por el sueldo BRUTO, sin netear", Number(egr9[7]), 100);
igual("y sigue en el rubro 19",                        egr9[3], "19");
igual("un solo INGRESO",                               ing9.length, 1);
igual("por el monto del descuento, en positivo",       Number(ing9[0][8]), 20);
igual("en el rubro elegido",                           ing9[0][3], "35");
igual("con su nombre resuelto del catálogo",           ing9[0][4], "INDUMENTARIA Y MERCH.");
igual("y su categoría",                                ing9[0][5], "Indumentaria y Equipamiento");
igual("el concepto dice qué es y de quién",            ing9[0][6], "Camiseta — PEREZ");
igual("la observación aclara de dónde salió",          ing9[0][15], "Descontado del sueldo");
igual("misma cuenta que el egreso",                    ing9[0][10], egr9[10]);
igual("misma fecha",                                   ing9[0][2],  egr9[2]);
igual("mismo medio de pago",                           ing9[0][12], egr9[12]);
igual("los dos movimientos vienen en la respuesta",    (r9.movimientos||[]).length, 2);

// El Top 10 de jugadores del Resumen agrupa por JugadorCT y netea egr − ing, y el filtro por
// jugador de Reportes busca por ese campo: si va vacío el ingreso se pierde de los dos lados.
igual("el INGRESO lleva jugadorCT", ing9[0][13], "PEREZ");
igual("y jugadorId",                ing9[0][24], "j2");

// Vinculos en el INGRESO apuntando al egreso: misma convención que el reintegro de seguro.
const vin9 = JSON.parse(ing9[0][22] || "[]");
igual("el INGRESO trae un vínculo",         vin9.length, 1);
igual("que apunta al egreso",               vin9[0].egresoId, egr9[0]);
igual("por el monto del descuento",         vin9[0].monto, 20);
igual("el EGRESO no lleva vínculos",        egr9[22], "");
igual("el INGRESO no lleva ItemsDetalle",   ing9[0][23], "");

// Invariante 2: la suma de ItemsDetalle es igual al MontoFinal del movimiento.
igual("el ItemsDetalle del egreso suma 100",
      items(egr9).reduce((s,it) => s + Number(it.monto||0), 0), 100);
igual("y es una sola línea, la del sueldo", items(egr9).map(it => it.desc), ["Junio"]);
// La observación conserva el desglose de premios/ajustes que ya escribía y le suma el aviso del
// descuento: es lo único que, mirando el movimiento, explica por qué se transfirió menos.
check("la observación del egreso nombra el descuento cobrado aparte",
      egr9[15].indexOf("Descontado y cobrado aparte: Camiseta $20") >= 0, egr9[15]);

// Las dos filas quedan pagadas y apuntando al EGRESO: borrar el egreso revierte la liquidación
// entera, que es lo que hace revertirPagosDeMovimiento_.
igual("la fila del sueldo apunta al egreso",   pjPorId(idSueldo9)[PJ_IX.MOV_ID], egr9[0]);
igual("la del descuento también",              pjPorId(idCamiseta)[PJ_IX.MOV_ID], egr9[0]);
igual("las dos quedaron pagadas",
      [pjPorId(idSueldo9)[PJ_IX.ESTADO], pjPorId(idCamiseta)[PJ_IX.ESTADO]], ["pagado","pagado"]);

// ── El mismo caso SIN rubro: nada cambia respecto de hoy ──────
sembrar();
const idSueldo9b = altaSueldo(100);
const idAdelanto9 = altaDescuento(20, "Adelanto", "");
confirmar([idSueldo9b, idAdelanto9]);
igual("sin CodRubroContra sale un solo movimiento", movRows().length, 1);
igual("un EGRESO por el neto, 80",                  Number(egresoDe()[7]), 80);
igual("con las dos líneas en ItemsDetalle",         items(egresoDe()).map(it => it.desc), ["Junio","Adelanto"]);
igual("que siguen sumando el MontoFinal",
      items(egresoDe()).reduce((s,it) => s + Number(it.monto||0), 0), Number(egresoDe()[7]));

// ── El INGRESO nunca hereda un partido ────────────────────────
// "Indumentaria y Equipamiento" NO está en las categorías que Resumen > Por Partido excluye: un
// partidoId heredado sumaría la camiseta a la recaudación de esa fecha y al balance público.
sembrar();
const idPart9 = altaPartido(10000);          // j1, con partido p1
const idDescJ1 = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [], montoBase: -2000, ajuste: 0,
  motivoAjuste: "", montoFinal: -2000, estado: "pendiente", etiqueta: "Multa", mes: "2026-06",
  tipo: "descuento", partidoId: "", codRubroContra: "10"
}}).id;
confirmar([idPart9, idDescJ1]);
igual("el EGRESO sí lleva el partido",  egresoDe()[20], "p1");
igual("pero el INGRESO va sin partido", ingresosDe()[0][20], "");
igual("el egreso queda por el bruto",   Number(egresoDe()[7]), 10000);
igual("y el ingreso por la multa",      Number(ingresosDe()[0][8]), 2000);

// ── Invariante 3: el neto negativo sigue cortando antes de escribir ──
sembrar();
const idSueldoChico = altaSueldo(100);
const idDescExcesivo  = altaDescuento(150, "Camiseta", "35");
const rNeg = confirmar([idSueldoChico, idDescExcesivo]);
check("un neto negativo no confirma", !rNeg.ok, JSON.stringify(rNeg));
igual("y no escribió ningún movimiento", movRows().length, 0);
igual("las filas siguen pendientes",
      [pjPorId(idSueldoChico)[PJ_IX.ESTADO], pjPorId(idDescExcesivo)[PJ_IX.ESTADO]],
      ["pendiente","pendiente"]);

// Un lote de puros descuentos con rubro no tiene sueldo del cual descontarlos.
sembrar();
const idSoloDesc = altaDescuento(0, "Camiseta", "35"); // monto 0: pasa la guarda del neto negativo
const rSolo = confirmar([idSoloDesc]);
check("un lote de puras contrapartidas no confirma", !rSolo.ok, JSON.stringify(rSolo));
igual("tampoco escribió nada", movRows().length, 0);

// ── Dos contrapartidas de rubros distintos en la misma liquidación ──
sembrar();
const idSueldo9c = altaSueldo(100);
const idCam9c    = altaDescuento(20, "Camiseta", "35");
const idMulta9c  = altaDescuento(5,  "Multa",    "10");
confirmar([idSueldo9c, idCam9c, idMulta9c]);
igual("un egreso y dos ingresos", movRows().length, 3);
igual("el egreso sigue por el bruto", Number(egresoDe()[7]), 100);
igual("cada ingreso en su rubro", ingresosDe().map(m => m[3]).sort(), ["10","35"]);
igual("los dos vinculados al mismo egreso",
      ingresosDe().map(m => JSON.parse(m[22])[0].egresoId), [egresoDe()[0], egresoDe()[0]]);
check("la observación del egreso los nombra a los dos",
      egresoDe()[15].indexOf("Descontado y cobrado aparte: Camiseta $20, Multa $5") >= 0, egresoDe()[15]);

// ── Borrar el egreso revierte las dos filas ───────────────────
const rDel9 = handleAction({ action: "deleteMov", id: egresoDe()[0] });
igual("deleteMov revierte las tres filas del jugador", rDel9.revertido.jugadores.length, 3);
igual("el sueldo volvió a pendiente",   pjPorId(idSueldo9c)[PJ_IX.ESTADO], "pendiente");
igual("el descuento con rubro también", pjPorId(idCam9c)[PJ_IX.ESTADO],    "pendiente");
// El ingreso sigue existiendo con el vínculo colgado — es exactamente lo que checkIntegridad
// reporta, y por eso no hace falta lógica nueva para detectarlo.
const rInt9 = handleAction({ action: "checkIntegridad" });
check("checkIntegridad detecta los vínculos colgados del ingreso huérfano",
      rInt9.problemas.some(p => p.grupo === "Reintegros"), JSON.stringify(rInt9.problemas));

// ══════════════════════════════════════════════════════════════
// Volver a poner "No jugó" a un jugador que ya estaba cargado tiene que deshacer su pago, no
// dejarlo pendiente: si la fila sobrevive, la columna Final sigue mostrando el monto viejo y —lo
// grave— el jugador queda en Transferencias listo para cobrar un partido que no jugó.
seccion("10 · Cambiar el rol a 'No jugó' quita la fila de pago");
sembrar();
const guardarRol = rol => handleAction({ action: "saveRoster", partidoId: "p1", roster: [
  { jugadorId:"j1", jugadorNombre:"GOMEZ", rol,
    montoBase: rol === "noJugo" ? 0 : 10000, ajuste: 0, motivoAjuste: "",
    montoFinal: rol === "noJugo" ? 0 : 10000, mes: "2026-06" }
]});
const filasPartido = () => pjRows().filter(r => r[PJ_IX.TIPO] === "partido");

guardarRol("titular");
igual("cargarlo como titular deja su fila pendiente", filasPartido().length, 1);
igual("por el monto del rol", Number(filasPartido()[0][7]), 10000);

guardarRol("noJugo");
igual("volver a 'No jugó' le saca la fila", filasPartido().length, 0);
igual("y el roster lo deja como no jugó",
      filas(S.ROS).filter(r => r[0] === "p1" && r[1] === "j1").map(r => r[3]), ["noJugo"]);

// Y se puede volver a cargar sin que queden dos filas.
guardarRol("suplente");
igual("volver a cargarlo crea una sola fila", filasPartido().length, 1);
igual("con el monto nuevo", Number(filasPartido()[0][7]), 10000);

// El premio del partido NO se toca: vive en su propia fila (PartidosIncluidos "[]") y se maneja
// desde 🏆. Que el jugador no haya jugado no es motivo para borrarle un premio ya cargado.
sembrar();
guardarRol("titular");
const idPremioDelPartido = altaPremio(3000, "Gol", "p1");
guardarRol("noJugo");
igual("la fila del partido se fue", filasPartido().length, 0);
igual("pero el premio sigue ahí",   pjPorId(idPremioDelPartido)[PJ_IX.ESTADO], "pendiente");
igual("con su monto intacto",       Number(pjPorId(idPremioDelPartido)[7]), 3000);

// Una fila YA PAGADA no se toca: borrarla dejaría un egreso registrado sin la fila que lo explica,
// y el jugador figuraría cobrable de nuevo por algo que ya se le transfirió.
seccion("11 · Una fila ya pagada no se borra al marcar 'No jugó'");
sembrar();
const idPagado = altaPartido(10000);
confirmar([idPagado]);
igual("quedó pagada", pjPorId(idPagado)[PJ_IX.ESTADO], "pagado");
const movsAntesDeNoJugo = movRows().length;
guardarRol("noJugo");
igual("la fila pagada sigue ahí", pjPorId(idPagado) !== undefined, true);
igual("y sigue pagada",          pjPorId(idPagado)[PJ_IX.ESTADO], "pagado");
igual("sin tocar los movimientos", movRows().length, movsAntesDeNoJugo);

// ══════════════════════════════════════════════════════════════
// Parte del plantel es cuerpo técnico y su sueldo va al rubro 18, no al 19. El rubro vive en la
// ficha (Config Jugadores) y no se elige en cada liquidación: un DT es siempre un DT.
seccion("12 · El rubro del sueldo sale de la ficha del jugador");

/** Siembra la ficha de j2 (mensual) con un CodRubroSueldo puntual. */
function fichaConRubro(cod) {
  handleAction({ action: "saveConfigJugador", config: {
    idJugador: "j2", nombre: "PEREZ", montoTitular: 50000, montoSuplenteConMin: 0,
    montoSuplente: 0, frecuencia: "mensual", alias: "alias.perez", premios: [],
    celular: "", codRubroSueldo: cod
  }});
}
/** Sueldo mensual de j2, listo para liquidar. */
function sueldoJ2(monto) {
  return handleAction({ action: "savePagoJugador", pago: {
    jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [],
    montoBase: monto, ajuste: 0, motivoAjuste: "", montoFinal: monto,
    estado: "pendiente", etiqueta: "Junio", mes: "2026-06", tipo: "periodico", partidoId: ""
  }}).id;
}
const egr12 = () => movRows().find(m => m[18] === "EGRESO");

sembrar(); fichaConRubro("18");
confirmar([sueldoJ2(100)]);
igual("con la ficha en 18, el egreso sale en 18", egr12()[3], "18");
igual("con el nombre del catálogo",               egr12()[4], "SUELDO DT Y CT");
igual("y la categoría del catálogo",              egr12()[5], "Jugadores y Cuerpo Técnico");

sembrar();  // sin tocar la ficha: el campo llega vacío
confirmar([sueldoJ2(100)]);
igual("sin el campo, sigue saliendo en 19, como antes de este cambio", egr12()[3], "19");
igual("con su nombre",                                                 egr12()[4], "SUELDO JUGADORES");

sembrar(); fichaConRubro("999");
confirmar([sueldoJ2(100)]);
igual("un código que no está en el catálogo cae al 19", egr12()[3], "19");
igual("y no escribe un rubro inventado",                egr12()[4], "SUELDO JUGADORES");

// El rubro de la ficha manda sobre el EGRESO; el INGRESO de contrapartida conserva el suyo.
sembrar(); fichaConRubro("18");
const idSueldo12 = sueldoJ2(100);
const idCam12 = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: -20, ajuste: 0,
  motivoAjuste: "", montoFinal: -20, estado: "pendiente", etiqueta: "Camiseta", mes: "2026-06",
  tipo: "descuento", partidoId: "", codRubroContra: "35"
}}).id;
confirmar([idSueldo12, idCam12]);
igual("el EGRESO toma el rubro de la ficha",   egr12()[3], "18");
igual("y el INGRESO mantiene el suyo",         movRows().find(m => m[18] === "INGRESO")[3], "35");
igual("el egreso sigue por el bruto",          Number(egr12()[7]), 100);

seccion("13 · El override del modal de liquidación");
const confirmarCon = (ids, cod) => handleAction({
  action: "confirmarPagosJugadores", ids, cuenta: "MACRO", medioPago: "TRANSFERENCIA",
  fechaPago: "2026-06-20", codRubroSueldo: cod
});

sembrar(); fichaConRubro("19");
confirmarCon([sueldoJ2(100)], "18");
igual("el override pisa a la ficha", egr12()[3], "18");
igual("con el nombre correcto",      egr12()[4], "SUELDO DT Y CT");

sembrar(); fichaConRubro("19");
confirmarCon([sueldoJ2(100)], "999");
igual("un override basura se ignora y vale la ficha", egr12()[3], "19");

// Un lote de dos jugadores: el override sería ambiguo (no se sabe a quién corresponde), así que se
// descarta y cada uno usa su ficha. El front manda siempre uno solo, pero el backend soporta lotes.
sembrar(); fichaConRubro("18");
const idJ1_13 = altaPartido(10000);          // j1, ficha sin rubro → 19
const idJ2_13 = sueldoJ2(100);               // j2, ficha en 18
confirmarCon([idJ1_13, idJ2_13], "18");
const porJugador13 = {};
movRows().filter(m => m[18] === "EGRESO").forEach(m => { porJugador13[m[24]] = m[3]; });
igual("con dos jugadores el override se ignora: j1 usa su ficha (vacía → 19)", porJugador13["j1"], "19");
igual("y j2 la suya (18)",                                                      porJugador13["j2"], "18");

// ══════════════════════════════════════════════════════════════
// El punto entero de esta fase: descontar un adelanto YA REGISTRADO no genera contabilidad nueva.
// El circuito completo: el 1/8 se le dan $20 y se cargan como EGRESO rubro 19; a fin de mes se
// liquida 100 − 20 → EGRESO 80. Total del rubro 19 en el mes: 20 + 80 = 100. Si el descuento
// además generara un movimiento, el rubro sumaría 120 y el jugador figuraría cobrando de más.
seccion("14 · El adelanto se marca al cargarlo, en un solo POST");

/** El EGRESO del adelanto, tal como lo manda el formulario de movimientos. */
function altaAdelanto(monto, concepto, descontarDelSueldo) {
  return handleAction({ action: "saveMov",
    mov: { id: "", mes: "202606", fecha: "2026-06-01", codRubro: "19", concepto,
           egreso: monto, cuenta: "MACRO", modoPago: "TRANSFERENCIA",
           jugadorCT: "PEREZ", jugadorId: "j2", tipo: "EGRESO" },
    descontarDelSueldo });
}
const descuentos = () => pjRows().filter(r => r[PJ_IX.TIPO] === "descuento");

sembrar();
const rAd = altaAdelanto(20, "Adelanto de sueldo", { mes: "2026-06" });
check("el alta sale bien", rAd.ok, JSON.stringify(rAd));
igual("se creó UNA fila de descuento", descuentos().length, 1);
const filaAd = descuentos()[0];
igual("con el monto en negativo",                Number(filaAd[7]), -20);
igual("y el montoBase también",                  Number(filaAd[4]), -20);
igual("tipada como descuento",                   filaAd[PJ_IX.TIPO], "descuento");
igual("pendiente",                               filaAd[PJ_IX.ESTADO], "pendiente");
igual("del jugador del movimiento",              filaAd[1], "j2");
igual("con el concepto como etiqueta",           filaAd[11], "Adelanto de sueldo");
igual("en el mes elegido",                       filaAd[13], "2026-06");
igual("apuntando al movimiento recién creado",   filaAd[PJ_IX.MOV_ORIGEN], rAd.id);
igual("sin rubro de contrapartida",              filaAd[PJ_IX.CONTRA], "");
igual("y sin MovimientoID: todavía no se liquidó nada", filaAd[PJ_IX.MOV_ID], "");
igual("el movimiento del adelanto es UNO SOLO",  movRows().length, 1);
check("la respuesta trae la fila entera para el front",
      rAd.descuento && rAd.descuento.id === filaAd[0] && rAd.descuento.montoFinal === -20,
      JSON.stringify(rAd.descuento));
igual("listPagosJugadores la devuelve con el link",
      handleAction({ action: "listPagosJugadores" }).pagosJugadores[0].movimientoOrigenId, rAd.id);

// Regresión: sin la marca, saveMov tiene que seguir haciendo exactamente lo de antes.
sembrar();
altaAdelanto(20, "Adelanto de sueldo");
igual("sin la marca no se crea ninguna fila", pjRows().length, 0);
igual("y el movimiento se guarda igual",      movRows().length, 1);

// El mes es opcional: sin él cae en el de la fecha del movimiento, que es lo que el formulario
// propone por defecto.
sembrar();
altaAdelanto(20, "Adelanto", { mes: "" });
igual("sin mes elegido, se imputa al de la fecha del movimiento", descuentos()[0][13], "2026-06");

// Un movimiento sin jugador identificable no puede generar la fila: una fila con el nombre suelto
// no la arrastra un renombre y queda huérfana. Avisa en vez de inventarla.
sembrar();
const rSinJug = handleAction({ action: "saveMov",
  mov: { id: "", mes: "202606", fecha: "2026-06-01", codRubro: "19", concepto: "Adelanto",
         egreso: 20, cuenta: "MACRO", tipo: "EGRESO", jugadorCT: "NO EXISTE" },
  descontarDelSueldo: { mes: "2026-06" } });
check("el movimiento se guarda igual", rSinJug.ok, JSON.stringify(rSinJug));
igual("pero no se inventa la fila", pjRows().length, 0);
check("y avisa por qué", (rSinJug.avisoDescuento || "").indexOf("NO EXISTE") >= 0, rSinJug.avisoDescuento);

// Movimiento viejo sin JugadorID: se resuelve por nombre contra la hoja Jugadores. El nombre sirve
// para ENCONTRAR el id, nunca para reemplazarlo.
sembrar();
handleAction({ action: "saveMov",
  mov: { id: "", mes: "202606", fecha: "2026-06-01", codRubro: "18", concepto: "Adelanto",
         egreso: 20, cuenta: "MACRO", tipo: "EGRESO", jugadorCT: "PEREZ" },
  descontarDelSueldo: { mes: "2026-06" } });
igual("sin JugadorID, el jugador se resuelve por nombre", descuentos()[0][1], "j2");

// ══════════════════════════════════════════════════════════════
seccion("15 · Liquidar con el adelanto descontado no crea contabilidad nueva");
sembrar();
const rAd15 = altaAdelanto(20, "Adelanto de sueldo", { mes: "2026-06" });
const idDesc15   = descuentos()[0][0];
const idSueldo15 = altaSueldo(100);
const r15 = confirmar([idSueldo15, idDesc15]);
check("la liquidación sale bien", r15.ok, JSON.stringify(r15));
igual("hay DOS movimientos: el adelanto y el sueldo, ninguno más", movRows().length, 2);
igual("y ninguno es un INGRESO", movRows().filter(m => m[18] === "INGRESO").length, 0);
const egr15 = movRows().find(m => m[0] !== rAd15.id);
igual("el egreso del sueldo sale por el bruto MENOS el adelanto", Number(egr15[7]), 80);
igual("los ítems cierran con ese neto",
      items(egr15).reduce((s,it) => s + Number(it.monto||0), 0), 80);
igual("el total del rubro 19 en el mes es el sueldo entero, ni más ni menos",
      movRows().filter(m => m[3] === "19").reduce((s,m) => s + Number(m[7]||0), 0), 100);
igual("el descuento queda pagado contra el egreso del sueldo", pjPorId(idDesc15)[PJ_IX.MOV_ID], egr15[0]);
igual("y conserva el link a su adelanto",  pjPorId(idDesc15)[PJ_IX.MOV_ORIGEN], rAd15.id);

// ══════════════════════════════════════════════════════════════
seccion("16 · Rubro de contrapartida y movimiento de origen son excluyentes");
sembrar();
const r16 = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: -20, ajuste: 0,
  motivoAjuste: "", montoFinal: -20, estado: "pendiente", etiqueta: "Camiseta", mes: "2026-06",
  tipo: "descuento", partidoId: "", codRubroContra: "35", movimientoOrigenId: "mX"
}});
check("los dos juntos se rechazan", !r16.ok, JSON.stringify(r16));
igual("y no se escribió nada",      pjRows().length, 0);
check("cada uno por separado sí entra",
      handleAction({ action: "savePagoJugador", pago: {
        jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [], montoBase: -20, ajuste: 0,
        motivoAjuste: "", montoFinal: -20, estado: "pendiente", etiqueta: "Camiseta", mes: "2026-06",
        tipo: "descuento", partidoId: "", codRubroContra: "35"
      }}).ok);

// ══════════════════════════════════════════════════════════════
seccion("17 · Borrar el adelanto deja vivo el descuento, sin referencia colgada");
sembrar();
const rAd17 = altaAdelanto(20, "Adelanto de sueldo", { mes: "2026-06" });
const idDesc17 = descuentos()[0][0];

// Antes de borrar: si el link apuntara a la nada, checkIntegridad tiene que gritarlo. Se prueba
// primero con un link falso, para verificar que el chequeo nuevo realmente detecta algo.
SHEETS[S.PJ].set(2, PJ_IX.MOV_ORIGEN + 1, "m-inexistente");
const rIntColgado = handleAction({ action: "checkIntegridad" });
check("un MovimientoOrigenID colgado se reporta como error",
      rIntColgado.problemas.some(p => p.nivel === "error" && p.detalle.indexOf("movimiento que ya no existe") >= 0),
      JSON.stringify(rIntColgado.problemas));
check("con el nombre del jugador y el monto, para poder encontrarlo",
      rIntColgado.problemas.some(p => p.detalle.indexOf("PEREZ") >= 0 && p.detalle.indexOf("20") >= 0),
      JSON.stringify(rIntColgado.problemas));
SHEETS[S.PJ].set(2, PJ_IX.MOV_ORIGEN + 1, rAd17.id);   // se restaura el link bueno

const rDel17 = handleAction({ action: "deleteMov", id: rAd17.id });
check("el borrado sale bien", rDel17.ok, JSON.stringify(rDel17));
igual("informa cuántos descuentos quedaron sin link", (rDel17.revertido.desvinculados||[]).length, 1);
igual("el descuento SIGUE existiendo", pjRows().filter(r => r[0] === idDesc17).length, 1);
igual("con su monto intacto",          Number(pjPorId(idDesc17)[7]), -20);
igual("pero sin la referencia colgada", pjPorId(idDesc17)[PJ_IX.MOV_ORIGEN], "");
igual("y checkIntegridad ya no reporta nada", handleAction({ action: "checkIntegridad" }).errores, 0);

// Para los links que quedaron colgados con una versión anterior a este cascade: repararlos limpia
// la referencia sin tocar el descuento, que sigue siendo plata que el jugador debe.
SHEETS[S.PJ].set(2, PJ_IX.MOV_ORIGEN + 1, "m-inexistente");
const rRep = handleAction({ action: "repararPagosHuerfanos" });
igual("repararPagosHuerfanos informa el link limpiado", (rRep.desvinculados||[]).length, 1);
igual("el descuento sigue cargado",   pjRows().filter(r => r[0] === idDesc17).length, 1);
igual("con su monto",                 Number(pjPorId(idDesc17)[7]), -20);
igual("y sin la referencia",          pjPorId(idDesc17)[PJ_IX.MOV_ORIGEN], "");
igual("no vuelve a reparar nada",     (handleAction({ action: "repararPagosHuerfanos" }).desvinculados||[]).length, 0);

// ══════════════════════════════════════════════════════════════
seccion("18 · Editar el movimiento del adelanto sincroniza su descuento");
const editarAdelanto = (movId, campos, descontarDelSueldo) => handleAction({ action: "updateMov",
  mov: Object.assign({ id: movId, mes: "202606", fecha: "2026-06-01", codRubro: "19",
                       concepto: "Adelanto de sueldo", egreso: 20, cuenta: "MACRO",
                       jugadorCT: "PEREZ", jugadorId: "j2", tipo: "EGRESO" }, campos),
  descontarDelSueldo });

// Destildado → tildado: se crea.
sembrar();
const rAd18 = altaAdelanto(20, "Adelanto de sueldo");
igual("sin marca no hay descuento", descuentos().length, 0);
const rTildar = editarAdelanto(rAd18.id, {}, { mes: "2026-06" });
check("tildarla al editar sale bien", rTildar.ok, JSON.stringify(rTildar));
igual("y crea la fila", descuentos().length, 1);
igual("apuntando al movimiento", descuentos()[0][PJ_IX.MOV_ORIGEN], rAd18.id);

// Sigue tildado y cambia el monto/concepto: la fila pendiente se actualiza para que no queden
// desalineados (el jugador vería descontado un monto que no es el del adelanto).
const rCambio = editarAdelanto(rAd18.id, { egreso: 35, concepto: "Adelanto (corregido)" }, { mes: "2026-06" });
check("el cambio sale bien", rCambio.ok, JSON.stringify(rCambio));
igual("no se duplicó la fila", descuentos().length, 1);
igual("el descuento sigue el monto nuevo", Number(descuentos()[0][7]), -35);
igual("y el concepto nuevo",               descuentos()[0][11], "Adelanto (corregido)");
check("la respuesta devuelve la fila actualizada",
      rCambio.descuento && rCambio.descuento.montoFinal === -35, JSON.stringify(rCambio.descuento));

// Tildado → destildado con el descuento pendiente: se borra.
const idDesc18 = descuentos()[0][0];
const rDestildar = editarAdelanto(rAd18.id, { egreso: 35 }, false);
check("destildarla sale bien", rDestildar.ok, JSON.stringify(rDestildar));
igual("la fila se borró",      descuentos().length, 0);
igual("y se avisa cuál, para sacarla de la vista sin refrescar", rDestildar.descuentoBorradoId, idDesc18);

// Editar un movimiento cualquiera (sin mandar el campo) no toca ningún descuento.
sembrar();
const rAd18b = altaAdelanto(20, "Adelanto", { mes: "2026-06" });
editarAdelanto(rAd18b.id, { concepto: "Otra cosa" });
igual("omitir el campo deja el descuento donde estaba", descuentos().length, 1);

// ══════════════════════════════════════════════════════════════
seccion("19 · Un descuento ya liquidado no se puede desmarcar");
sembrar();
const rAd19 = altaAdelanto(20, "Adelanto de sueldo", { mes: "2026-06" });
const idDesc19 = descuentos()[0][0];
confirmar([altaSueldo(100), idDesc19]);
igual("el descuento quedó pagado", pjPorId(idDesc19)[PJ_IX.ESTADO], "pagado");

const movsAntes19 = movRows().length;
const rNo = editarAdelanto(rAd19.id, {}, false);
check("destildar la marca se rechaza", !rNo.ok, JSON.stringify(rNo));
check("el error dice que ya se liquidó", (rNo.error||"").indexOf("ya se aplicó en la liquidación") >= 0, rNo.error);
igual("el descuento sigue ahí",   pjRows().filter(r => r[0] === idDesc19).length, 1);
igual("y sigue pagado",           pjPorId(idDesc19)[PJ_IX.ESTADO], "pagado");
igual("no se tocó ningún movimiento", movRows().length, movsAntes19);
igual("y el movimiento del adelanto conserva su concepto original",
      movRows().find(m => m[0] === rAd19.id)[6], "Adelanto de sueldo");

// ══════════════════════════════════════════════════════════════
// El Mes se escribe con formato "@" o Sheets lo guarda como Date ("2026-06" es una fecha válida
// para él). savePagoJugador lo hacía desde siempre; saveRoster no, y por eso la hoja quedaba con
// unas filas en texto y otras en fecha. normalizarMesPJ_ lo tapa al leer, pero cualquier lectura
// directa de la planilla se rompe.
seccion("20 · saveRoster escribe el Mes como texto en las dos ramas");
sembrar();
const formatoMes = id => {
  const sh = SHEETS[S.PJ];
  const fila = sh.rows.findIndex(r => r[0] === id) + 1;
  return sh.getFormat(fila, 14);
};

const idRos20 = altaPartido(10000);   // rama de alta (appendRow)
igual("el alta escribe el Mes con formato texto", formatoMes(idRos20), "@");
igual("y con el valor correcto", pjPorId(idRos20)[13], "2026-06");

// Volver a guardar el mismo roster cae en la rama de update.
handleAction({ action: "saveRoster", partidoId: "p1", roster: [
  { jugadorId:"j1", jugadorNombre:"GOMEZ", rol:"titular",
    montoBase: 12000, ajuste: 0, motivoAjuste: "", montoFinal: 12000, mes: "2026-07" }
]});
igual("el update también lo escribe como texto", formatoMes(idRos20), "@");
igual("con el mes nuevo",                        pjPorId(idRos20)[13], "2026-07");
igual("y sin duplicar la fila",                  pjRows().filter(r => r[PJ_IX.TIPO] === "partido").length, 1);
igual("listPagosJugadores lo lee igual",
      handleAction({ action: "listPagosJugadores" }).pagosJugadores.find(p => p.id === idRos20).mes, "2026-07");

// ══════════════════════════════════════════════════════════════
// El PartidoID de un descuento es contexto de carga, no imputación: si se propagara al movimiento,
// el ítem del descuento entraría en ItemsDetalle con ese partido y el concepto del egreso nombraría
// una fecha que el descuento no paga.
seccion("21 · El PartidoID de un descuento no se propaga al movimiento");
sembrar();
const idPart21 = altaPartido(10000);
const idDesc21 = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j1", jugadorNombre:"GOMEZ", partidosIncluidos: [],
  montoBase: -2000, ajuste: 0, motivoAjuste: "", montoFinal: -2000,
  estado: "pendiente", etiqueta: "Multa", mes: "2026-06", tipo: "descuento", partidoId: "p1"
}}).id;
igual("la fila guarda el partido desde el que se cargó", pjPorId(idDesc21)[PJ_IX.PARTIDO_ID], "p1");

confirmar([idPart21, idDesc21]);
const mov21 = movRows()[0];
const itemDesc21 = items(mov21).find(it => it.desc === "Multa");
igual("el egreso netea el descuento", Number(mov21[7]), 8000);
igual("pero su ítem va SIN partido",  itemDesc21.partidoId, "");
igual("el ítem del partido sí lo lleva", items(mov21).find(it => it.desc !== "Multa").partidoId, "p1");

// ══════════════════════════════════════════════════════════════
// La columna Fecha es la del HECHO (cuándo se entregó el adelanto), no la de la transferencia de
// liquidación: esa es FechaPago y se llena recién al confirmar. Antes la fecha del adelanto
// terminaba escrita a mano adentro de la Etiqueta.
seccion("22 · La columna Fecha va y vuelve entera");
sembrar();
const idF22 = handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [],
  montoBase: -5000, ajuste: 0, motivoAjuste: "", montoFinal: -5000,
  estado: "pendiente", etiqueta: "Adelanto", mes: "2026-06", tipo: "descuento",
  partidoId: "", fecha: "2026-06-21"
}}).id;
const leidoF22 = () => handleAction({ action: "listPagosJugadores" }).pagosJugadores.find(p => p.id === idF22);
igual("el alta la guarda", leidoF22().fecha, "2026-06-21");
igual("y la FechaPago sigue vacía hasta liquidar", leidoF22().fechaPago, "");

// Update: la rama de edición también la escribe.
handleAction({ action: "savePagoJugador", pago: Object.assign(leidoF22(), { fecha: "2026-06-22" }) });
igual("el update la reescribe", leidoF22().fecha, "2026-06-22");

// Un Date de Sheets se normaliza igual que el resto de las fechas.
SHEETS[S.PJ].rows[SHEETS[S.PJ].rows.findIndex(r => r[0] === idF22)][18] = new Date(2026, 5, 23);
igual("un Date de Sheets se lee como YYYY-MM-DD", leidoF22().fecha, "2026-06-23");

// Filas viejas: sin backfill, vacío es válido y no rompe nada.
const idViejo22 = altaPremio(3000, "Gol", "p1");
igual("una fila sin fecha se lee vacía",
      handleAction({ action: "listPagosJugadores" }).pagosJugadores.find(p => p.id === idViejo22).fecha, "");
check("y se puede liquidar igual", confirmar([idViejo22]).ok);

// ══════════════════════════════════════════════════════════════
// Un rubro de sueldo (18/19) como contrapartida haría que la liquidación registre un INGRESO en un
// rubro de EGRESOS: infla ingresos y subvalúa el gasto de sueldos. Es el error que ya estaba
// cargado en la hoja. El selector ya no los ofrece; el backend lo corta igual.
seccion("23 · La contrapartida no puede ser un rubro de sueldos");
sembrar();
const descSueldo = cod => handleAction({ action: "savePagoJugador", pago: {
  jugadorId:"j2", jugadorNombre:"PEREZ", partidosIncluidos: [],
  montoBase: -150000, ajuste: 0, motivoAjuste: "", montoFinal: -150000,
  estado: "pendiente", etiqueta: "Adelanto entregado", mes: "2026-06", tipo: "descuento",
  partidoId: "", codRubroContra: cod
}});

const r23a = descSueldo("19");
check("SUELDO JUGADORES se rechaza", !r23a.ok, JSON.stringify(r23a));
check("el error nombra el rubro",    (r23a.error||"").indexOf("SUELDO JUGADORES") >= 0, r23a.error);
check("y explica que va por el adelanto", (r23a.error||"").indexOf("adelanto") >= 0, r23a.error);
igual("no se escribió ninguna fila", pjRows().length, 0);

const r23b = descSueldo("18");
check("SUELDO DT Y CT también", !r23b.ok, JSON.stringify(r23b));
igual("y tampoco escribió nada", pjRows().length, 0);

// Un rubro de contrapartida legítimo sigue funcionando igual.
const r23c = descSueldo("35");
check("INDUMENTARIA Y MERCH. se acepta", r23c.ok, JSON.stringify(r23c));
igual("y queda guardado", pjPorId(r23c.id)[PJ_IX.CONTRA], "35");

resumen();
