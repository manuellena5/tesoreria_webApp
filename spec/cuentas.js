/* Pruebas del ABM de cuentas — `node spec/cuentas.js`
 *
 * Las cuentas pasan de ser texto en Config a una hoja con ID. Los movimientos guardan el ID además
 * del nombre (copia legible), así que renombrar una cuenta reescribe el nombre en todos sus
 * movimientos sin perder ninguno. Se prueba la migración desde Config, el alta, el renombre en
 * cascada, el borrado (sólo si no tiene movimientos) y la parte del front que arma `cuentas` e
 * `impDebCred` a partir de la hoja.
 */
const H = require("./harness");
const { reset, hoja, filas, movRow, check, igual, seccion, resumen, handleAction } = H;

const CFG = ["Clave", "Valor"];
const MOVC = ["ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto","Egreso","Ingreso","MontoFinal",
  "Cuenta","CuentaDestino","ModoPago","JugadorCT","Adherente","Observacion","Comprobante","SeguroReintegro",
  "Tipo","timestamp","PartidoID","EventoID","Vinculos","ItemsDetalle","JugadorID","AdherenteID","Adjuntos",
  "ImpDC","CuentaID","CuentaDestinoID"];

function sembrar() {
  reset();
  hoja("Config", CFG, [["cuentas", "MACRO,MP,EFECTIVO,CD"],
                       ["impDebCred", JSON.stringify({ MP: { alic: 0.6, internosExentos: ["MACRO"] } })]]);
  hoja("Movimientos", MOVC, [
    movRow({ id: "m1", mes: "202610", fecha: "2026-10-01", codRubro: "1", concepto: "Entradas", ingreso: 1000, montoFinal: 1000, cuenta: "MP", tipo: "INGRESO" }),
    movRow({ id: "m2", mes: "202610", fecha: "2026-10-02", codRubro: "49", concepto: "Pase", egreso: 500, montoFinal: 500, cuenta: "MACRO", cuentaDestino: "MP", tipo: "INTERNO" }),
    movRow({ id: "m3", mes: "202601", fecha: "2026-01-02", codRubro: "30", concepto: "Viejo", egreso: 100, montoFinal: 100, cuenta: "UALA", tipo: "EGRESO" }),
  ]);
}
const cuentas = () => handleAction({ action: "listCuentas" }).cuentas;
const porNombre = n => cuentas().find(c => c.nombre === n);
const mov = id => handleAction({ action: "listMov" }).movimientos.find(m => m.id === id);

seccion("1 · Migración desde Config");
sembrar();
const l = cuentas();
igual("las de Config, en orden y activas", l.filter(c => c.activa).map(c => c.nombre), ["MACRO", "MP", "EFECTIVO", "CD"]);
igual("las que sólo están en movimientos viejos entran desactivadas", l.filter(c => !c.activa).map(c => c.nombre), ["UALA"]);
igual("el impuesto pasa a la hoja", porNombre("MP").alic, 0.6);
igual("y los internos exentos por ID", porNombre("MP").internosExentos, [porNombre("MACRO").id]);
igual("los movimientos quedan con su ID de cuenta", [mov("m2").cuentaId, mov("m2").cuentaDestinoId], [porNombre("MACRO").id, porNombre("MP").id]);
igual("una segunda lectura no duplica", cuentas().length, 5);

seccion("2 · Alta");
let r = handleAction({ action: "saveCuenta", cuenta: { nombre: "  Comisión directiva  ", alic: 0 } });
check("se crea", r.ok, JSON.stringify(r));
igual("con el nombre limpio", r.cuenta.nombre, "Comisión directiva");
igual("al final del orden", r.cuenta.orden, 6);
igual("Config se mantiene al día para apps viejas", filas("Config").find(f => f[0] === "cuentas")[1], "MACRO,MP,EFECTIVO,CD,Comisión directiva");
r = handleAction({ action: "saveCuenta", cuenta: { nombre: "mp" } });
check("no deja repetir un nombre (sin importar mayúsculas)", !r.ok && /Ya existe/.test(r.error), JSON.stringify(r));
r = handleAction({ action: "saveCuenta", cuenta: { nombre: "" } });
check("ni crear una sin nombre", !r.ok);

seccion("3 · Renombrar");
const idMp = porNombre("MP").id;
// Un movimiento cargado por el backend sin ID (como los que arma Pagos a Jugadores) también se renombra.
const SHEETS = H.SHEETS;
SHEETS["Movimientos"].rows.push(movRow({ id: "m4", mes: "202610", fecha: "2026-10-05", codRubro: "30", concepto: "Sin id", egreso: 50, montoFinal: 50, cuenta: "MP", tipo: "EGRESO" }));
r = handleAction({ action: "saveCuenta", cuenta: { id: idMp, nombre: "MP Fútbol", alic: 0.6, internosExentos: [porNombre("MACRO").id] } });
check("guarda", r.ok, JSON.stringify(r));
igual("informa cuántos renombró (m1, destino de m2 y m4)", r.renombrados, 3);
igual("el ingreso ahora dice MP Fútbol", mov("m1").cuenta, "MP Fútbol");
igual("el interno también en el destino", mov("m2").cuentaDestino, "MP Fútbol");
igual("el que no tenía ID quedó vinculado", [mov("m4").cuenta, mov("m4").cuentaId], ["MP Fútbol", idMp]);
igual("el origen MACRO no se toca", mov("m2").cuenta, "MACRO");

