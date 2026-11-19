# Guía de Conexión con SharePoint y Excel Privado

Esta guía explica cómo conectar el formulario QR con un archivo Excel en **SharePoint** al que **solo tenga acceso el jefe (y tú)**, sin que los pasajeros puedan ver los registros ni necesiten iniciar sesión en Microsoft.

---

## 1. Crear el Excel privado en SharePoint

1. Entra a tu sitio de **SharePoint** (o carpeta privada) y verifica en **Administrar acceso** que **únicamente tú y tu jefe** tengan permisos sobre la carpeta o archivo.
2. Crea un archivo Excel llamado, por ejemplo, `Control_Traslados.xlsx`.
3. En la primera hoja (llámala `Registros`), crea estos encabezados en la fila 1 (desde `A1` hasta `J1`):

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| `ID` | `Fecha` | `Hora` | `HoraInicio` | `HoraFin` | `RUT` | `CentroCostos` | `Tipo` | `TimestampISO` | `SincronizadoDesde` |

4. Selecciona el rango `A1:J2`, ve a **Insertar > Tabla**, marca **"La tabla tiene encabezados"** y nómbrala `Registros_Viajes` (en *Diseño de tabla > Nombre de tabla*).

> Con `HoraInicio` y `HoraFin`, cada marcación ya deja la hora en su columna correspondiente sin depender de fórmulas complejas.

---

## 2. Configurar Power Automate (¡Muy importante el mapeo!)

> **Error común a evitar:** Si en el bloque de Excel escribes texto plano como `rut`, `fecha`, `hora`, Excel guardará literalmente las palabras `"rut"`, `"fecha"`, `"hora"`. Debes insertar los campos desde **Contenido dinámico** (ícono de rayo ⚡) o desde la pestaña **Expresión** (`fx`).

1. Entra a [make.powerautomate.com](https://make.powerautomate.com) con la cuenta que tiene permiso sobre el SharePoint.
2. Abre o crea tu flujo con el desencadenador **"Cuando se recibe una solicitud HTTP"** (*When an HTTP request is received*) configurado en **"Cualquier usuario"** (*Anyone*).
3. En **Esquema JSON del cuerpo de la solicitud**, pega exactamente esto:

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "fecha": { "type": "string" },
    "hora": { "type": "string" },
    "horaInicio": { "type": "string" },
    "horaFin": { "type": "string" },
    "rut": { "type": "string" },
    "centroCostos": { "type": "string" },
    "tipo": { "type": "string" },
    "timestampISO": { "type": "string" },
    "sincronizadoDesde": { "type": "string" },
    "apiKey": { "type": "string" }
  }
}
```

4. *(Opcional recomendado)* Agrega una **Condición** para validar `apiKey` si la configuraste en `config.js`.
5. Agrega la acción **Excel Online (Business) > Agregar una fila a una tabla** (*Add a row into a table*):
   - **Ubicación**: Tu sitio de SharePoint
   - **Biblioteca de documentos**: `Documentos` (o la que uses)
   - **Archivo**: `/Control_Traslados.xlsx`
   - **Tabla**: `Registros_Viajes`
   - Para cada columna de la tabla, haz clic en el campo, abre **Contenido dinámico** (⚡) y elige el campo correspondiente; **o si no aparecen**, abre la pestaña **Expresión (`fx`)** y pega exactamente:

| Columna en Excel | Expresión en Power Automate (`fx`) |
|---|---|
| `ID` | `triggerBody()?['id']` |
| `Fecha` | `triggerBody()?['fecha']` |
| `Hora` | `triggerBody()?['hora']` |
| `HoraInicio` | `triggerBody()?['horaInicio']` |
| `HoraFin` | `triggerBody()?['horaFin']` |
| `RUT` | `triggerBody()?['rut']` |
| `CentroCostos` | `triggerBody()?['centroCostos']` |
| `Tipo` | `triggerBody()?['tipo']` |
| `TimestampISO` | `triggerBody()?['timestampISO']` |
| `SincronizadoDesde` | `triggerBody()?['sincronizadoDesde']` |

6. Agrega al final la acción **Respuesta** (*Response*) con Código de estado `200` y cuerpo `{"ok": true}`.
7. **Guarda y activa** el flujo, copia la **URL HTTP POST** completa (con `&sp=...&sv=...&sig=...`) y pégala en `webhookUrl` dentro de [config.js](file:///c:/Users/mreynosor/Desktop/QR/QR-Marcacion/config.js).

---

## 3. Cómo hacer la hoja `Resumen` sin errores de fórmula

Si usaste `=MIN.SI.CONJUNTO(...)` / `=MAX.SI.CONJUNTO(...)` y Excel mostró un error (`#¿NOMBRE?`, `#¡VALOR!`, `00:00` o error de sintaxis), ocurre por tres motivos habituales:
1. El campo `Hora` llega como **texto** (`"16:15:53"`) y `MIN.SI.CONJUNTO` / `MAX.SI.CONJUNTO` ignoran texto o fallan si no es número.
2. En **SharePoint / Excel Online**, la configuración regional puede exigir coma `,` en lugar de punto y coma `;`, o nombres en inglés (`MINIFS` / `MAXIFS`).
3. Si usas `HoraInicio` y `HoraFin` ya separados, **no necesitas `MIN.SI.CONJUNTO`**.

### Opción A (Más confiable): Tabla Dinámica en Excel
1. Haz clic dentro de la tabla `Registros_Viajes` y ve a **Insertar > Tabla dinámica**.
2. Configúrala así:
   - **Filas**: `Fecha`, `RUT`, `CentroCostos`
   - **Columnas**: `Tipo`
   - **Valores**: `Hora` (o usar `HoraInicio` y `HoraFin` directamente en filas/valores con `Mín`/`Máx` si los guardas como hora numérica, o simplemente listar `Fecha`, `RUT`, `CentroCostos`, `HoraInicio`, `HoraFin`).

### Opción B: Fórmula de texto compatible (`BUSCARX` / `INDICE + COINCIDIR`)
Si en tu hoja `Resumen` tienes `Fecha` en `A2` y `RUT` en `B2`, y en `Registros_Viajes` guardaste `HoraInicio` y `HoraFin`:
- **Hora Inicio** (Excel en español con `;`, si tu Excel usa `,` cambia `;` por `,`):
  ```excel
  =SI.ERROR(INDICE(Registros_Viajes[HoraInicio]; COINCIDIR(1; (Registros_Viajes[Fecha]=A2)*(Registros_Viajes[RUT]=B2)*(Registros_Viajes[HoraInicio]<>""); 0)); "")
  ```
- **Hora Fin**:
  ```excel
  =SI.ERROR(INDICE(Registros_Viajes[HoraFin]; COINCIDIR(1; (Registros_Viajes[Fecha]=A2)*(Registros_Viajes[RUT]=B2)*(Registros_Viajes[HoraFin]<>""); 0)); "")
  ```
*(Y si tu Excel Online está en inglés: `IFERROR(INDEX(..., MATCH(1, (...)*(...)*(...), 0)), "")`)*.
