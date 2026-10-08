/* Optional public origin-page context. No private URL data, sender or storage. */
(() => {
  'use strict';
  const form = document.getElementById('exb-enquiry-form');
  const source = document.getElementById('exb-public-contexts');
  if (!form || !source) return;
  let contexts;
  try { contexts = JSON.parse(source.textContent); } catch { return; }
  const query = new URL(location.href).searchParams.get('kontext');
  if (!query || query.length > 300 || !Object.hasOwn(contexts, query)) return;
  const suggestion = contexts[query];
  if (typeof suggestion !== 'string' || suggestion.length > 300) return;
  const message = form.elements.namedItem('short-message');
  const intent = form.elements.namedItem('anliegen');
  if (!(message instanceof HTMLTextAreaElement) || !(intent instanceof HTMLSelectElement)) return;
  const de = document.documentElement.lang === 'de';
  const notice = document.createElement('div');
  notice.className = 'exb-context-offer';
  notice.id = 'exb-context-offer';
  notice.setAttribute('role', 'status');
  message.insertAdjacentElement('afterend', notice);
  function offer() {
    notice.replaceChildren();
    // Public context is optional message text; an independently chosen intent stays selected.
    if (!intent.value) intent.value = de ? 'Allgemeine Anfrage' : 'General enquiry';
    if (!message.value.trim()) message.value = suggestion;
    if (message.value.includes(suggestion)) {
      notice.textContent = de ? 'Der öffentliche Seitenbezug ist als Vorschlag eingesetzt. Du kannst ihn ändern oder löschen.' : 'The public page context has been inserted as a suggestion. You can edit or remove it.';
      return;
    }
    const label = document.createElement('p');
    label.textContent = (de ? 'Optional ergänzen: ' : 'Optionally add: ') + suggestion;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = de ? 'Seitenbezug zur Nachricht ergänzen' : 'Add page context to your message';
    button.addEventListener('click', () => {
      const candidate = message.value.trimEnd() + '\n\n' + suggestion;
      if (candidate.length > message.maxLength) {
        label.textContent = de ? 'Die Nachricht ist bereits zu lang für diese Ergänzung. Bitte kürze sie selbst; deine Eingabe bleibt unverändert.' : 'Your message is too long for this addition. Please shorten it yourself; your text has not been changed.';
        return;
      }
      if (!message.value.includes(suggestion)) message.value = candidate;
      message.dispatchEvent(new Event('input', { bubbles: true }));
      notice.textContent = de ? 'Seitenbezug ergänzt. Deine bisherige Nachricht bleibt erhalten.' : 'Page context added. Your existing message has been retained.';
      message.focus();
    });
    notice.append(label, button);
  }
  offer();
  // A restored page already retains its fields. Never reinsert a suggestion the visitor removed.
})();
