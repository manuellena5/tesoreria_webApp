/* Clave de acceso del backend (verificarClave_ / doPost) — corre con `node spec/seguridad.js` */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");

let props = {}, cache = {}, handled = [];
var PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) };
var CacheService = { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) };
var LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
var ContentService = { MimeType: { JSON: "json" },
  createTextOutput: t => ({ t, setMimeType() { return JSON.parse(t); } }) };
eval(src.replace(/^(const|let) /gm, "var "));
jsonResponse = o => o;
handleAction = d => { handled.push(d); return { ok: true, eco: d }; };

let fallas = 0, total = 0;
function igual(n, a, b) { total++; const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fallas++; console.log((ok ? "  ✓ " : "  ✗ ") + n + (ok ? "" : "  → " + JSON.stringify(a))); }
const req = d => doPost({ postData: { contents: JSON.stringify(d) } });

igual("sin CLAVE_APP se rechaza todo", req({ action: "getConfig", pin: "1" }).authError, true);
props.CLAVE_APP = "482915";
igual("clave correcta pasa", req({ action: "getConfig", pin: "482915" }).ok, true);
igual("el pin no llega al handler", "pin" in handled[handled.length - 1], false);
igual("auth valida sin tocar la planilla", (handled.length, req({ action: "auth", pin: "482915" })), { ok: true });
igual("sin pin se rechaza", req({ action: "listMov" }).error, "Clave incorrecta");
igual("pin incorrecto se rechaza", req({ action: "listMov", pin: "000000" }).authError, true);
const antes = handled.length;
req({ action: "deleteMov", id: "x", pin: "111" });
igual("un rechazo no ejecuta la acción", handled.length, antes);
for (let i = 0; i < 10; i++) req({ action: "listMov", pin: "9" + i });
igual("tras 10 fallos queda bloqueado, aun con la clave buena",
      req({ action: "listMov", pin: "482915" }).bloqueado, true);
cache = {};
igual("vencido el bloqueo vuelve a andar", req({ action: "listMov", pin: "482915" }).ok, true);

console.log(fallas ? `\n${fallas} FALLAS de ${total}` : `\nTODO OK — ${total} verificaciones`);
process.exit(fallas ? 1 : 0);
