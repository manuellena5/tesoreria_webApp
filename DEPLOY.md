# Cómo actualizar Code.gs sin cambiar la URL

## Pasos

1. Abrí [script.google.com](https://script.google.com) → proyecto **Tesorería Club**
2. Reemplazá todo el contenido del editor con el nuevo `Code.gs`
3. Guardá con **Ctrl+S**
4. Clic en **Implementar** → **Administrar implementaciones**
5. Clic en el ✏️ (editar) de la implementación activa
6. En **Versión** seleccioná **"Nueva versión"**
7. Clic en **Implementar**

La URL no cambia. No hace falta actualizar nada en la app.

## URL del deployment

Está fija en `index.html` (constante `SCRIPT_URL`). No es un secreto: lo que protege los datos es la clave.

## Clave de acceso

`Code.gs` rechaza cualquier pedido que no traiga la clave correcta (salvo `?action=publico`, que alimenta el sitio de balances y sólo devuelve totales).

- Se configura en script.google.com → ⚙️ **Configuración del proyecto** → **Propiedades del script** → propiedad `CLAVE_APP`.
- Sin `CLAVE_APP` el backend rechaza todo.
- Para cambiarla, se edita la propiedad; no hace falta redeployar. Cada dispositivo la pide de nuevo al próximo pedido.
- Tras 10 intentos fallidos se bloquea todo durante 15 minutos (incluida la clave correcta).
- Cualquier otro cliente que pegue contra este Web App (p. ej. `importar_movimientos.py`) tiene que mandar `"pin": "<clave>"` en el JSON.
