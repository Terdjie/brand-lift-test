const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxPDl2U7iAsaLCL0MR-gXm_Ia8yRqzDZNhNiZoAckJbrO7emGVzqsE98z3NaWL3KOCqlA/exec";
const TOKEN = "LennyBLS123"; // optionnel

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getClickUrl() {
  return (
    new URLSearchParams(window.location.search).get("clickTag") ||
    window.clickTag ||
    "https://www.microsoft.com"
  );
}

function setStatus(el, msg, isError = false) {
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger)" : "";
}

function sanitize(str) {
  return String(str || "").trim().slice(0, 120);
}

function sendBeaconGet(paramsObj) {
  const params = new URLSearchParams(paramsObj);
  const img = new Image();
  img.src = `${APPS_SCRIPT_URL}?${params.toString()}`;
}

(function init() {
  const form = document.getElementById("surveyForm");
  const sendBtn = document.getElementById("sendBtn");
  const status = document.getElementById("status");
  const thankYou = document.getElementById("thankYou");
  const ctaClick = document.getElementById("ctaClick");

  // ✅ Force l'état initial
  form.hidden = false;
  thankYou.hidden = true;
  sendBtn.disabled = false;

  ctaClick.addEventListener("click", () => {
    window.open(getClickUrl(), "_blank", "noopener,noreferrer");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    // ✅ empêche double submit
    if (sendBtn.disabled) return;

    // Q1 free text
    const q1 = sanitize(document.getElementById("q1").value);
    
    // Q2 multi-select
    const q2 = Array.from(document.querySelectorAll('input[name="q2"]:checked'))
      .map(el => el.value)
      .join(", ");

    // Q3 single-select
    const q3El = document.querySelector('input[name="q3"]:checked');
    const q3 = q3El ? q3El.value : "";




    if (!q1 || !q2 || !q3) {
      setStatus(status, "Please answer all questions.", true);
      return;
    }

    // ✅ Désactive + grise le bouton (et optionnel: change le label)
    sendBtn.disabled = true;
    sendBtn.textContent = "Envoyé";
    setStatus(status, "Envoi en cours…");


    const payload = {
      ts: new Date().toISOString(),
      cid: qs("cid") || "",
      crid: qs("crid") || "",
      q1,
      q2,
      q3,
      ua: navigator.userAgent,
      t: TOKEN
    };

    try {
      sendBeaconGet(payload);

      // ✅ Affiche Merci uniquement après envoi
      setStatus(status, "");
      thankYou.hidden = false;

      //setStatus(status, "");
      form.hidden = true;
      //thankYou.hidden = false;
    } catch (err) {
      console.error(err);
      setStatus(status, "Échec de l’envoi. Réessaie.", true);
      sendBtn.disabled = false;
    }
  });
})();

