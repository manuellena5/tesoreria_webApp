/* Comprobantes adjuntos (subirAdjunto / borrarAdjunto) — `node spec/adjuntos.js`
 *
 * Los archivos van al Drive de la cuenta que corre el script. Acá DriveApp es un mock en memoria
 * (carpetas y archivos como objetos) para poder verificar la estructura año/rubro, los nombres y
 * que nada se borre para siempre, sin tocar un Drive real.
 */

const H = require("./harness.js");
const { reset, hoja, filas, movRow, check, igual, seccion, resumen, handleAction } = H;

// ── Mock de DriveApp / PropertiesService / Utilities ─────────
let props, archivos, carpetas, seq;
function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
function nuevaCarpeta(nombre, padre) {
  const c = {
    id: "fld" + (++seq), nombre, padre, hijos: [], archivos: [],
    getId() { return this.id; }, getName() { return this.nombre; },
    getUrl() { return "https://drive.google.com/drive/folders/" + this.id; },
    getFoldersByName(n) { return iter(this.hijos.filter(h => h.nombre === n)); },
    createFolder(n) { const h = nuevaCarpeta(n, this); this.hijos.push(h); return h; },
    createFile(blob) {
      const f = { id: "file" + (++seq), nombre: blob.name, mime: blob.mime, bytes: blob.bytes.length,
                  carpeta: this, trashed: false, descripcion: "", compartido: false,
                  getId() { return this.id; }, getUrl() { return "https://drive.google.com/file/d/" + this.id + "/view"; },
                  setDescription(d) { this.descripcion = d; return this; },
                  setSharing() { this.compartido = true; return this; },
                  setTrashed(t) { this.trashed = t; return this; } };
      this.archivos.push(f); archivos[f.id] = f; return f;
    }
  };
  carpetas[c.id] = c;
  return c;
}
let raizDrive;
global.DriveApp = {
  createFolder: n => raizDrive.createFolder(n),
  getFolderById: id => { if (!carpetas[id]) throw new Error("No item with the given ID"); return carpetas[id]; },
  getFileById:   id => { if (!archivos[id]) throw new Error("No item with the given ID"); return archivos[id]; }
};
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) };
global.Utilities = {
  base64Decode: s => { if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error("Invalid argument"); return Array.from(Buffer.from(s, "base64")); },
  newBlob: (bytes, mime, name) => ({ bytes, mime, name })
};
global.Logger = { log() {} };

function resetDrive() { props = {}; archivos = {}; carpetas = {}; seq = 0; raizDrive = nuevaCarpeta("Mi unidad", null); }
const b64 = n => Buffer.alloc(n, 7).toString("base64");
const ruta = f => { const p = []; for (let c = f.carpeta; c && c.padre; c = c.padre) p.unshift(c.nombre); return p.join("/"); };

function sembrar() {
  reset(); resetDrive();
  hoja("Movimientos", [ "ID","MES","Fecha","CodRubro","Rubro","Categoria","Concepto","Egreso","Ingreso",
    "MontoFinal","Cuenta","CuentaDestino","ModoPago","JugadorCT","Adherente","Observacion","Comprobante",
    "SeguroReintegro","Tipo","timestamp","PartidoID","EventoID","Vinculos","ItemsDetalle","JugadorID","AdherenteID","Adjuntos" ], [
    movRow({ id: "m1", mes: "202608", fecha: "2026-08-14", codRubro: "21", concepto: "Radiografía muñeca: \"urgente\" / guardia",
             egreso: 30000, cuenta: "MACRO", tipo: "EGRESO", jugadorCT: "PEREZ JUAN", seguroReintegro: 1 }),
    movRow({ id: "m2", mes: "202512", fecha: "2025-12-30", codRubro: "21", concepto: "Consulta", egreso: 5000,
             cuenta: "MACRO", tipo: "EGRESO", jugadorCT: "GOMEZ" }),
    movRow({ id: "m3", mes: "202608", fecha: "2026-08-02", codRubro: "6", concepto: "Cuota agosto", ingreso: 5000,
             cuenta: "MACRO", tipo: "INGRESO", adherente: "LOPEZ" })
  ]);
  hoja("Pagos_Adh", ["ID","AdherenteID","AdherenteNombre","Mes","Estado","MovimientoID","timestamp"]);
}
// El try/catch hace lo mismo que doPost: un throw adentro del handler vuelve como { ok:false, error }.
const subir = (movId, extra) => {
  try {
    return handleAction(Object.assign({ action: "subirAdjunto", movId, nombreOriginal: "IMG_1.jpg",
                                        mime: "image/jpeg", base64: b64(1000) }, extra));
  } catch (e) { return { ok: false, error: e.message }; }
};
const adjDe = id => handleAction({ action: "listMov" }).movimientos.find(m => m.id === id).adjuntos;

