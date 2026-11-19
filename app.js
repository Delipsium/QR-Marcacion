(() => {
  const CFG = window.APP_CONFIG || {};
  const QUEUE_KEY = "qr_marcacion_queue_v1";
  const DEMO_LOGS_KEY = "qr_marcacion_demo_logs_v1";
  const LAST_PASSENGER_KEY = "qr_marcacion_last_passenger_v1";

  // Elementos del DOM
  const elTitle = document.getElementById("app-title");
  const elSubtitle = document.getElementById("app-subtitle");
  const elStatusBadge = document.getElementById("status-badge");
  const elStatusText = document.getElementById("status-text");
  const elMovilBadge = document.getElementById("movil-badge");
  const elMovilName = document.getElementById("movil-name");
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
  const elRecMovil = document.getElementById("rec-movil");
  const elNewRecordBtn = document.getElementById("new-record-btn");

  const params = new URLSearchParams(window.location.search);
  const movilName = (params.get("movil") || CFG.defaultMovil || "General").trim();
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

    if (movilName) {
      elMovilName.textContent = movilName;
      elMovilBadge.hidden = false;
    }

    elDemoBanner.hidden = webhookState.status !== "demo";
    if (webhookState.status === "incomplete") {
      elConfigBanner.hidden = false;
      elConfigBannerDetail.textContent = webhookState.message;
    } else {
      elConfigBanner.hidden = true;
    }

    populateCostCenters();
    restoreLastPassenger();
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
        elRut.value = saved.rut;
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

    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const absMin = Math.abs(offsetMin);
    const offsetStr = `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`;

    return {
      fechaISO: `${year}-${month}-${day}`,
      fechaDisplay: `${day}/${month}/${year}`,
      hora: `${hours}:${minutes}:${seconds}`,
      timestampISO: `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`
    };
  }

  function updateClock() {
    const now = getTimestampParts();
    elLiveDate.textContent = now.fechaDisplay;
    elLiveTime.textContent = now.hora;
  }

  // --- Validación y formato de RUT chileno ---
  function cleanRut(value) {
    return value.replace(/[^0-9kK]/g, "").toUpperCase();
  }

  function formatRut(value) {
    const clean = cleanRut(value);
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formattedBody}-${dv}`;
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
      elRut.value = formatRut(elRut.value);
      clearError(elRut, elRutError);
    });

    elCC.addEventListener("input", () => {
      clearError(elCC, elCCError);
    });

    elClearSavedBtn.addEventListener("click", () => {
      localStorage.removeItem(LAST_PASSENGER_KEY);
      elRut.value = "";
      elCC.value = "";
      elClearSavedBtn.hidden = true;
      elRut.focus();
    });

    elTypeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
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
      elTipoInput.value = "";
      elTypeButtons.forEach((b) => b.setAttribute("aria-pressed", "false"));
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

  async function handleSubmit(event) {
    event.preventDefault();

    const rutFormatted = formatRut(elRut.value);
    const centroCostos = elCC.value.trim();
    const tipo = elTipoInput.value.trim();

    let valid = true;

    if (!isValidRut(rutFormatted)) {
      showError(elRut, elRutError, "Ingresa un RUT válido (ej: 12.345.678-9).");
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

    if (tipo !== "Inicio" && tipo !== "Finalización") {
      showError(null, elTipoError, "Selecciona si es Inicio o Finalización del viaje.");
      valid = false;
    }

    if (!valid) return;

    elSubmitBtn.disabled = true;
    elSubmitBtn.textContent = "Registrando...";

    const ts = getTimestampParts();
    const record = {
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rut: rutFormatted,
      centroCostos,
      tipo,
      fecha: ts.fechaISO,
      hora: ts.hora,
      timestampISO: ts.timestampISO,
      movil: movilName,
      sincronizadoDesde: "En línea"
    };

    saveLastPassenger(rutFormatted, centroCostos);

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
    elRecMovil.textContent = record.movil;

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
