# Guía de Conexión con SharePoint y Excel Privado

Esta guía explica cómo conectar el formulario QR con un archivo Excel en **SharePoint** al que **solo tenga acceso el jefe (y tú)**, sin que los pasajeros puedan ver los registros ni necesiten iniciar sesión en Microsoft.

---

## 1. Crear el Excel privado en SharePoint

1. Entra a tu sitio de **SharePoint** (o carpeta privada) y verifica en **Administrar acceso** que **únicamente tú y tu jefe** tengan permisos sobre la carpeta o archivo.
2. Crea un archivo Excel llamado, por ejemplo, `Control_Traslados.xlsx`.
3. En la primera hoja (llámala `Registros`), crea estos encabezados en la fila 1 (desde `A1` hasta `I1`):

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| `ID` | `Fecha` | `Hora` | `RUT` | `CentroCostos` | `Tipo` | `Movil` | `TimestampISO` | `SincronizadoDesde` |

4. Selecciona el rango `A1:I2`, ve a **Insertar > Tabla**, marca **"La tabla tiene encabezados"** y nómbrala `Registros_Viajes` (en la pestaña *Diseño de tabla > Nombre de tabla*).

### (Opcional) Hoja separada con Inicio y Finalización lado a lado

Para ver en una sola fila el **Inicio** y la **Finalización** de cada persona por día, puedes crear una segunda hoja llamada `Resumen` con:
- `Fecha` | `RUT` | `CentroCostos` | `Hora Inicio` | `Hora Fin` | `Duración`
- En **Hora Inicio**:
  ```excel
  =MIN.SI.CONJUNTO(Registros_Viajes[Hora]; Registros_Viajes[Fecha]; A2; Registros_Viajes[RUT]; B2; Registros_Viajes[Tipo]; "Inicio")
  ```
- En **Hora Fin**:
  ```excel
  =MAX.SI.CONJUNTO(Registros_Viajes[Hora]; Registros_Viajes[Fecha]; A2; Registros_Viajes[RUT]; B2; Registros_Viajes[Tipo]; "Finalización")
  ```
*(O bien crear una **Tabla Dinámica** desde `Registros_Viajes` con `Fecha` y `RUT` en Filas, `Tipo` en Columnas y `Hora` en Valores).*

---

## 2. Crear el puente seguro en Power Automate

Power Automate recibe los datos del formulario y los escribe en el Excel privado. El pasajero **nunca** ve ni toca el SharePoint.

1. Entra a [make.powerautomate.com](https://make.powerautomate.com) con la cuenta que tiene permiso sobre el SharePoint.
2. Ve a **Crear > Flujo de nube instantáneo** y elige el desencadenador **"Cuando se recibe una solicitud HTTP"** (*When an HTTP request is received*). *(Si te pide seleccionar quién puede activar el flujo, elige **Cualquier usuario**).*
3. En **Esquema JSON del cuerpo de la solicitud**, pega exactamente esto:

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "rut": { "type": "string" },
    "centroCostos": { "type": "string" },
    "tipo": { "type": "string" },
    "fecha": { "type": "string" },
    "hora": { "type": "string" },
    "timestampISO": { "type": "string" },
    "movil": { "type": "string" },
    "sincronizadoDesde": { "type": "string" },
    "apiKey": { "type": "string" }
  }
}
```

4. *(Opcional recomendado)* Agrega una acción **Condición** para validar que `apiKey` coincida con la clave que pongas en `config.js`. Si no coincide, termina el flujo con respuesta `401`.
5. Agrega la acción **Excel Online (Business) > Agregar una fila a una tabla** (*Add a row into a table*):
   - **Ubicación**: Tu sitio de SharePoint
   - **Biblioteca de documentos**: `Documentos` (o la que uses)
   - **Archivo**: `/Control_Traslados.xlsx`
   - **Tabla**: `Registros_Viajes`
   - Asigna cada campo dinámico del HTTP Trigger a su columna correspondiente (`ID` -> `id`, `Fecha` -> `fecha`, `Hora` -> `hora`, `RUT` -> `rut`, `CentroCostos` -> `centroCostos`, `Tipo` -> `tipo`, `Movil` -> `movil`, `TimestampISO` -> `timestampISO`, `SincronizadoDesde` -> `sincronizadoDesde`).
6. Agrega al final la acción **Respuesta** (*Response*) con Código de estado `200` y cuerpo `{"ok": true}`.
7. **Guarda el flujo**. Al guardar, el primer bloque mostrará la **URL HTTP POST**. Cópiala.

---

## 3. Conectar y publicar 24/7

1. Abre [config.js](file:///c:/Users/mreynosor/Desktop/QR/QR-Marcacion/config.js) y pega la URL copiada en `webhookUrl`.
2. Publica esta carpeta en un hosting estático gratuito (no requiere servidor encendido):
   - **GitHub Pages** (en este mismo repositorio: *Settings > Pages > Deploy from branch*), o
   - **Cloudflare Pages** / **Netlify** (arrastrar y soltar la carpeta).
3. Abre `qr.html` en tu navegador, pega la URL publicada, descarga o imprime el QR y pégalo en el móvil.