// ══════════════════════════════════════════════════════════════
seccion("1 · Carpeta raíz y estructura año / rubro");
sembrar();
let r = subir("m1");
check("sube ok", r.ok, JSON.stringify(r));
const raiz = raizDrive.hijos.find(c => c.nombre === "Comprobantes Tesorería");
check("sin propiedad, crea 'Comprobantes Tesorería' en la raíz", !!raiz);
igual("y guarda su ID en COMPROBANTES_FOLDER_ID", props.COMPROBANTES_FOLDER_ID, raiz && raiz.id);
const f1 = archivos[r.adjunto.id];
igual("va a <año>/<cod> - <rubro>", ruta(f1), "Comprobantes Tesorería/2026/21 - GASTOS MEDICOS Y FARMACIA - REINT SEG");
subir("m1", { mime: "application/pdf", base64: b64(500) });
subir("m3");
igual("un segundo archivo no duplica la raíz", raizDrive.hijos.filter(c => c.nombre === "Comprobantes Tesorería").length, 1);
igual("ni el año", raiz.hijos.filter(c => c.nombre === "2026").length, 1);
igual("ni el rubro", raiz.hijos.find(c => c.nombre === "2026").hijos.filter(c => c.nombre.startsWith("21 ")).length, 1);
igual("otro rubro, otra carpeta dentro del mismo año",
      raiz.hijos.find(c => c.nombre === "2026").hijos.map(c => c.nombre).sort(),
      ["21 - GASTOS MEDICOS Y FARMACIA - REINT SEG", "6 - " + H.rubro("6").nombre.replace(/\s*\|\s*/g, " - ")]);
r = subir("m2");
igual("el año sale de la fecha del movimiento, no de hoy", ruta(archivos[r.adjunto.id]).split("/")[1], "2025");
check("no se comparte el archivo (datos de salud)", Object.values(archivos).every(f => !f.compartido));
igual("el nombre original queda en la descripción", f1.descripcion, "Original: IMG_1.jpg");

seccion("2 · Usa COMPROBANTES_FOLDER_ID si está seteada");
sembrar();
const propia = raizDrive.createFolder("Mis comprobantes");
props.COMPROBANTES_FOLDER_ID = propia.id;
r = subir("m1");
igual("el archivo cae en la carpeta configurada", ruta(archivos[r.adjunto.id]).split("/")[0], "Mis comprobantes");
check("y no crea 'Comprobantes Tesorería'", !raizDrive.hijos.some(c => c.nombre === "Comprobantes Tesorería"));
props.COMPROBANTES_FOLDER_ID = "no-existe";
r = subir("m1");
check("una propiedad con ID inválido falla con mensaje claro, sin crear otra carpeta",
      !r.ok && /COMPROBANTES_FOLDER_ID/.test(r.error) && !raizDrive.hijos.some(c => c.nombre === "Comprobantes Tesorería"), r.error);

seccion("3 · Nombre del archivo");
sembrar();
r = subir("m1");
igual("fecha_persona_concepto saneado_movId", r.adjunto.nombre, "2026-08-14_PEREZ JUAN_Radiografía muñeca urgente guardia_m1.jpg");
igual("el segundo lleva _2 y la extensión del mime", subir("m1", { mime: "application/pdf" }).adjunto.nombre,
      "2026-08-14_PEREZ JUAN_Radiografía muñeca urgente guardia_m1_2.pdf");
