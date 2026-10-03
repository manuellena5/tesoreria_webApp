/* Pruebas del backend de Granos — `node spec/granos.js`
 *
 * La hoja Reservas guarda cosechas, cobros de venta, ajustes y liquidaciones pedidas. Lo que hay que
 * sostener: que una planilla creada antes de PrecioTn/PedidoID se siga leyendo igual, que editar una
 * fila no le cambie el tipo ni el movimiento, y que borrar una liquidación no deje cobros apuntando
 * a algo que ya no existe.
 */

const H = require("./harness.js");
const { SHEETS, reset, hoja, filas, check, igual, seccion, resumen, handleAction } = H;

const COLS_VIEJAS = ["ID","Fecha","Grano","Tipo","Kg","Nota","MovimientoID","timestamp"];
const reservas = () => handleAction({ action: "listReservas" }).reservas;
const porId = id => reservas().find(r => r.id === id);

seccion("1 · Una planilla de antes de los cambios se lee igual");
reset();
hoja("Reservas", COLS_VIEJAS, [
  ["c1", "2026-06-30", "Soja", "COSECHA", 36020, "Stock inicial", "", "t0"],
  ["v0", "2026-08-10", "Soja", "VENTA",    5010, "",              "m0", "t1"],
]);
igual("trae las dos filas", reservas().length, 2);
igual("la venta vieja no tiene precio guardado", porId("v0").precioTn, 0);
igual("ni liquidación", porId("v0").pedidoId, "");
igual("y conserva sus kilos y su movimiento", [porId("v0").kg, porId("v0").movimientoId], [5010, "m0"]);
igual("la hoja suma los dos encabezados nuevos al final, sin correr los viejos",
      SHEETS["Reservas"].rows[0], COLS_VIEJAS.concat(["PrecioTn", "PedidoID"]));

seccion("2 · Liquidación pedida, cobro y ajuste");
const idPed = handleAction({ action: "saveReserva", reserva:
  { fecha: "2026-09-28", grano: "Soja", tipo: "PEDIDO", kg: 20000, nota: "200 qq" } }).id;
const idVen = handleAction({ action: "saveReserva", reserva:
  { fecha: "2026-10-01", grano: "Soja", tipo: "VENTA", kg: 2083.33, nota: "", movimientoId: "m1",
    precioTn: 480000, pedidoId: idPed } }).id;
const idAju = handleAction({ action: "saveReserva", reserva:
  { fecha: "2026-10-20", grano: "Soja", tipo: "AJUSTE", kg: 2400, nota: "Ajuste por comisión", pedidoId: idPed } }).id;
igual("el cobro guarda el precio por tonelada", porId(idVen).precioTn, 480000);
igual("y a qué liquidación corresponde", porId(idVen).pedidoId, idPed);
igual("el ajuste también queda atado", porId(idAju).pedidoId, idPed);
igual("el ajuste no tiene movimiento", porId(idAju).movimientoId, "");
igual("el pedido se guarda en kilos", [porId(idPed).tipo, porId(idPed).kg], ["PEDIDO", 20000]);
igual("una fila sin precio deja la celda vacía (no un 0)", filas("Reservas").find(f => f[0] === idPed)[8], "");

seccion("3 · Editar una fila del historial");
const tsAntes = filas("Reservas").find(f => f[0] === idVen)[7];
const rUpd = handleAction({ action: "updateReserva", reserva:
  { id: idVen, fecha: "2026-10-02", grano: "Soja", kg: 2000, nota: "corregido", precioTn: 500000, pedidoId: idPed,
    tipo: "COSECHA", movimientoId: "OTRO" } });
check("responde ok", rUpd.ok === true, JSON.stringify(rUpd));
const ven = porId(idVen);
igual("cambian fecha, kilos, nota y precio", [ven.fecha, ven.kg, ven.nota, ven.precioTn], ["2026-10-02", 2000, "corregido", 500000]);
igual("el tipo NO se puede cambiar editando", ven.tipo, "VENTA");
igual("ni el movimiento al que apunta", ven.movimientoId, "m1");
igual("ni la marca de alta", filas("Reservas").find(f => f[0] === idVen)[7], tsAntes);
igual("las otras filas no se tocan", [porId("c1").kg, porId("v0").kg, porId(idPed).kg], [36020, 5010, 20000]);
handleAction({ action: "updateReserva", reserva: { id: "c1", fecha: "2026-06-30", grano: "Soja", kg: 36500, nota: "Stock inicial" } });
igual("una cosecha se corrige igual", porId("c1").kg, 36500);
handleAction({ action: "updateReserva", reserva: { id: idVen, fecha: "2026-10-02", grano: "Soja", kg: 2000, nota: "", precioTn: 500000, pedidoId: "" } });
igual("un cobro se puede soltar de su liquidación", porId(idVen).pedidoId, "");
handleAction({ action: "updateReserva", reserva: { id: idVen, fecha: "2026-10-02", grano: "Soja", kg: 2000, nota: "", precioTn: 500000, pedidoId: idPed } });
const rNo = handleAction({ action: "updateReserva", reserva: { id: "no-existe", kg: 1 } });
check("editar algo que no existe avisa y no escribe", rNo.ok === false && reservas().length === 5, JSON.stringify(rNo));

seccion("4 · Borrar una liquidación suelta sus cobros, no los borra");
handleAction({ action: "deleteReserva", id: idPed });
igual("la liquidación ya no está", porId(idPed), undefined);
igual("quedan las otras cuatro filas", reservas().map(r => r.id).sort(), ["c1", "v0", idVen, idAju].sort());
igual("el cobro quedó suelto", porId(idVen).pedidoId, "");
igual("y el ajuste también", porId(idAju).pedidoId, "");
igual("con sus kilos intactos", [porId(idVen).kg, porId(idAju).kg], [2000, 2400]);
handleAction({ action: "deleteReserva", id: idAju });
igual("borrar una fila común borra sólo esa", reservas().map(r => r.id).sort(), ["c1", "v0", idVen].sort());

seccion("5 · bootstrap trae lo mismo que listReservas");
hoja("Config", ["Clave","Valor"], [["seededGranos","true"]]);
igual("mismas filas, con precio y liquidación", handleAction({ action: "bootstrap" }).reservas, reservas());

resumen();