seccion("4 · Movimientos nuevos");
handleAction({ action: "saveMov", mov: { id: "n1", mes: "202610", fecha: "2026-10-06", codRubro: "1", concepto: "x",
  ingreso: 10, cuenta: "mp fútbol", modoPago: "TRANSFERENCIA", tipo: "INGRESO" } });
igual("por nombre: toma el ID y el nombre oficial", [mov("n1").cuentaId, mov("n1").cuenta], [idMp, "MP Fútbol"]);
handleAction({ action: "saveMov", mov: { id: "n2", mes: "202610", fecha: "2026-10-06", codRubro: "1", concepto: "x",
  ingreso: 10, cuenta: "MP", cuentaId: idMp, modoPago: "TRANSFERENCIA", tipo: "INGRESO" } });
igual("cargado offline con el nombre viejo: manda el ID", mov("n2").cuenta, "MP Fútbol");
handleAction({ action: "updateMov", mov: { id: "n1", mes: "202610", fecha: "2026-10-06", codRubro: "1", concepto: "x",
  ingreso: 10, cuenta: "EFECTIVO", modoPago: "EFECTIVO", tipo: "INGRESO" } });
igual("editar a otra cuenta actualiza el ID", mov("n1").cuentaId, porNombre("EFECTIVO").id);

seccion("5 · Desactivar y borrar");
r = handleAction({ action: "deleteCuenta", id: porNombre("MACRO").id });
check("no borra una cuenta con movimientos", !r.ok && /Desactivala/.test(r.error), JSON.stringify(r));
r = handleAction({ action: "saveCuenta", cuenta: { id: porNombre("MACRO").id, nombre: "MACRO", activa: false } });
igual("se puede desactivar", porNombre("MACRO").activa, false);
igual("y sale de Config", filas("Config").find(f => f[0] === "cuentas")[1].split(",").includes("MACRO"), false);
const idCd = porNombre("CD").id;
handleAction({ action: "saveCuenta", cuenta: { id: idMp, nombre: "MP Fútbol", alic: 0.6, internosExentos: [idCd] } });
r = handleAction({ action: "deleteCuenta", id: idCd });
check("una sin movimientos se borra", r.ok, JSON.stringify(r));
igual("y las que la tenían como exenta la sueltan", porNombre("MP Fútbol").internosExentos, []);

seccion("6 · Instalación nueva");
reset();
igual("sin Config ni movimientos, no inventa cuentas", cuentas(), []);

// ── Front ──────────────────────────────────────────────────────
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "reparto.js"), "utf8");
const app = eval("(" + src.slice(src.indexOf("function cargarApp"), src.indexOf("const app = cargarApp();")).trim() + ")")();

seccion("7 · Front: cuentas desde la hoja");
const det = [
  { id: "c1", nombre: "MACRO", activa: true, orden: 1, alic: 0, internosExentos: [] },
  { id: "c2", nombre: "MP", activa: true, orden: 2, alic: 0.6, internosExentos: ["c1"] },
  { id: "c3", nombre: "UALA", activa: false, orden: 3, alic: 0, internosExentos: [] },
];
app.applyCuentasDet(det);
igual("cuentas = activas en orden", [...app.cuentas], ["MACRO", "MP"]);
igual("impuesto por nombre", JSON.parse(JSON.stringify(app.impDebCred)), { MP: { alic: 0.6, internosExentos: ["MACRO"] } });
app.applyCuentasMetodos({ cuentas: "OTRA,COSA" });
igual("Config no pisa la hoja", [...app.cuentas], ["MACRO", "MP"]);
igual("al editar un movimiento de una cuenta desactivada, sigue en el select", [...app.cuentasParaSelect("UALA")], ["MACRO", "MP", "UALA"]);

seccion("8 · Front: renombrar en memoria");
app.movimientos = [
  { id: "a", cuenta: "MP", cuentaId: "c2", cuentaDestino: "", tipo: "INGRESO" },
  { id: "b", cuenta: "MACRO", cuentaId: "", cuentaDestino: "MP", cuentaDestinoId: "", tipo: "INTERNO" },
  { id: "c", cuenta: "EFECTIVO", cuentaId: "c9", cuentaDestino: "", tipo: "EGRESO" },
];
app.listFiltros.cuenta = "MP";
app.F.cuenta = "MP";
app.renombrarCuentaLocal("MP", "MP Fútbol", "c2");
igual("movimientos", app.movimientos.map(m => [m.cuenta, m.cuentaDestino]), [["MP Fútbol", ""], ["MACRO", "MP Fútbol"], ["EFECTIVO", ""]]);
igual("el filtro de la lista sigue a la cuenta", app.listFiltros.cuenta, "MP Fútbol");
igual("y el formulario también", app.F.cuenta, "MP Fútbol");

resumen();
