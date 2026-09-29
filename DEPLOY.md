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

## Comprobantes adjuntos (permiso de Google Drive)

Desde la versión que agrega "📎 Adjuntar comprobante", `Code.gs` guarda fotos y PDF en el Drive de la cuenta que corre el script. La primera vez hay que autorizar Drive a mano:

1. Pegá el `Code.gs` nuevo y guardá con **Ctrl+S**.
2. En el desplegable de funciones de arriba elegí **`autorizarDrive`** y tocá **Ejecutar** → aceptá el permiso nuevo de Google Drive. Sin este paso el Web App falla al subir, porque ese permiso no estaba autorizado. En el registro de ejecución queda la URL de la carpeta.
3. **Implementar** → **Administrar implementaciones** → ✏️ → **Nueva versión** → **Implementar** (la URL no cambia).
4. (Opcional) Para guardar en otra carpeta: creala en Drive, copiá el ID de su URL (`drive.google.com/drive/folders/<ESTE_ID>`) y ponelo en ⚙️ **Configuración del proyecto** → **Propiedades del script** → propiedad `COMPROBANTES_FOLDER_ID`.

Cómo quedan guardados:

- Sin `COMPROBANTES_FOLDER_ID`, el backend crea **Comprobantes Tesorería** en la raíz del Drive y guarda su ID en esa propiedad.
- Adentro: `<año>/<CodRubro> - <Rubro>/AAAA-MM-DD_<Jugador o Adherente>_<Concepto>_<movId>.<ext>`. El año es el de la fecha del movimiento.
- Los archivos **no se comparten**: el link sólo lo abre la cuenta dueña (son datos de salud de jugadores).
- Borrar un adjunto, o el movimiento que lo tiene, manda el archivo a la **papelera** de Drive (se recupera durante 30 días).
- Máximo 5 MB por archivo; la app comprime las fotos antes de subirlas (lado mayor 1600 px).

## URL del deployment

Está fija en `index.html` (constante `SCRIPT_URL`). No es un secreto: lo que protege los datos es la clave.

## Clave de acceso

`Code.gs` rechaza cualquier pedido que no traiga la clave correcta (salvo `?action=publico`, que alimenta el sitio de balances y sólo devuelve totales).

- Se configura en script.google.com → ⚙️ **Configuración del proyecto** → **Propiedades del script** → propiedad `CLAVE_APP`.
- Sin `CLAVE_APP` el backend rechaza todo.
- Para cambiarla, se edita la propiedad; no hace falta redeployar. Cada dispositivo la pide de nuevo al próximo pedido.
- Tras 10 intentos fallidos se bloquea todo durante 15 minutos (incluida la clave correcta).
- Cualquier otro cliente que pegue contra este Web App (p. ej. `importar_movimientos.py`) tiene que mandar `"pin": "<clave>"` en el JSON.
