# Tesorería Club

Aplicación web de gestión de tesorería para un club de fútbol. Permite registrar movimientos de dinero, administrar jugadores, adherentes y grupos, y hacer seguimiento de pagos mensuales — todo desde el navegador, sin servidor propio.

## Arquitectura

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JS vanilla — archivo único `index.html`, desplegado en GitHub Pages |
| Backend | Google Apps Script (`Code.gs`) — Web App sobre Google Sheets |
| Base de datos | Google Sheets (6 hojas auto-creadas) |
| Exportación | [SheetJS](https://sheetjs.com/) para Excel (.xlsx) |

No requiere framework, bundler ni base de datos externa.

---

## Funcionalidades

### Tab 1 — Nuevo movimiento
- Selector de tipo: **Ingreso / Egreso / Interno** (transferencia entre cuentas)
- Selector de rubro con búsqueda (39 rubros categorizados)
- Campos: fecha, concepto, monto, cuenta, modo de pago, jugador/CT, adherente, observación, comprobante
- Edición de movimientos existentes desde la lista

### Tab 2 — Movimientos
- Lista de movimientos del mes con filtros por tipo, cuenta y modo de pago
- Navegación por mes (← →)
- Eliminar / editar movimientos inline

### Tab 3 — Resumen mensual
- Totales de ingresos, egresos y saldo del mes
- Saldo acumulado histórico
- Saldo por cuenta
- Gráfico de barras por categoría
- Tabla resumen
- Estado de pagos de adherentes del mes (PAGADO / PENDIENTE)

### Tab 4 — Entidades
- **Jugadores**: alta, baja (soft-delete)
- **Grupos**: nombre, descripción, cuota mensual, lista de integrantes
- **Adherentes**: alta, baja, búsqueda, historial de pagos de los últimos 6 meses con toggle PAGADO / PENDIENTE

### Tab 5 — Configuración
- URL del script de Google Apps Script
- Cuentas disponibles (personalizables)
- Métodos de pago (personalizables)
- Exportar movimientos del mes o todos a Excel
- Importar movimientos desde Excel
- Test de conexión con el backend

---

## Estructura de hojas en Google Sheets

| Hoja | Contenido |
|------|-----------|
| `Movimientos` | Todos los movimientos (19 columnas) |
| `Jugadores` | Jugadores del club |
| `Grupos` | Grupos / categorías del club |
| `Adherentes` | Socios adherentes |
| `Pagos_Adh` | Estado mensual de cuotas de adherentes |
| `Config` | Pares clave-valor de configuración |

Las hojas se crean automáticamente al ejecutar el script por primera vez.

---

## Setup

### 1. Backend — Google Apps Script

1. Ir a [script.google.com](https://script.google.com) y crear un nuevo proyecto.
2. Copiar el contenido de `Code.gs` en el editor.
3. Guardar y hacer clic en **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo (mi cuenta)**
   - Quién tiene acceso: **Cualquier usuario** *(necesario para que el frontend pueda conectarse)*
4. Copiar la **URL de la aplicación web** generada.

> La primera vez que se cargue la app se ejecuta `initSeed` automáticamente, poblando las hojas con los datos semilla (jugadores, adherentes y grupos de ejemplo).

### 2. Frontend — GitHub Pages

1. Hacer fork o clonar este repositorio.
2. Asegurarse de que `index.html` esté en la **raíz del repositorio**.
3. En la configuración del repositorio → **Pages** → Source: `main` branch, carpeta `/` (root).
4. La app queda disponible en `https://<usuario>.github.io/<repositorio>/`.

### 3. Conectar frontend con backend

1. Abrir la app en el navegador.
2. Ir al **Tab 5 (Configuración)**.
3. Pegar la URL del Apps Script y guardar.
4. Usar **Testear conexión** para verificar.

---

## Datos semilla

Al iniciar por primera vez, la app carga automáticamente:

- **29 jugadores** de ejemplo
- **43 adherentes** de ejemplo  
- **5 grupos** (Infantil, Juvenil, Reserva, Primera, Adherentes)

Estos datos pueden eliminarse o modificarse desde la app.

---

## Seguridad

- La URL del script se guarda en `localStorage` del navegador (clave `clubfm_url`), nunca se sube al repositorio.
- El backend (`doPost`) no requiere autenticación — se recomienda no exponer información sensible en las hojas y restringir el acceso al spreadsheet.
- Las peticiones usan `Content-Type: text/plain` para evitar el preflight CORS de Apps Script.

---

## Tecnologías

- HTML5 / CSS3 / JavaScript (ES2020+)
- [DM Sans + DM Mono](https://fonts.google.com/) — Google Fonts
- [SheetJS (xlsx)](https://sheetjs.com/) — exportación/importación Excel
- Google Apps Script — backend serverless
- Google Sheets — almacenamiento
- GitHub Pages — hosting del frontend

---

## Licencia

Uso libre para clubes deportivos sin fines de lucro.
