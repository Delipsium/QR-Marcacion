(() => {
  const CFG = window.APP_CONFIG || {};
  const QUEUE_KEY = "qr_marcacion_queue_v1";
  const DEMO_LOGS_KEY = "qr_marcacion_demo_logs_v1";
  const LAST_PASSENGER_KEY = "qr_marcacion_last_passenger_v1";
  const ACTIVE_TRIPS_KEY = "qr_marcacion_active_trips_v1";

  const maxTripHours = Number(CFG.maxTripHours) > 0 ? Number(CFG.maxTripHours) : 5;
  const maxTripMs = maxTripHours * 3600 * 1000;

  // Elementos del DOM
  const elTitle = document.getElementById("app-title");
  const elSubtitle = document.getElementById("app-subtitle");
  const elStatusBadge = document.getElementById("status-badge");
  const elStatusText = document.getElementById("status-text");
  const elLiveDate = document.getElementById("live-date");
  const elLiveTime = document.getElementById("live-time");

  const elSyncBanner = document.getElementById("sync-banner");
  const elSyncBannerText = document.getElementById("sync-banner-text");
  const elSyncBannerDetail = document.getElementById("sync-banner-detail");
  const elRetrySyncBtn = document.getElementById("retry-sync-btn");
  const elClearQueueBtn = document.getElementById("clear-queue-btn");

  const elConfigBanner = document.getElementById("config-banner");
  const elConfigBannerDetail = document.getElementById("config-banner-detail");
  const elDemoBanner = document.getElementById("demo-banner");
  const elPendingFooter = document.getElementById("pending-count-footer");

  const elForm = document.getElementById("marcacion-form");
  const elRut = document.getElementById("rut");
  const elRutError = document.getElementById("rut-error");
  const elClearSavedBtn = document.getElementById("clear-saved-btn");
  const elCC = document.getElementById("centro-costos");
  const elCCList = document.getElementById("cost-centers-list");
  const elCCError = document.getElementById("cc-error");
  const elTripHint = document.getElementById("trip-status-hint");
  const elTypeGrid = document.getElementById("type-grid");
  const elBtnInicio = document.getElementById("btn-inicio");
  const elBtnFin = document.getElementById("btn-fin");
  const elTipoInput = document.getElementById("tipo");
  const elTipoError = document.getElementById("tipo-error");
  const elTypeButtons = document.querySelectorAll(".type-btn");
  const elSubmitBtn = document.getElementById("submit-btn");

  const elReceipt = document.getElementById("receipt-card");
  const elReceiptIcon = document.getElementById("receipt-icon");
  const elReceiptTitle = document.getElementById("receipt-title");
  const elReceiptSubtitle = document.getElementById("receipt-subtitle");
  const elRecRut = document.getElementById("rec-rut");
  const elRecCC = document.getElementById("rec-cc");
  const elRecTipo = document.getElementById("rec-tipo");
  const elRecDatetime = document.getElementById("rec-datetime");
  const elNewRecordBtn = document.getElementById("new-record-btn");

  const webhookUrl = (CFG.webhookUrl || "").trim();

  let isFlushing = false;
  let lastSyncError = "";

  // --- Validación de estado del Webhook ---
  function analyzeWebhookConfig(url) {
    if (!url) {
      return { status: "demo", message: "" };
    }
    try {
      const parsed = new URL(url);
      const isPowerAutomate =
        parsed.hostname.includes("powerplatform.com") ||
        parsed.hostname.includes("logic.azure.com");
      if (isPowerAutomate && !parsed.searchParams.get("sig")) {
        return {
          status: "incomplete",
          message:
            "Falta la firma (&sig=...) al final de la URL. En Power Automate selecciona 'Cualquier usuario', guarda el flujo con licencia activa y vuelve a copiar la URL HTTP POST completa."
        };
      }
      return { status: "ready", message: "" };
    } catch (_) {
      return {
        status: "incomplete",
        message: "La URL configurada en config.js no tiene un formato válido."
      };
    }
  }

  const webhookState = analyzeWebhookConfig(webhookUrl);

  // --- Inicialización ---
  function init() {
    if (CFG.appTitle) elTitle.textContent = CFG.appTitle;
    if (CFG.companySubtitle) elSubtitle.textContent = CFG.companySubtitle;

    elDemoBanner.hidden = webhookState.status !== "demo";
    if (webhookState.status === "incomplete") {
      elConfigBanner.hidden = false;
      elConfigBannerDetail.textContent = webhookState.message;
    } else {
      elConfigBanner.hidden = true;
    }

    populateCostCenters();
    restoreLastPassenger();
    syncTripUIForRut();
    updateClock();
    setInterval(updateClock, 1000);

    updateOnlineStatus();
    updateQueueUI();
    flushQueue();

    registerServiceWorker();
    bindEvents();
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => {});
    }
  }

  function populateCostCenters() {
    if (!Array.isArray(CFG.costCenters) || CFG.costCenters.length === 0) return;
    CFG.costCenters.forEach((cc) => {
      const opt = document.createElement("option");
      opt.value = cc;
      elCCList.appendChild(opt);
    });
  }

  function restoreLastPassenger() {
    if (!CFG.rememberLastPassenger) return;
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_PASSENGER_KEY) || "null");
      if (saved && saved.rut) {
        elRut.value = cleanRut(saved.rut);
        if (saved.centroCostos) elCC.value = saved.centroCostos;
        elClearSavedBtn.hidden = false;
      }
    } catch (_) {}
  }

  function saveLastPassenger(rut, centroCostos) {
    if (!CFG.rememberLastPassenger) return;
    try {
      localStorage.setItem(LAST_PASSENGER_KEY, JSON.stringify({ rut, centroCostos }));
      elClearSavedBtn.hidden = false;
    } catch (_) {}
  }

  // --- Reloj automático ---
  function getTimestampParts(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return {
      fechaISO: `${year}-${month}-${day}`,
      fechaDisplay: `${day}/${month}/${year}`,
      hora: `${hours}:${minutes}:${seconds}`
    };
  }

  function updateClock() {
    const now = getTimestampParts();
    elLiveDate.textContent = now.fechaDisplay;
    elLiveTime.textContent = now.hora;
  }

  // --- Normalización y validación de RUT chileno (sin puntos ni guión) ---
  function cleanRut(value) {
    return String(value || "").replace(/[^0-9kK]/g, "").toUpperCase();
  }

  function isValidRut(value) {
    const clean = cleanRut(value);
    if (clean.length < 8 || clean.length > 9) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    if (!/^\d+$/.test(body)) return false;

    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = 11 - (sum % 11);
    const expectedDv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
    return dv === expectedDv;
  }

  // --- Control de viaje activo por RUT (evita marcar Inicio/Fin invertidos) ---
  function getActiveTripsMap() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_TRIPS_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveActiveTripsMap(map) {
    localStorage.setItem(ACTIVE_TRIPS_KEY, JSON.stringify(map));
  }

  function getActiveTrip(rut) {
    const map = getActiveTripsMap();
    const trip = map[rut];
    if (!trip) return { trip: null, expired: false };

    const elapsed = Date.now() - Number(trip.startedAtMs || 0);
    if (!trip.startedAtMs || elapsed > maxTripMs) {
      delete map[rut];
      saveActiveTripsMap(map);
      return { trip: null, expired: true };
    }
    return { trip, expired: false };
  }

  function setActiveTrip(rut, tripData) {
    const map = getActiveTripsMap();
    map[rut] = tripData;
    saveActiveTripsMap(map);
  }

  function clearActiveTrip(rut) {
    const map = getActiveTripsMap();
    if (map[rut]) {
      delete map[rut];
      saveActiveTripsMap(map);
    }
  }

  function syncTripUIForRut() {
    const rut = cleanRut(elRut.value);
    elTipoError.hidden = true;

    if (!isValidRut(rut)) {
      elTypeGrid.classList.remove("single-option");
      elBtnInicio.hidden = false;
      elBtnFin.hidden = false;
      elBtnInicio.disabled = true;
      elBtnFin.disabled = true;
      elBtnInicio.setAttribute("aria-pressed", "false");
      elBtnFin.setAttribute("aria-pressed", "false");
      elTipoInput.value = "";
      elTripHint.className = "trip-hint";
      elTripHint.textContent = "Ingresa tu RUT válido para habilitar Inicio o Finalización.";
      elSubmitBtn.disabled = true;
      return;
    }

    const { trip, expired } = getActiveTrip(rut);
    elTypeGrid.classList.add("single-option");
    elSubmitBtn.disabled = false;

    if (trip) {
      elBtnInicio.hidden = true;
      elBtnInicio.disabled = true;
      elBtnInicio.setAttribute("aria-pressed", "false");

      elBtnFin.hidden = false;
      elBtnFin.disabled = false;
      elBtnFin.setAttribute("aria-pressed", "true");
      elTipoInput.value = "Finalización";

      if (!elCC.value.trim() && trip.centroCostos) {
        elCC.value = trip.centroCostos;
      }

      elTripHint.className = "trip-hint trip-active";
      elTripHint.textContent =
        `Viaje en curso desde las ${trip.horaInicio} (${trip.fechaDisplay}). ` +
        `Solo está habilitada la Finalización (límite ${maxTripHours} h).`;
    } else {
      elBtnFin.hidden = true;
      elBtnFin.disabled = true;
      elBtnFin.setAttribute("aria-pressed", "false");

      elBtnInicio.hidden = false;
      elBtnInicio.disabled = false;
      elBtnInicio.setAttribute("aria-pressed", "true");
      elTipoInput.value = "Inicio";

      elTripHint.className = "trip-hint trip-ready";
      elTripHint.textContent = expired
        ? `Tu inicio anterior superó las ${maxTripHours} h sin cierre y expiró. Puedes registrar un nuevo Inicio.`
        : "Sin viaje en curso. Marca Inicio al subir al móvil.";
    }
  }

  // --- Cola offline ---
  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    updateQueueUI();
  }

  function enqueueRecord(record) {
    const queue = getQueue();
    queue.push(record);
    saveQueue(queue);
  }

  function updateQueueUI() {
    const count = getQueue().length;
    if (count > 0) {
      elSyncBanner.hidden = false;
      elSyncBannerText.textContent =
        count === 1
          ? "1 marcación pendiente de envío a SharePoint."
          : `${count} marcaciones pendientes de envío a SharePoint.`;
      if (lastSyncError) {
        elSyncBannerDetail.textContent = `Último intento: ${lastSyncError}`;
        elSyncBannerDetail.hidden = false;
      } else {
        elSyncBannerDetail.hidden = true;
      }
      elPendingFooter.textContent = `Pendientes: ${count}`;
    } else {
      lastSyncError = "";
      elSyncBanner.hidden = true;
      elSyncBannerDetail.hidden = true;
      elPendingFooter.textContent = "";
    }
  }

  function updateOnlineStatus() {
    const online = navigator.onLine;
    elStatusBadge.classList.toggle("status-online", online);
    elStatusBadge.classList.toggle("status-offline", !online);
    elStatusText.textContent = online ? "En línea" : "Sin conexión";
  }

  async function sendToWebhook(record) {
    if (!webhookUrl) {
      const logs = JSON.parse(localStorage.getItem(DEMO_LOGS_KEY) || "[]");
      logs.push(record);
      localStorage.setItem(DEMO_LOGS_KEY, JSON.stringify(logs));
      return { ok: true, demo: true };
    }

    const headers = { "Content-Type": "application/json" };
    if (CFG.apiKey) {
      headers["x-api-key"] = CFG.apiKey;
    }

    const payload = {
      ...record,
      apiKey: CFG.apiKey || undefined
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { ok: true, demo: false };
  }

  async function flushQueue() {
    if (isFlushing || !navigator.onLine || !webhookUrl) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    isFlushing = true;
    const remaining = [];
    lastSyncError = "";

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        await sendToWebhook({ ...item, sincronizadoDesde: "Cola Offline" });
      } catch (err) {
        lastSyncError = err && err.message ? err.message : "Error de conexión o CORS";
        remaining.push(...queue.slice(i));
        break;
      }
    }

    saveQueue(remaining);
    isFlushing = false;
  }

  // --- Eventos ---
  function bindEvents() {
    window.addEventListener("online", () => {
      updateOnlineStatus();
      flushQueue();
    });

    window.addEventListener("offline", updateOnlineStatus);

    elRetrySyncBtn.addEventListener("click", () => {
      flushQueue();
    });

    elClearQueueBtn.addEventListener("click", () => {
      if (confirm("¿Descartar los registros pendientes de prueba guardados en este dispositivo?")) {
        lastSyncError = "";
        saveQueue([]);
      }
    });

    elRut.addEventListener("input", () => {
      elRut.value = cleanRut(elRut.value);
      clearError(elRut, elRutError);
      syncTripUIForRut();
    });

    elCC.addEventListener("input", () => {
      clearError(elCC, elCCError);
    });

    elClearSavedBtn.addEventListener("click", () => {
      localStorage.removeItem(LAST_PASSENGER_KEY);
      elRut.value = "";
      elCC.value = "";
      elClearSavedBtn.hidden = true;
      syncTripUIForRut();
      elRut.focus();
    });

    elTypeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled || btn.hidden) return;
        const selectedType = btn.dataset.type;
        elTipoInput.value = selectedType;
        elTypeButtons.forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        elTipoError.hidden = true;
      });
    });

    elForm.addEventListener("submit", handleSubmit);

    elNewRecordBtn.addEventListener("click", () => {
      elReceipt.hidden = true;
      elForm.hidden = false;
      syncTripUIForRut();
    });
  }

  function showError(inputEl, errorEl, message) {
    if (inputEl) inputEl.classList.add("invalid");
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(inputEl, errorEl) {
    if (inputEl) inputEl.classList.remove("invalid");
    errorEl.hidden = true;
  }

  function createTripId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const rutNormalized = cleanRut(elRut.value);
    elRut.value = rutNormalized;
    const centroCostos = elCC.value.trim();

    let valid = true;

    if (!isValidRut(rutNormalized)) {
      showError(elRut, elRutError, "Ingresa un RUT válido sin puntos ni guión (ej: 123456789).");
      valid = false;
    }

    if (!centroCostos) {
      showError(elCC, elCCError, "Ingresa el centro de costos.");
      valid = false;
    } else if (
      CFG.allowCustomCostCenter === false &&
      Array.isArray(CFG.costCenters) &&
      CFG.costCenters.length > 0 &&
      !CFG.costCenters.includes(centroCostos)
    ) {
      showError(elCC, elCCError, "Selecciona un centro de costos válido de la lista.");
      valid = false;
    }

    if (!valid) return;

    // Revalidar estado del viaje en el instante del envío para evitar inconsistencias
    const { trip } = getActiveTrip(rutNormalized);
    const tipo = trip ? "Finalización" : "Inicio";

    elSubmitBtn.disabled = true;
    elSubmitBtn.textContent = "Registrando...";

    const ts = getTimestampParts();
    const tripId = trip ? trip.tripId : createTripId();

    const record = {
      id: tripId,
      rut: rutNormalized,
      centroCostos,
      tipo,
      estado: tipo === "Inicio" ? "En viaje" : "Finalizado",
      fecha: trip ? trip.fechaInicio : ts.fechaISO,
      hora: ts.hora,
      horaInicio: trip ? trip.horaInicio : ts.hora,
      horaFin: tipo === "Finalización" ? ts.hora : "",
      sincronizadoDesde: "En línea"
    };

    if (tipo === "Inicio") {
      setActiveTrip(rutNormalized, {
        tripId,
        fechaInicio: ts.fechaISO,
        fechaDisplay: ts.fechaDisplay,
        horaInicio: ts.hora,
        startedAtMs: Date.now(),
        centroCostos
      });
    } else {
      clearActiveTrip(rutNormalized);
    }

    saveLastPassenger(rutNormalized, centroCostos);

    let queuedOffline = false;

    if (!navigator.onLine && webhookUrl) {
      lastSyncError = "Sin conexión a internet";
      enqueueRecord(record);
      queuedOffline = true;
    } else {
      try {
        await sendToWebhook(record);
        flushQueue();
      } catch (err) {
        lastSyncError = err && err.message ? err.message : "Error de conexión o CORS";
        enqueueRecord(record);
        queuedOffline = true;
      }
    }

    showReceipt(record, ts.fechaDisplay, queuedOffline);

    elSubmitBtn.disabled = false;
    elSubmitBtn.textContent = "Registrar Marcación";
  }

  function showReceipt(record, fechaDisplay, queuedOffline) {
    elForm.hidden = true;
    elReceipt.hidden = false;

    elRecRut.textContent = record.rut;
    elRecCC.textContent = record.centroCostos;
    elRecTipo.textContent = record.tipo;
    elRecDatetime.textContent = `${fechaDisplay} · ${record.hora}`;

    if (queuedOffline) {
      elReceiptIcon.textContent = "⏳";
      elReceiptIcon.classList.add("queued");
      elReceiptTitle.textContent = "Guardado localmente";
      elReceiptSubtitle.textContent =
        "La hora exacta quedó guardada. Se enviará automáticamente cuando el webhook responda correctamente.";
    } else if (!webhookUrl) {
      elReceiptIcon.textContent = "✓";
      elReceiptIcon.classList.remove("queued");
      elReceiptTitle.textContent = "Marcación registrada (Demo)";
      elReceiptSubtitle.textContent =
        "Registro guardado localmente en modo prueba. Configura webhookUrl en config.js para enviarlo a SharePoint.";
    } else {
      elReceiptIcon.textContent = "✓";
      elReceiptIcon.classList.remove("queued");
      elReceiptTitle.textContent = "Marcación enviada";
      elReceiptSubtitle.textContent = "Tu registro fue enviado correctamente al sistema.";
    }
  }

  init();
})();
