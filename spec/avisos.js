/* Avisos de olvido al guardar un movimiento — `node spec/avisos.js`
 * Cuota de adherente sin adherente y movimiento de cancha sin partido: se pregunta antes de guardar. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "reparto.js"), "utf8");
const app = eval("(" + src.slice(src.indexOf("function cargarApp"), src.indexOf("const app = cargarApp();")).trim() + ")")();
let _ok = 0, _fail = 0;
const check = (d, c) => { if (c) { _ok++; console.log("  ✓ " + d); } else { _fail++; console.log("  ✗ " + d); } };
const F = (o) => { app.F = Object.assign(app.buildDefaultF(), o); };

F({ tipo: "INGRESO", codRubro: "6", adherente: "" });           check("adherente: rubro 6 sin adherente avisa", app.faltaAdherente());
F({ tipo: "INGRESO", codRubro: "6", adherente: "LOPEZ" });      check("con adherente no", !app.faltaAdherente());
F({ tipo: "INGRESO", codRubro: "5", adherente: "" });           check("otro rubro no", !app.faltaAdherente());
F({ tipo: "INGRESO", codRubro: "1", partidoId: "" });           check("partido: entradas sin partido avisa", app.faltaPartido());
F({ tipo: "EGRESO",  codRubro: "12", partidoId: "" });          check("árbitros sin partido avisa", app.faltaPartido());
F({ tipo: "EGRESO",  codRubro: "14b", partidoId: "" });         check("filmación sin partido avisa", app.faltaPartido());
F({ tipo: "INGRESO", codRubro: "1", partidoId: "p1" });         check("con partido no", !app.faltaPartido());
F({ tipo: "EGRESO",  codRubro: "26", partidoId: "" });          check("luz (no es de un partido) no", !app.faltaPartido());
F({ tipo: "INTERNO", codRubro: "49", partidoId: "" });          check("un interno no", !app.faltaPartido());
console.log("\n" + (_fail ? `${_fail} FALLARON — ${_ok} ok` : `TODO OK — ${_ok} verificaciones`));
process.exitCode = _fail ? 1 : 0;