igual("sin jugador, el adherente", subir("m3").adjunto.nombre, "2026-08-02_LOPEZ_Cuota agosto_m3.jpg");
H.SHEETS["Movimientos"].rows[1][6] = "x".repeat(100);
const largo = subir("m1").adjunto.nombre;
igual("concepto cortado a 60", largo.split("_")[2].length, 60);
check("sin caracteres inválidos", !/[\\/:*?"<>|]/.test(r.adjunto.nombre));

seccion("4 · Validaciones");
sembrar();
r = subir("m1", { mime: "image/gif" });
check("rechaza mime inválido", !r.ok && /no permitido/.test(r.error), r.error);
r = subir("m1", { base64: b64(5 * 1024 * 1024 + 1) });
check("rechaza > 5 MB con mensaje claro", !r.ok && /5 MB/.test(r.error), r.error);
check("5 MB justos entran", subir("m1", { base64: b64(5 * 1024 * 1024) }).ok);
r = subir("nada");
check("movimiento inexistente", !r.ok && /no encontrado/.test(r.error), r.error);
r = subir("m1", { base64: "" });
check("archivo vacío", !r.ok, r.error);
igual("los rechazados no dejan archivos ni entradas", adjDe("m1").length, 1);

seccion("5 · listMov devuelve los adjuntos");
sembrar();
igual("sin adjuntos → []", adjDe("m1"), []);
const a1 = subir("m1").adjunto;
const lista = adjDe("m1");
igual("uno", lista.length, 1);
igual("con id, nombre, url, mime, bytes", [lista[0].id, lista[0].nombre, lista[0].url, lista[0].mime, lista[0].bytes],
      [a1.id, a1.nombre, a1.url, "image/jpeg", 1000]);
check("y subido con hora local", /-03:00$/.test(lista[0].subido), lista[0].subido);
igual("bootstrap también", handleAction({ action: "bootstrap" }).movimientos.find(m => m.id === "m1").adjuntos.length, 1);

seccion("6 · borrarAdjunto");
sembrar();
const b1 = subir("m1").adjunto, b2 = subir("m1", { mime: "application/pdf" }).adjunto;
r = handleAction({ action: "borrarAdjunto", movId: "m1", fileId: b1.id });
check("ok", r.ok, JSON.stringify(r));
check("el archivo va a la papelera", archivos[b1.id].trashed === true);
check("no se borra definitivamente (sigue existiendo)", !!archivos[b1.id]);
check("el otro no se toca", archivos[b2.id].trashed === false);
igual("el JSON queda con el que sigue", adjDe("m1").map(a => a.id), [b2.id]);
igual("y lo devuelve", r.adjuntos.map(a => a.id), [b2.id]);
igual("un nuevo adjunto no repite el nombre del que quedó", subir("m1").adjunto.nombre.endsWith("_m1_3.jpg"), true);
r = handleAction({ action: "borrarAdjunto", movId: "m1", fileId: "otro" });
check("uno que no está → error", !r.ok);
delete archivos[b2.id];   // borrado a mano en Drive
r = handleAction({ action: "borrarAdjunto", movId: "m1", fileId: b2.id });
check("si ya no existe en Drive igual se saca de la lista", r.ok && !adjDe("m1").some(a => a.id === b2.id));

seccion("7 · updateMov no pisa Adjuntos");
sembrar();
subir("m1");
const antes = adjDe("m1");
const mov = handleAction({ action: "listMov" }).movimientos.find(m => m.id === "m1");
r = handleAction({ action: "updateMov", mov: Object.assign({}, mov, { concepto: "Radiografía editada", adjuntos: [] }) });
check("update ok", r.ok, JSON.stringify(r));
igual("el concepto cambió", handleAction({ action: "listMov" }).movimientos.find(m => m.id === "m1").concepto, "Radiografía editada");
igual("los adjuntos siguen", adjDe("m1"), antes);
r = handleAction({ action: "saveMov", mov: { id: "m9", fecha: "2026-08-20", mes: "202608", codRubro: "21", concepto: "x",
                                               egreso: 1, cuenta: "MACRO", tipo: "EGRESO", adjuntos: [{ id: "trucho" }] } });
igual("saveMov ignora adjuntos que vengan del cliente", adjDe(r.id), []);

seccion("8 · deleteMov manda los adjuntos a la papelera");
sembrar();
const d1 = subir("m1").adjunto, d2 = subir("m1").adjunto, otro = subir("m2").adjunto;
r = handleAction({ action: "deleteMov", id: "m1" });
check("borra ok", r.ok, JSON.stringify(r));
igual("informa cuántos mandó a la papelera", r.adjuntosPapelera, 2);
check("los dos a la papelera", archivos[d1.id].trashed && archivos[d2.id].trashed);
check("los de otro movimiento no", !archivos[otro.id].trashed);
r = handleAction({ action: "deleteMov", id: "m3" });
igual("un movimiento sin adjuntos borra igual", [r.ok, r.adjuntosPapelera], [true, 0]);

seccion("9 · autorizarDrive");
resetDrive();
const url = H.autorizarDrive();
check("crea la raíz y devuelve su URL", /folders\//.test(url) && !!props.COMPROBANTES_FOLDER_ID, url);
igual("correrla de nuevo reusa la misma", H.autorizarDrive(), url);

resumen();
