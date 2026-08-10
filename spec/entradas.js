/* Pruebas de las entradas vendidas por partido — `node spec/entradas.js`
 *
 * El dato (damas / caballeros) vive en la hoja Partidos, no en el movimiento, porque un partido
 * puede tener varios movimientos de entradas y no habría forma de saber cuál lleva el número
 * bueno. Eso mete dos riesgos que estas pruebas cubren:
 *
 *  1. savePartido pisa la fila entera. Un index.html viejo (cacheado por el service worker de
 *     antes del cambio) manda el partido sin los campos nuevos: si eso borrara la asistencia ya
 *     cargada, el dato se perdería en silencio y sin que nadie lo note hasta el cierre.
 *  2. "" (no lo anotamos) y 0 (no vino nadie) son cosas distintas. Si se colapsan en 0, el
 *     promedio de asistencia del semestre queda arrastrado hacia abajo por los partidos viejos,
 *     que es justo el número que se va a publicar.
 */

const H = require("./harness.js");
const { reset, hoja, filas, check, igual, seccion, resumen, handleAction } = H;

const PAR_COLS = ["ID","Fecha","Rival","NumeroFecha","Condicion","Activo","Torneo","EntradasDamas","EntradasCaballeros"];

function sembrar(filasPartidos) {
  reset();
  hoja("Partidos", PAR_COLS, filasPartidos || []);
}

function partido(id) {
  return handleAction({ action: "listPartidos" }).partidos.find(p => p.id === id);
}

// ── 1 · Alta y lectura ──────────────────────────────────────────
seccion("1 · Se guardan y se leen las entradas");
sembrar();
const alta = handleAction({ action: "savePartido", partido: {
  fecha: "2026-03-15", rival: "Susanense", numeroFecha: "Fecha 3", condicion: "LOCAL",
  torneo: "Apertura", entradasDamas: 67, entradasCaballeros: 141
}});
check("el alta devuelve ok", alta.ok);
const p1 = partido(alta.id);
igual("damas", p1.entradasDamas, 67);
igual("caballeros", p1.entradasCaballeros, 141);

// ── 2 · Un cliente viejo no borra lo cargado ────────────────────
seccion("2 · Un index.html viejo no pisa la asistencia");
handleAction({ action: "savePartido", partido: {
  id: alta.id, fecha: "2026-03-15", rival: "Susanense FC", numeroFecha: "Fecha 3",
  condicion: "LOCAL", torneo: "Apertura"          // sin los campos nuevos, como el cliente viejo
}});
const p2 = partido(alta.id);
igual("el rival sí se actualiza", p2.rival, "Susanense FC");
igual("pero las damas siguen ahí", p2.entradasDamas, 67);
igual("y los caballeros también", p2.entradasCaballeros, 141);

// ── 3 · Vaciar el campo a propósito sí borra ────────────────────
seccion("3 · Vaciar el campo a propósito sí borra");
handleAction({ action: "savePartido", partido: {
  id: alta.id, fecha: "2026-03-15", rival: "Susanense FC", numeroFecha: "Fecha 3",
  condicion: "LOCAL", torneo: "Apertura", entradasDamas: "", entradasCaballeros: ""
}});
const p3 = partido(alta.id);
igual("damas quedó vacío", p3.entradasDamas, "");
igual("caballeros quedó vacío", p3.entradasCaballeros, "");

// ── 4 · Cero no es lo mismo que vacío ───────────────────────────
seccion("4 · Cero y vacío son cosas distintas");
sembrar();
const cero = handleAction({ action: "savePartido", partido: {
  fecha: "2026-04-02", rival: "Guadalupe", numeroFecha: "Fecha 7", condicion: "VISITANTE",
  torneo: "Apertura", entradasDamas: 0, entradasCaballeros: 0
}});
const pc = partido(cero.id);
igual("un 0 cargado se conserva como 0", pc.entradasDamas, 0);
check("y no se confunde con vacío", pc.entradasDamas !== "");

// ── 5 · Partidos viejos, de antes del campo ─────────────────────
seccion("5 · Partidos anteriores al campo");
sembrar([["p-viejo","2026-02-01","La Emilia","Fecha 1","VISITANTE","true","Apertura"]]);
const pv = partido("p-viejo");
igual("las entradas vienen vacías, no en 0", [pv.entradasDamas, pv.entradasCaballeros], ["",""]);
handleAction({ action: "savePartido", partido: {
  id: "p-viejo", fecha: "2026-02-01", rival: "La Emilia", numeroFecha: "Fecha 1",
  condicion: "VISITANTE", torneo: "Apertura", entradasDamas: 12, entradasCaballeros: 44
}});
igual("y se les puede cargar después", partido("p-viejo").entradasDamas, 12);

// ── 6 · La hoja se completa con los headers nuevos ──────────────
seccion("6 · La hoja vieja gana las columnas nuevas");
igual("la fila quedó con las 9 columnas", filas("Partidos")[0].length, 9);

resumen();
