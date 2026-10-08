/* A direct visit never proves submission. A short-lived, tab-bound server receipt does. */
(async () => {
  'use strict';
  const lang = document.documentElement.lang;
  const de = lang === 'de';
  const status = document.querySelector('#c-status .exb-prose-content');
  if (!status || !['de', 'en'].includes(lang)) return;
  let ref;
  try { ref = sessionStorage.getItem('exb-receipt-ref'); } catch { return; }
  if (!/^[a-f0-9]{48}$/.test(ref || '')) return;
  try {
    const response = await fetch('/api/enquiry/confirmation?lang=' + lang, {credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: {Accept: 'application/json', 'X-EXOBASIS-Receipt-Ref': ref}, signal: AbortSignal.timeout(10000)});
    if (response.status !== 200) return;
    const receipt = await response.json();
    if (receipt.status !== 'sent' || receipt.lang !== lang) return;
    const title = document.querySelector('main h1');
    title.textContent = de ? 'Deine Anfrage wurde übermittelt.' : 'Your enquiry has been sent.';
    const intro = document.querySelector('main .exb-page-lead');
    intro.textContent = de ? 'Danke für deine Nachricht. Wir nutzen den von dir angegebenen Rückweg, um deine Aufgabe und den nächsten Schritt zu klären.' : 'Thank you for your message. We will use the reply address you provided to clarify your task and the next step.';
    const paragraph = document.createElement('p');
    paragraph.textContent = de ? 'Der Versanddienst hat deine Formularanfrage zur Übermittlung angenommen. Diese Rückmeldung bestätigt die Übermittlung, keinen Termin, Auftrag oder eine Aktivierung.' : 'The sending service has accepted your form enquiry for delivery. This confirms submission, not an appointment, commission or activation.';
    status.replaceChildren(paragraph);
    status.setAttribute('role', 'status');
    status.dataset.confirmed = 'true';
    try { if (sessionStorage.getItem('exb-receipt-ref') === ref) sessionStorage.removeItem('exb-receipt-ref'); } catch { /* Already visibly confirmed. */ }
    title.tabIndex = -1;
    title.focus();
  } catch {
    // Keep the truthful neutral state when proof is unavailable. Never retry a submission.
  }
})();
