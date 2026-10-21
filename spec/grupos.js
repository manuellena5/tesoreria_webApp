/* Integrantes de grupo guardados en el movimiento — `node spec/grupos.js`
 *
 * Un movimiento cargado a un grupo guarda en MiembrosGrupo quiénes lo formaban. Así el reparto
 * por persona (Resumen › Jugadores, Reportes) no cambia cuando alguien sale del grupo. Se prueba
 * el alta, que editar lo conserve (y que cambiar de grupo lo renueve), la pasada que completa
 * los movimientos viejos y que el front reparta con lo guardado.
 */
const H = require("./harness");
const { reset, hoja, filas, movRow, check, igual, seccion, resumen, handleAction } = H;

const MOVC = ["ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto","Egreso","Ingreso","MontoFinal",
  "Cuenta","CuentaDestino","ModoPago","JugadorCT","Adherente","Observacion","Comprobante","SeguroReintegro",
  "Tipo","timestamp","PartidoID","EventoID","Vinculos","ItemsDetalle","JugadorID","AdherenteID","Adjuntos",
  "ImpDC","CuentaID","CuentaDestinoID","MiembrosGrupo"];
const GRPC = ["ID","Nombre","Miembros","Activo"];
const MG = 30;   // índice 0-based de MiembrosGrupo

function sembrar() {
  reset();
  hoja("Movimientos", MOVC);
  hoja("Grupos", GRPC, [["g1", "CASA 1", JSON.stringify(["j1", "j2", "j3"]), "true"],
                        ["g2", "CASA 2", JSON.stringify(["j4"]), "true"]]);
  hoja("Jugadores", ["ID","Nombre","Activo"], [["j1","LENCINA","true"],["j2","PEREZ","true"],["j3","GOMEZ","true"],["j4","DIAZ","true"]]);
}
const setMiembros = (gid, ids) => { const f = filas("Grupos").find(r => r[0] === gid); f[2] = JSON.stringify(ids); };
const mov = id => handleAction({ action: "listMov" }).movimientos.find(m => m.id === id);
const base = { mes: "202610", fecha: "2026-10-05", codRubro: "45", egreso: 90000, montoFinal: 90000, cuenta: "MP", tipo: "EGRESO" };

seccion("Alta: guarda los integrantes del grupo");
sembrar();
handleAction({ action: "saveMov", mov: { ...base, id: "m1", jugadorCT: "CASA 1", jugadorId: "g1" } });
igual("toma los integrantes del grupo hoy", mov("m1").miembrosGrupo, ["j1", "j2", "j3"]);
handleAction({ action: "saveMov", mov: { ...base, id: "m2", jugadorCT: "LENCINA", jugadorId: "j1" } });
igual("un movimiento de un jugador suelto no guarda nada", filas("Movimientos")[1][MG], "");
handleAction({ action: "saveMov", mov: { ...base, id: "m3", jugadorCT: "CASA 1", jugadorId: "g1", miembrosGrupo: ["j1", "j2"] } });
igual("si el cliente manda los que vio al guardar, valen esos", mov("m3").miembrosGrupo, ["j1", "j2"]);

seccion("Alguien sale del grupo: lo guardado no cambia");
setMiembros("g1", ["j1", "j2"]);
igual("el movimiento sigue con los tres", mov("m1").miembrosGrupo, ["j1", "j2", "j3"]);
handleAction({ action: "updateMov", mov: { ...base, id: "m1", jugadorCT: "CASA 1", jugadorId: "g1", egreso: 120000, montoFinal: 120000 } });
igual("editar el monto los conserva", mov("m1").miembrosGrupo, ["j1", "j2", "j3"]);
igual("y el monto sí cambió", mov("m1").egreso, 120000);
handleAction({ action: "updateMov", mov: { ...base, id: "m1", jugadorCT: "CASA 2", jugadorId: "g2" } });
igual("pasarlo a otro grupo toma los del grupo nuevo", mov("m1").miembrosGrupo, ["j4"]);
handleAction({ action: "updateMov", mov: { ...base, id: "m1", jugadorCT: "LENCINA", jugadorId: "j1" } });
igual("pasarlo a un jugador suelto los borra", mov("m1").miembrosGrupo, []);

seccion("Fijar integrantes en los movimientos viejos");
sembrar();
hoja("Movimientos", MOVC, [
  movRow({ ...base, id: "v1", jugadorCT: "CASA 1", jugadorId: "g1" }),
  movRow({ ...base, id: "v2", jugadorCT: "GRP:CASA 1" }),                       // viejo, sin ID
  movRow({ ...base, id: "v3", jugadorCT: "CASA 1", jugadorId: "g1", miembrosGrupo: ["j9"] }),
  movRow({ ...base, id: "v4", jugadorCT: "PEREZ", jugadorId: "j2" }),
]);
const r = handleAction({ action: "fijarMiembrosGrupos" });
igual("informa cuántos fijó y cuántos ya tenían", [r.fijados, r.yaTenian], [2, 1]);
igual("con ID de grupo", mov("v1").miembrosGrupo, ["j1", "j2", "j3"]);
igual("sin ID, por el nombre", mov("v2").miembrosGrupo, ["j1", "j2", "j3"]);
igual("no pisa uno que ya tenía", mov("v3").miembrosGrupo, ["j9"]);
igual("no toca los de un jugador suelto", filas("Movimientos")[3][MG], "");
setMiembros("g1", ["j1"]);
igual("correrla de nuevo no cambia lo fijado", [handleAction({ action: "fijarMiembrosGrupos" }).fijados, mov("v1").miembrosGrupo], [0, ["j1", "j2", "j3"]]);

resumen();
