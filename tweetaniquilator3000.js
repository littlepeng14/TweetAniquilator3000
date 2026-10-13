/*
 * Tweetaniquilator3000
 * Borra tus tweets y retweets desde la web de X, gratis y sin API.
 *
 * - Lee las respuestas reales del servidor (200 = borrado, 429 = límite).
 * - Trabaja por tandas y descansa entre ellas para respetar el límite de X.
 * - Si X devuelve un 429, espera y continúa solo.
 *
 * Uso: abre tu perfil en x.com (pestaña Posts), recarga (F5), abre la
 * consola (F12), pega este script y pulsa Enter.
 * Para detenerlo: escribe  window.detener = true  en la consola.
 *
 * Aviso: úsalo solo en tu propia cuenta y bajo tu responsabilidad.
 * Automatizar la web de X puede ir contra sus condiciones de uso.
 */
(async () => {
  window.detener = false;

  // ---- Ajustes ----
  const MAX_POR_TANDA = 190;           // X permite 200; margen de seguridad
  const DESCANSO_MS = 8 * 60000;       // descanso mínimo entre tandas
  const VENTANA_MS = 15 * 60000;       // duración estimada de la ventana de límite
  const MARGEN_MS = 30000;             // extra tras la hora de renovación
  const PAUSA_MIN = 1500;              // ms entre borrados
  const PAUSA_MAX = 2800;
  const ESPERA_BASE = 60000;           // backoff para errores que no son 429
  const ESPERA_MAX = 15 * 60000;
  const MAX_FALLOS_SEGUIDOS = 6;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const azar = () => PAUSA_MIN + Math.random() * (PAUSA_MAX - PAUSA_MIN);
  const esperar = async (fn, tiempo = 3000) => {
    const inicio = Date.now();
    while (Date.now() - inicio < tiempo) {
      const el = fn();
      if (el) return el;
      await sleep(100);
    }
    return null;
  };
  const cerrarMenus = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
  const hora = (ms) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  // ---- Lectura de las respuestas reales de X (por 3 vías) ----
  const RX_API = /(DeleteTweet|DeleteRetweet)(\?|$)/;
  const estados = [];                       // {t, status} de cada borrado
  const limite = { remaining: null, reset: null };
  const anotar = (status, rem, rst) => {
    estados.push({ t: Date.now(), status });
    if (rem !== null && rem !== undefined && rem !== "") limite.remaining = Number(rem);
    if (rst !== null && rst !== undefined && rst !== "") limite.reset = Number(rst);
  };

  // Vía 1: fetch
  if (!window.__fetchOriginal) window.__fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const res = await window.__fetchOriginal.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0].url;
      if (RX_API.test(url)) {
        anotar(res.status, res.headers.get("x-rate-limit-remaining"), res.headers.get("x-rate-limit-reset"));
      }
    } catch (e) { /* ignorar */ }
    return res;
  };

  // Vía 2: XMLHttpRequest
  if (!window.__xhrOpen) {
    window.__xhrOpen = XMLHttpRequest.prototype.open;
    window.__xhrSend = XMLHttpRequest.prototype.send;
  }
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__url = String(u);
    return window.__xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("loadend", () => {
      try {
        if (RX_API.test(this.__url)) {
          anotar(this.status, this.getResponseHeader("x-rate-limit-remaining"), this.getResponseHeader("x-rate-limit-reset"));
        }
      } catch (e) { /* ignorar */ }
    });
    return window.__xhrSend.apply(this, arguments);
  };

  // Vía 3: el propio navegador registra el código de cada petición
  if (window.__po) window.__po.disconnect();
  try {
    window.__po = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        if (RX_API.test(e.name) && e.responseStatus) anotar(e.responseStatus, null, null);
      }
    });
    window.__po.observe({ type: "resource", buffered: false });
  } catch (e) { /* navegador sin soporte: quedan las otras dos vías */ }

  // ---- Estado de la tanda ----
  const RX_BORRAR = /eliminar|delete/i;
  let borrados = 0;
  let noBorrados = 0;       // rechazados por X (reaparecerán al recargar)
  let tandaCount = 0;
  let tandaInicio = null;
  let fallosSeguidos = 0;
  let intentosSinNada = 0;

  const descansar = async (resetSeg, forzarVentana) => {
    let fin = Date.now() + DESCANSO_MS;
    if (resetSeg) fin = Math.max(fin, resetSeg * 1000 + MARGEN_MS);
    else if (forzarVentana) fin = Math.max(fin, Date.now() + VENTANA_MS);
    else if (tandaInicio) fin = Math.max(fin, tandaInicio + VENTANA_MS + MARGEN_MS);
    console.log(`⏳ Descanso. Retomo sobre las ${hora(fin)} (hora local). No cierres la pestaña.`);
    let ultimoAviso = Date.now();
    while (Date.now() < fin && !window.detener) {
      if (Date.now() - ultimoAviso > 3 * 60000) {
        console.log(`   ...faltan unos ${Math.max(0, Math.round((fin - Date.now()) / 60000))} min`);
        ultimoAviso = Date.now();
      }
      await sleep(Math.min(30000, Math.max(1000, fin - Date.now())));
    }
    tandaCount = 0;
    tandaInicio = null;
    limite.remaining = null;
    limite.reset = null;
    estados.length = 0;
    if (!window.detener) console.log("▶ Continúo borrando.");
  };

  const resetValido = () => (limite.reset && limite.reset * 1000 > Date.now() ? limite.reset : null);

  // Pulsa "confirmar" y averigua qué respondió realmente X
  const confirmarYVerificar = async (art, confirmar, esRetweet) => {
    const t0 = Date.now();
    if (!tandaInicio) tandaInicio = t0;
    confirmar.click();
    const est = await esperar(() => estados.find((e) => e.t >= t0), 6000);
    if (est) {
      if (est.status === 429) return "limite";
      return est.status >= 200 && est.status < 300 ? "ok" : "fallo";
    }
    // Sin información de red: último recurso, mirar la pantalla
    const hecho = await esperar(
      () => !document.body.contains(art) || (esRetweet && !art.querySelector('[data-testid="unretweet"]')),
      5000
    );
    return hecho ? "ok" : "fallo";
  };

  const resolver = async (res) => {
    if (res === "ok") {
      borrados++;
      tandaCount++;
      fallosSeguidos = 0;
      console.log(`✔ Borrado confirmado por X (${borrados})`);
      if (limite.remaining === 0 || tandaCount >= MAX_POR_TANDA) {
        console.log(`📦 Tanda completada (${tandaCount} tweets).`);
        await descansar(resetValido(), false);
      }
      return;
    }
    cerrarMenus();
    fallosSeguidos++;
    if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
      console.log("✖ X sigue rechazando los borrados. Me detengo. Prueba de nuevo más tarde.");
      window.detener = true;
      return;
    }
    if (res === "limite") {
      noBorrados++;
      console.log("⚠ X respondió 429: este tweet NO se borró (reaparecerá al recargar).");
      const rst = resetValido();
      await descansar(rst, !rst);
    } else {
      const espera = Math.min(ESPERA_BASE * 2 ** (fallosSeguidos - 1), ESPERA_MAX);
      noBorrados++;
      console.log(`⚠ Borrado rechazado (fallo ${fallosSeguidos}). Espero ${Math.round(espera / 60000)} min...`);
      await sleep(espera);
    }
  };

  // ---- Bucle principal ----
  while (!window.detener && intentosSinNada < 6) {
    const art = [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((a) => !a.dataset.omitido);

    if (!art) {
      window.scrollBy(0, 1500);
      await sleep(2000);
      intentosSinNada++;
      continue;
    }
    intentosSinNada = 0;
    art.scrollIntoView({ block: "center" });

    // Caso 1: retweet tuyo -> deshacer
    const unrt = art.querySelector('[data-testid="unretweet"]');
    if (unrt) {
      unrt.click();
      const ok = await esperar(() => document.querySelector('[data-testid="unretweetConfirm"]'));
      if (!ok) { art.dataset.omitido = "1"; continue; }
      const res = await confirmarYVerificar(art, ok, true);
      await resolver(res);
      if (res === "ok") await sleep(azar());
      continue;
    }

    // Caso 2: tweet propio -> menú "..." > Eliminar
    const caret = art.querySelector('[data-testid="caret"]');
    if (!caret) { art.dataset.omitido = "1"; continue; }
    caret.click();
    const opcion = await esperar(() =>
      [...document.querySelectorAll('[role="menuitem"]')].find((m) => RX_BORRAR.test(m.textContent))
    );
    if (!opcion) {
      cerrarMenus();
      art.dataset.omitido = "1";
      await sleep(400);
      continue;
    }
    opcion.click();
    const confirmar = await esperar(() => document.querySelector('[data-testid="confirmationSheetConfirm"]'));
    if (!confirmar) { art.dataset.omitido = "1"; continue; }
    const res = await confirmarYVerificar(art, confirmar, false);
    await resolver(res);
    if (res === "ok") await sleep(azar());
  }

  // ---- Limpieza ----
  window.fetch = window.__fetchOriginal;
  XMLHttpRequest.prototype.open = window.__xhrOpen;
  XMLHttpRequest.prototype.send = window.__xhrSend;
  if (window.__po) window.__po.disconnect();

  console.log(`Terminado. Borrados confirmados: ${borrados}.`);
  if (noBorrados > 0) {
    console.log(`Hay ${noBorrados} tweet(s) que X rechazó. Recarga (F5) y vuelve a pegar el script para borrarlos.`);
  }
})();
