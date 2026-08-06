/* Pruebas de la acción "bootstrap" — `node spec/bootstrap.js`
 *
 * bootstrap junta en una sola ejecución lo que antes eran 12 consultas. La regla que hay que
 * sostener es que devuelva EXACTAMENTE lo mismo que las consultas sueltas: si se desincroniza,
 * la app arranca con datos distintos a los que ve al refrescar, y el bug es imposible de ver.
 */

const H = require("./harness.js");
const { SHEETS, Sheet, reset, hoja, movRow, check, igual, seccion, resumen, handleAction } = H;

// Las constantes de Code.gs quedan expuestas por el harness a través de handleAction, pero
// los nombres de hoja los necesitamos acá: se leen del mismo módulo ya evaluado.
const C = require("./harness.js");

function sembrarPlanilla() {
  reset();
  hoja("Movimientos", ["ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto","Egreso","Ingreso",
    "MontoFinal","Cuenta","CuentaDestino","ModoPago","JugadorCT","Adherente","Observacion","Comprobante",
    "SeguroReintegro","Tipo","timestamp","PartidoID","EventoID","Vinculos","ItemsDetalle","JugadorID","AdherenteID"], [
    movRow({ id:"m1", mes:"202606", fecha:"2026-06-05", codRubro:"1", concepto:"Entradas",
             ingreso:15000, cuenta:"EFECTIVO", tipo:"INGRESO" }),
    movRow({ id:"m2", mes:"202606", fecha:"2026-06-06", codRubro:"19", concepto:"Pago jugador",
             egreso:50000, cuenta:"MACRO", tipo:"EGRESO", jugadorCT:"PEREZ", jugadorId:"j1" })
  ]);
  hoja("Jugadores",  ["ID","Nombre","Activo"], [["j1","PEREZ","true"],["j2","GOMEZ","true"]]);
  hoja("Grupos",     ["ID","Nombre","Miembros","Activo"], [["g1","LOS PIBES",'["j1"]',"true"]]);
  hoja("Adherentes", ["ID","Nombre","Activo","CuotaMensual","CuotasAnuales"], [["a1","LOPEZ","true",5000,8]]);
  hoja("Pagos_Adh",  ["ID","AdherenteID","AdherenteNombre","Mes","Estado","MovimientoID","timestamp"],
                     [["pg1","a1","LOPEZ","202606","PENDIENTE","","x"]]);
  hoja("Config",     ["Clave","Valor"], [["cuentas","MACRO,EFECTIVO"],["seeded","true"],["seededGranos","true"]]);
  hoja("Partidos",   ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo","Torneo"],
                     [["p1","2026-06-08","Colon","Fecha 3","LOCAL","true",""]]);
  hoja("Reservas",   ["ID","Fecha","Grano","Tipo","Kg","Nota","MovimientoID","timestamp"],
                     [["r1","2026-06-01","SOJA","INGRESO",1000,"","","x"]]);
  hoja("Eventos",    ["ID","Nombre","Fecha","Activo"], [["e1","Peña","2026-06-20","true"]]);
  hoja("Config Jugadores", ["IdJugador","Nombre","MontoTitular","MontoSuplenteConMin","MontoSuplente",
                            "Frecuencia","Alias","Activo","Premios"],
                     [["j1","PEREZ",50000,0,0,"partido","ali.as","true","[]"]]);
  hoja("Pagos Jugadores", ["ID","JugadorId","JugadorNombre","PartidosIncluidos","MontoBase","Ajuste",
                           "MotivoAjuste","MontoFinal","Estado","FechaPago","MedioPago","Etiqueta",
                           "MovimientoID","Mes","Tipo","PartidoID"],
                     [["pj1","j1","PEREZ",'["p1"]',50000,0,"",50000,"pendiente","","","","","2026-06","partido","p1"]]);
  hoja("Roster Partidos", ["IdPartido","JugadorId","JugadorNombre","Rol"], [["p1","j1","PEREZ","titular"]]);
}

seccion("1 · bootstrap trae todas las partes");
sembrarPlanilla();
const boot = handleAction({ action: "bootstrap" });
check("responde ok", boot.ok, JSON.stringify(boot).slice(0, 200));
igual("sin errores por hoja", Object.keys(boot.errores || {}), []);
[["movimientos",2],["jugadores",2],["grupos",1],["adherentes",1],["pagos",1],["partidos",1],
 ["reservas",1],["eventos",1],["configJugadores",1],["roster",1],["pagosJugadores",1]
].forEach(([clave, n]) => igual(`${clave}: ${n} fila${n!==1?"s":""}`, (boot[clave]||[]).length, n));
check("config viene como objeto", boot.config && typeof boot.config === "object", JSON.stringify(boot.config));

seccion("2 · Devuelve lo MISMO que las 12 consultas sueltas");
sembrarPlanilla();
const sueltas = {
  movimientos:     handleAction({ action:"listMov" }).movimientos,
  jugadores:       handleAction({ action:"listJugadores" }).jugadores,
  grupos:          handleAction({ action:"listGrupos" }).grupos,
  adherentes:      handleAction({ action:"listAdherentes" }).adherentes,
  pagos:           handleAction({ action:"listPagos" }).pagos,
  partidos:        handleAction({ action:"listPartidos" }).partidos,
  reservas:        handleAction({ action:"listReservas" }).reservas,
  eventos:         handleAction({ action:"listEventos" }).eventos,
  configJugadores: handleAction({ action:"listConfigJugadores" }).configJugadores,
  roster:          handleAction({ action:"listRoster" }).roster,
  pagosJugadores:  handleAction({ action:"listPagosJugadores" }).pagosJugadores,
};
sembrarPlanilla();
const boot2 = handleAction({ action: "bootstrap" });
Object.keys(sueltas).forEach(k =>
  igual(`${k} idéntico`, JSON.stringify(boot2[k]), JSON.stringify(sueltas[k])));
igual("config idéntico", JSON.stringify(boot2.config),
      JSON.stringify(handleAction({ action:"getConfig" }).config));

seccion("3 · Una hoja rota no tumba el arranque entero");
sembrarPlanilla();
// Simula una hoja que revienta al leerla: el resto tiene que llegar igual.
const original = SHEETS["Reservas"].getDataRange;
SHEETS["Reservas"].getDataRange = () => { throw new Error("hoja corrupta"); };
const boot3 = handleAction({ action: "bootstrap" });
SHEETS["Reservas"].getDataRange = original;
check("sigue respondiendo ok", boot3.ok, JSON.stringify(boot3).slice(0, 200));
igual("reservas viene en null", boot3.reservas, null);
check("y reporta cuál falló", Object.keys(boot3.errores || {}).indexOf("reservas") >= 0,
      JSON.stringify(boot3.errores));
igual("pero los movimientos llegaron igual", (boot3.movimientos || []).length, 2);
igual("y los jugadores también", (boot3.jugadores || []).length, 2);

seccion("4 · Planilla vacía (instalación nueva)");
reset();
const boot4 = handleAction({ action: "bootstrap" });
check("no explota", boot4.ok, JSON.stringify(boot4).slice(0, 200));
igual("devuelve listas vacías, no null", (boot4.jugadores || []).length, 0);
igual("sin errores", Object.keys(boot4.errores || {}), []);

resumen();
