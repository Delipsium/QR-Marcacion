# Guía de Conexión con SharePoint y Excel Privado

Esta guía explica cómo conectar el formulario QR con un archivo Excel en **SharePoint** al que **solo tenga acceso el jefe (y tú)**, dejando **Inicio y Finalización en la misma fila** por cada viaje.

---

## 1. Crear el Excel privado en SharePoint

1. Entra a tu sitio de **SharePoint** (o carpeta privada) y verifica en **Administrar acceso** que **únicamente tú y tu jefe** tengan permisos sobre la carpeta o archivo.
2. Crea un archivo Excel llamado, por ejemplo, `Control_Traslados.xlsx`.
3. En la primera hoja (llámala `Registros`), crea estos encabezados en la fila 1 (desde `A1` hasta `J1`):

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| `ID` | `Fecha` | `Hora` | `HoraInicio` | `HoraFin` | `RUT` | `CentroCostos` | `Tipo` | `Estado` | `SincronizadoDesde` |

4. Selecciona el rango `A1:J2`, ve a **Insertar > Tabla**, marca **"La tabla tiene encabezados"** y nómbrala `Registros_Viajes` (en *Diseño de tabla > Nombre de tabla*).

> **¿Cómo queda cada viaje en una sola fila?**  
> El formulario genera un `ID` único cuando el pasajero marca **Inicio** y reutiliza ese **mismo `ID`** cuando marca **Finalización**. Así Power Automate crea la fila en el Inicio y actualiza esa misma fila en la Finalización.

---

## 2. Configurar Power Automate (Inicio + Fin en la misma fila)

> **Importante:** En los campos de Excel dentro de Power Automate nunca escribas texto fijo (`rut`, `fecha`, etc.). Inserta los valores desde **Contenido dinámico** (⚡) o pegando las expresiones en la pestaña **Expresión (`fx`)**.

1. Entra a [make.powerautomate.com](https://make.powerautomate.com) con la cuenta que tiene permiso sobre el SharePoint.
2. En el desencadenador **"Cuando se recibe una solicitud HTTP"** (*When an HTTP request is received*, configurado en **"Cualquier usuario"**), pega este **Esquema JSON**:

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "rut": { "type": "string" },
    "centroCostos": { "type": "string" },
    "tipo": { "type": "string" },
    "estado": { "type": "string" },
    "fecha": { "type": "string" },
    "hora": { "type": "string" },
    "horaInicio": { "type": "string" },
    "horaFin": { "type": "string" },
    "sincronizadoDesde": { "type": "string" },
    "apiKey": { "type": "string" }
  }
}
```

3. *(Opcional recomendado)* Agrega una **Condición** para validar `apiKey` si la configuraste en `config.js`.
4. Agrega una **Condición**: `triggerBody()?['tipo']` **es igual a** `Inicio`.

### Rama "Sí" (cuando `tipo` es `Inicio`)
Agrega **Excel Online (Business) > Agregar una fila a una tabla** (*Add a row into a table*) en `Registros_Viajes` con estas expresiones (`fx`):

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
| `Estado` | `triggerBody()?['estado']` |
| `SincronizadoDesde` | `triggerBody()?['sincronizadoDesde']` |

### Rama "No" (cuando `tipo` es `Finalización`)
Agrega **Excel Online (Business) > Actualizar una fila** (*Update a row*) en la misma tabla `Registros_Viajes`:
- **Columna clave** (*Key Column*): `ID`
- **Valor de clave** (*Key Value*): `triggerBody()?['id']`
- Campos a actualizar (`fx`):

| Columna en Excel | Expresión en Power Automate (`fx`) |
|---|---|
| `Hora` | `triggerBody()?['hora']` |
| `HoraFin` | `triggerBody()?['horaFin']` |
| `Tipo` | `triggerBody()?['tipo']` |
| `Estado` | `triggerBody()?['estado']` |
| `SincronizadoDesde` | `triggerBody()?['sincronizadoDesde']` |

*(Opcional de respaldo: justo debajo de "Actualizar una fila", puedes agregar un "Agregar una fila a una tabla" y en sus 3 puntos > **Configurar ejecución posterior** marcar **solo "Ha dado error"** por si alguien borró manualmente la fila de Inicio en Excel).*

5. Agrega al final (después de la condición) la acción **Respuesta** (*Response*) con Código de estado `200` y cuerpo `{"ok": true}`.
6. **Guarda y activa** el flujo.

---

## 3. Reglas automáticas del formulario (Offline y límite de tiempo)

- **RUT normalizado**: se guarda y envía sin puntos ni guión (ej. `123456789` o `12345678K`).
- **Bloqueo inteligente por estado**:
  - Si el RUT **no tiene un viaje en curso**, solo aparece habilitado el botón **Inicio** (no puede marcar Finalización por error).
  - Apenas marca **Inicio**, la próxima vez que ingrese ese RUT solo aparecerá habilitado el botón **Finalización** (no puede marcar dos Inicios seguidos).
- **Límite de tiempo (`maxTripHours` en [config.js](file:///c:/Users/mreynosor/Desktop/QR/QR-Marcacion/config.js))**:
  - Por defecto está en **5 horas**. Si un pasajero olvidó marcar **Finalización** y vuelve a viajar pasado ese tiempo, el viaje anterior expira automáticamente y se habilita **Inicio** nuevamente.
  - Todo funciona incluso **sin conexión** usando el almacenamiento local del dispositivo.
