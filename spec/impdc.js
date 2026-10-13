/* Pruebas del impuesto a los débitos y créditos — `node spec/impdc.js`
 *
 * En la app se carga el monto BRUTO; el neto (lo que muestra el extracto de MP) se calcula con la
 * alícuota de la cuenta, y a fin de mes el impuesto total se registra como un egreso del rubro 9.
 * Se prueba: qué movimientos pagan (ingresos, egresos, cada lado de un interno, exenciones por
 * regla y marcadas a mano), el neto, el total del mes, y que el backend guarde la marca sin que
 * una edición vieja la borre.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function cargarApp() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const bloques = html.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/);
  if (!bloques) throw new Error("No se encontró el bloque <script> de index.html");
  const noop = () => {};
  const el = {
    value: "", textContent: "", innerHTML: "", checked: false, disabled: false,
    dataset: {}, style: {}, options: [], classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, focus: noop, click: noop, appendChild: noop, remove: noop
  };
  const ctx = {
    console,
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null,
                querySelectorAll: () => [], createElement: () => Object.assign({}, el),
                body: el, documentElement: el },
    window: { addEventListener: noop, matchMedia: () => ({ matches: false, addListener: noop }) },
    navigator: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
    localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; },
      clear: () => { for (const k in m) delete m[k]; } }; })(),
    fetch: () => Promise.reject(new Error("sin red en las pruebas")),
    setTimeout, clearTimeout, setInterval, clearInterval,
    alert: noop, confirm: () => true, Blob: function () {}, URL: { createObjectURL: () => "" }
  };
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(bloques[1].replace(/^(const|let) /gm, "var "), ctx, { filename: "index.html<script>" });
  return ctx;
}

const app = cargarApp();

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

app.cuentas = ["EFECTIVO", "MP", "MACRO", "MUTUAL", "NARANJA X"];
app.impDebCred = app.impDCParse(JSON.stringify({ MP: { alic: 0.6, internosExentos: ["MACRO"] } }));

const mov = (o) => Object.assign({ mes: "202610", fecha: "2026-10-05", codRubro: "1", tipo: "INGRESO",
  ingreso: 0, egreso: 0, montoFinal: 0, cuenta: "MP", cuentaDestino: "", impDC: "" }, o);

seccion("1 · Configuración");
igual("sin config guardada, MP arranca en 0,6 %", app.impDCParse("").MP.alic, 0.6);
igual("una config rota no rompe: vuelve al default", app.impDCParse("{no es json").MP.alic, 0.6);
igual("alícuota como fracción", app.impDCAlic("MP"), 0.006);
igual("una cuenta sin configurar no cobra", app.impDCAlic("EFECTIVO"), 0);

seccion("2 · Neto por movimiento");
const ing = mov({ tipo: "INGRESO", ingreso: 100000, montoFinal: 100000 });
igual("ingreso de $100.000 en MP: entra $99.400", app.impDCDetalle(ing)[0].neto, 99400);
const egr = mov({ tipo: "EGRESO", codRubro: "30", egreso: 50000, montoFinal: 50000 });
igual("egreso de $50.000: sale $50.300", app.impDCDetalle(egr)[0].neto, 50300);
igual("neto con signo para la tabla", app.impDCNetoCuenta(egr, "MP"), -50300);
igual("un ingreso en EFECTIVO no tiene neto", app.impDCNetoCuenta(mov({ cuenta: "EFECTIVO", ingreso: 999 }), ""), null);

seccion("3 · Internos");
const intEfMp = mov({ tipo: "INTERNO", codRubro: "49", cuenta: "EFECTIVO", cuentaDestino: "MP", egreso: 30000, montoFinal: 30000 });
igual("EFECTIVO → MP paga como crédito en MP", app.impDCDetalle(intEfMp).map(d => [d.cuenta, d.sentido, d.neto]), [["MP", "credito", 29820]]);
const intMpMut = mov({ tipo: "INTERNO", codRubro: "49", cuenta: "MP", cuentaDestino: "MUTUAL", egreso: 10000, montoFinal: 10000 });
igual("MP → MUTUAL paga como débito en MP", app.impDCDetalle(intMpMut).map(d => [d.cuenta, d.sentido, d.neto]), [["MP", "debito", 10060]]);
const intMacroMp = mov({ tipo: "INTERNO", codRubro: "49", cuenta: "MACRO", cuentaDestino: "MP", egreso: 20000, montoFinal: 20000 });
igual("MACRO → MP exento por ser cuenta propia marcada", app.impDCDetalle(intMacroMp), []);
igual("…salvo que se marque a mano", app.impDCDetalle(Object.assign({}, intMacroMp, { impDC: "GRAVADO" })).length, 1);
app.impDebCred.NX = undefined;
app.impDebCred["NARANJA X"] = { alic: 0.6, internosExentos: [] };
const intMpNx = mov({ tipo: "INTERNO", codRubro: "49", cuenta: "MP", cuentaDestino: "NARANJA X", egreso: 1000, montoFinal: 1000 });
igual("entre dos cuentas con impuesto paga cada lado", app.impDCDetalle(intMpNx).map(d => d.cuenta), ["MP", "NARANJA X"]);
delete app.impDebCred["NARANJA X"]; delete app.impDebCred.NX;

seccion("4 · Exenciones");
const rend = mov({ codRubro: "9", ingreso: 5000, montoFinal: 5000 });
check("rendimientos (rubro 9) no pagan", !app.impDCGravado(rend, "MP"));
const epe = mov({ tipo: "EGRESO", codRubro: "30", egreso: 10000, montoFinal: 10000, impDC: "EXENTO" });
check("la EPE marcada a mano no paga", !app.impDCGravado(epe, "MP"));
check("un ajuste nunca paga", !app.impDCGravado(mov({ tipo: "AJUSTE", montoFinal: 500 }), "MP"));
igual("detalle de un exento por regla", app.impDCDetalleTxt(rend), "Exento por regla");
igual("y de uno marcado", app.impDCDetalleTxt(epe), "Exento (marcado a mano)");
igual("un movimiento de EFECTIVO no muestra nada", app.impDCDetalleTxt(mov({ cuenta: "EFECTIVO", ingreso: 1 })), "");

seccion("5 · Impuesto del mes");
app.movimientos = [ing, egr, intEfMp, intMpMut, intMacroMp, rend, epe,
  mov({ cuenta: "EFECTIVO", ingreso: 999, montoFinal: 999 }),
  mov({ mes: "202609", ingreso: 777777, montoFinal: 777777 })];
const r = app.impDCResumenMes("2026-10", "MP");
// 100.000 + 50.000 + 30.000 + 10.000 = 190.000 gravados → 1.140
igual("base: sólo lo gravado de MP en el mes", r.base, 190000);
igual("créditos / débitos", [r.creditos, r.debitos], [130000, 60000]);
igual("impuesto = 0,6 % de la base", r.imp, 1140);
igual("nada cargado todavía", r.cargado, 0);
const impCargado = mov({ tipo: "EGRESO", codRubro: "9", egreso: 1140, montoFinal: 1140 });
app.movimientos.push(impCargado);
const r2 = app.impDCResumenMes("2026-10", "MP");
igual("el egreso del impuesto cuenta como cargado", r2.cargado, 1140);
igual("y no paga impuesto él mismo (no cambia la base)", r2.base, 190000);
app.sharedMes = "2026-10";
app.listFiltros = { rubro: "", cat: "", cuenta: "", tipo: "", adherente: "", jugadorCT: "", partido: "", evento: "", search: "" };
check("la tarjeta del mes lo muestra como cargado", app.impDCCardHtml().includes("✓ cargado"));
app.listFiltros.cuenta = "EFECTIVO";
igual("filtrando por una cuenta sin impuesto la tarjeta no aparece", app.impDCCardHtml(), "");

seccion("6 · Formulario");
app.editId = null;
app.F = Object.assign(app.buildDefaultF(), { tipo: "INGRESO", codRubro: "1", cuenta: "MP", monto: "100000" });
check("la casilla aparece con MP", app.impDCFieldHtml().includes("99.400,00"));
app.setImpDCForm(false);
igual("destildar guarda EXENTO", app.F.impDC, "EXENTO");
app.setImpDCForm(true);
igual("volver a tildar vuelve a la regla (sin marca)", app.F.impDC, "");
app.F.cuenta = "EFECTIVO";
igual("con EFECTIVO no hay casilla", app.impDCFieldHtml(), "");
app.F = Object.assign(app.buildDefaultF(), { tipo: "INTERNO", codRubro: "49", cuenta: "MACRO", cuentaDestino: "MP", monto: "20000" });
check("interno MACRO → MP: casilla destildada por regla", !app.impDCFieldHtml().includes("checked onchange") && app.impDCFieldHtml().includes("exento por regla"));
app.setImpDCForm(true);
igual("tildarla a mano guarda GRAVADO", app.F.impDC, "GRAVADO");

seccion("7 · Backend: columna ImpDC");
const H = require("./harness");
H.reset();   // getOrCreateSheet crea la hoja Movimientos con todas las columnas
const base = { mes: "202610", fecha: "2026-10-05", codRubro: "30", concepto: "EPE", egreso: 10000,
               cuenta: "MP", modoPago: "TRANSFERENCIA", tipo: "EGRESO" };
H.handleAction({ action: "saveMov", mov: Object.assign({ id: "e1", impDC: "exento" }, base) });
H.handleAction({ action: "saveMov", mov: Object.assign({ id: "e2", impDC: "cualquiera" }, base) });
H.handleAction({ action: "saveBatch", movimientos: [Object.assign({ id: "e3", impDC: "GRAVADO" }, base)] });
const leer = id => H.handleAction({ action: "listMov" }).movimientos.find(m => m.id === id);
igual("saveMov guarda la marca normalizada", leer("e1").impDC, "EXENTO");
igual("un valor inválido queda como regla", leer("e2").impDC, "");
igual("saveBatch también la guarda", leer("e3").impDC, "GRAVADO");
H.handleAction({ action: "updateMov", mov: Object.assign({ id: "e1", observacion: "editado sin el campo" }, base) });
igual("una edición que no manda impDC no la borra", leer("e1").impDC, "EXENTO");
H.handleAction({ action: "updateMov", mov: Object.assign({ id: "e1", impDC: "" }, base) });
igual("una que manda vacío la quita", leer("e1").impDC, "");
igual("los adjuntos no se tocan", leer("e1").adjuntos, []);

console.log("\n" + "═".repeat(64));
console.log(_fail === 0 ? `TODO OK — ${_ok} verificaciones` : `${_fail} FALLARON — ${_ok} ok`);
process.exitCode = _fail === 0 ? 0 : 1;
