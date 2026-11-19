# QR-Marcacion

Sistema autónomo 24/7 para el **registro individual de inicio y finalización de viajes en móvil** mediante código QR, con soporte offline (PWA) y envío seguro a un Excel privado en **SharePoint** vía **Power Automate**.

## Características principales

- **Marcación individual por pasajero**: Cada persona registra su propio **Inicio** (al subir) y **Finalización** (al bajar), independiente del resto del grupo.
- **Sin nombre, solo lo necesario**: Solicita únicamente **RUT** (con formato y validación de dígito verificador chileno), **Centro de Costos** y **Tipo** (`Inicio` / `Finalización`).
- **Fecha y hora automáticas**: Captura la fecha y hora exacta al momento de registrar.
- **Funciona 24/7 sin depender de tu PC**: Se publica como sitio estático (ej. GitHub Pages) y cuenta con Service Worker + cola local para guardar marcaciones si el pasajero pierde señal momentáneamente y enviarlas apenas recupere conexión.
- **Privacidad en SharePoint**: Los pasajeros no tienen acceso al SharePoint ni al Excel; el envío se realiza mediante un Webhook de Power Automate que escribe en el archivo privado del jefe.
- **Generador de QR imprimible (`qr.html`)**: Crea e imprime el cartel con el QR listo para pegar.

## Archivos del proyecto

- `index.html`, `styles.css`, `app.js`: Formulario web móvil (PWA).
- `config.js`: Configuración del Webhook de Power Automate y centros de costos sugeridos.
- `sw.js`, `manifest.json`: Soporte offline-first (PWA).
- `qr.html`: Generador de código QR listo para imprimir o descargar en PNG.
- `GUIA_SHAREPOINT.md`: Paso a paso para crear el Excel privado en SharePoint y el flujo en Power Automate.

## Cómo probarlo ahora mismo (Modo Demo)

Mientras `webhookUrl` esté vacío en `config.js`, el formulario funciona en **Modo Demo** (guardando localmente en el navegador para que puedas validar el diseño y el flujo).

Para probarlo localmente desde la terminal:
```powershell
python -m http.server 8080
```
Luego abre `http://localhost:8080` para ver el formulario y `http://localhost:8080/qr.html` para generar el QR.
