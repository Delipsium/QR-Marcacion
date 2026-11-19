/**
 * Configuración del Sistema de Marcación QR
 * -----------------------------------------
 * Edita este archivo antes de publicar el proyecto.
 */
window.APP_CONFIG = {
  // Título mostrado en el formulario
  appTitle: "Registro de Traslados",
  companySubtitle: "Control individual de inicio y fin de viaje",

  // URL del Webhook de Power Automate (Flujo: "Cuando se recibe una solicitud HTTP")
  // Déjalo vacío ("") para probar en Modo Demo (guarda localmente sin enviar a SharePoint).
  webhookUrl: "",

  // Clave secreta opcional para validar que las peticiones vienen de tu formulario.
  // Si la configuras aquí, agrégala también como condición en Power Automate.
  apiKey: "",

  // Identificador por defecto si el QR no trae ?movil=... en la URL
  defaultMovil: "General",

  // Lista opcional de Centros de Costos sugeridos (autocompletado).
  // Los pasajeros igual podrán escribir otro si `allowCustomCostCenter` es true.
  costCenters: [
    // "CC-101 Operaciones",
    // "CC-202 Logística",
    // "CC-305 Administración"
  ],
  allowCustomCostCenter: true,

  // Si es true, recuerda el último RUT y Centro de Costos en el teléfono del pasajero
  // para que no tenga que escribirlo de nuevo al marcar la finalización del viaje.
  rememberLastPassenger: true
};
