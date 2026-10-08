/* Preview stays offline. Connected forms use the same-origin, validated enquiry endpoint. */
(() => {
  'use strict';
  const form = document.getElementById('exb-enquiry-form');
  if (!form) return;
  const de = document.documentElement.lang === 'de';
  const email = form.elements.namedItem('reply-email');
  const intent = form.elements.namedItem('anliegen');
  const status = document.getElementById('exb-form-status');
  const summary = form.querySelector('.exb-form-error-summary');
  const name = form.elements.namedItem('name-alias');
  const messageField = form.elements.namedItem('short-message');
  const replyLanguage = form.elements.namedItem('reply-language');
  const receiptKey = 'exb-receipt-ref';
  const fieldMap = {email, intent, name, message: messageField, context: messageField, replyLanguage};
  const errorIds = {email: 'email-error', intent: 'intent-error', name: 'name-error', message: 'message-error', replyLanguage: 'reply-language-error'};
  for (const [key, field] of Object.entries(fieldMap)) {
    if (!errorIds[key] || document.getElementById(errorIds[key])) continue;
    const error = document.createElement('span'); error.id = errorIds[key]; error.className = 'exb-field-error'; error.hidden = true;
    field.insertAdjacentElement('afterend', error);
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
  }
  const allowed = new Set([...intent.options].map(o => o.value).filter(Boolean));
  const supplied = new URL(location.href).searchParams.get('anliegen');
  if (!intent.value && supplied && supplied.length <= 200 && allowed.has(supplied)) intent.value = supplied;
  const connected = form.dataset.sendEnabled === 'true' && form.getAttribute('action') === '/api/enquiry';
  const submit = form.querySelector('button[type="submit"]');
  let dirty = false, pending = false;
  form.addEventListener('input', () => { dirty = true; });
  const noSend = () => { status.textContent = de ? 'Nicht gesendet. Diese lokale Entwurfsansicht hat keinen Versandanschluss.' : 'Not sent. This local draft preview has no sending connection.'; };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!connected) { noSend(); return; }
    if (pending || !validate()) return;
    pending = true; submit.disabled = true; form.setAttribute('aria-busy', 'true');
    status.textContent = de ? 'Deine Anfrage wird übermittelt.' : 'Your enquiry is being sent.';
    const value = key => form.elements.namedItem(key).value.trim();
    const message = value('short-message');
    let context = '';
    const query = new URL(location.href).searchParams.get('kontext');
    const contexts = JSON.parse(document.getElementById('exb-public-contexts').textContent);
    if (Object.hasOwn(contexts, query) && message.includes(contexts[query])) context = query;
    const data = {lang: de ? 'de' : 'en', replyLanguage: value('reply-language'), email: value('reply-email'), intent: intent.value, name: value('name-alias'), message, context, website: value('website')};
    let ref;
    try { ref = [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join(''); sessionStorage.setItem('exb-receipt-ref', ref); }
    catch { ref = undefined; }
    try {
      const headers = {'Content-Type': 'application/json', Accept: 'application/json'};
      if (ref) headers['X-EXOBASIS-Receipt-Ref'] = ref;
      const response = await fetch('/api/enquiry', {method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(20000)});
      const result = await response.json();
      const destination = de ? '/de/anfrage/bestaetigung/' : '/en/enquiry/confirmation/';
      if (response.status === 202 && result.status === 'sent' && result.confirmation === destination) {
        dirty = false; status.textContent = de ? 'Deine Anfrage wurde übermittelt. Wir melden uns über den angegebenen Rückweg.' : 'Your enquiry has been sent. We will reply using the contact details you provided.';
        // Confirm the cookie survived before leaving a known SMTP success on this form.
        if (ref) {
          try {
            const proof = await fetch('/api/enquiry/confirmation?lang=' + data.lang, {credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: {Accept: 'application/json', 'X-EXOBASIS-Receipt-Ref': ref}, signal: AbortSignal.timeout(10000)});
            if (proof.status === 200 && (await proof.json()).status === 'sent') { location.assign(destination); return; }
          } catch { /* Keep the confirmed form result visible. */ }
        }
        return;
      }
      if (result.status === 'invalid') {
        showErrors(Array.isArray(result.fields) ? result.fields : ['form'], true);
        status.textContent = de ? 'Bitte prüfe deine Angaben. Die Anfrage wurde nicht übermittelt.' : 'Please check your entries. The enquiry was not sent.';
      } else if (result.status === 'rejected' && result.code === 'RATE_LIMIT') {
        status.textContent = de ? 'Zu viele Anfragen in kurzer Zeit. Bitte warte einige Minuten, bevor du es erneut versuchst.' : 'Too many enquiries in a short time. Please wait a few minutes before trying again.';
      } else if (result.status === 'error' && result.code === 'TRANSPORT_REJECTED') {
        status.textContent = de ? 'Die Übermittlung hat nicht funktioniert. Deine Eingaben bleiben hier erhalten. Du kannst es erneut versuchen oder uns per E-Mail schreiben.' : 'Sending failed. Your entries remain on this page. You can try again or write to us by email.';
      } else {
        status.textContent = de ? 'Der Übermittlungsstatus ist noch unklar. Bitte sende nicht mehrfach dieselbe Anfrage.' : 'The sending status is unclear. Please do not submit the same enquiry repeatedly.';
      }
    } catch {
      status.textContent = de ? 'Der Übermittlungsstatus ist noch unklar. Deine Eingaben bleiben erhalten. Bitte sende nicht mehrfach dieselbe Anfrage.' : 'The sending status is unclear. Your entries have been retained. Please do not submit the same enquiry repeatedly.';
    } finally { pending = false; submit.disabled = false; form.removeAttribute('aria-busy'); }
  });
  document.querySelectorAll('.exb-contact-call a[href*="#"]').forEach(link => {
    link.addEventListener('click', () => { const value = de ? 'Orientierungsgespräch' : 'Orientation call'; if (!intent.value) intent.value = value; });
  });
  function showErrors(keys, focusField = false) {
    summary.replaceChildren(); summary.hidden = true;
    for (const key of Object.keys(errorIds)) {
      const field = fieldMap[key], error = document.getElementById(errorIds[key]);
      error.textContent = ''; error.hidden = true; field.setAttribute('aria-invalid', 'false');
    }
    const messages = {
      email: de ? 'Bitte trage eine erreichbare E-Mail-Adresse ein.' : 'Please enter an email address we can reply to.',
      intent: de ? 'Bitte wähle dein Anliegen aus.' : 'Please select what you need help with.',
      name: de ? 'Bitte kürze den Namen auf 120 Zeichen und entferne Zeilenumbrüche oder Steuerzeichen.' : 'Please limit the name to 120 characters and remove line breaks or control characters.',
      message: de ? 'Bitte kürze die Nachricht auf 2000 Zeichen und entferne Steuerzeichen.' : 'Please limit the message to 2000 characters and remove control characters.',
      context: de ? 'Bitte prüfe den öffentlichen Seitenbezug in der Nachricht.' : 'Please check the public page context in your message.',
      replyLanguage: de ? 'Bitte wähle Deutsch oder English als Antwortsprache.' : 'Please select Deutsch or English as the reply language.',
      form: de ? 'Bitte prüfe die Formularangaben.' : 'Please check the form entries.'
    };
    const errors = [...new Set(keys)].map(key => ({field: fieldMap[key], message: messages[key] || messages.form, key}));
    for (const {field, message, key} of errors) {
      if (!field) continue;
      const error = document.getElementById(errorIds[key] || 'message-error');
      error.textContent = message; error.hidden = false; field.setAttribute('aria-invalid', 'true');
    }
    if (errors.length) {
      const lead = document.createElement('strong'); lead.textContent = de ? 'Bitte prüfe die markierten Angaben.' : 'Please check the highlighted details.'; summary.append(lead);
      const list = document.createElement('ul');
      errors.forEach(({field, message}) => {const li=document.createElement('li'); if(field){const a=document.createElement('a');a.href='#'+field.id;a.textContent=message;a.addEventListener('click',()=>field.focus());li.append(a);}else li.textContent=message;list.append(li);});
      summary.append(list);summary.hidden=false;
      if(focusField&&errors[0].field)errors[0].field.focus();else summary.focus();
    }
    return !errors.length;
  }
  function validate() {
    status.textContent = '';
    const bad = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
    const errors = [];
    if (!email.validity.valid || email.value.length > 254) errors.push('email');
    if (!allowed.has(intent.value)) errors.push('intent');
    if (name.value.length > 120 || /[\r\n]/.test(name.value) || bad.test(name.value)) errors.push('name');
    if (messageField.value.length > 2000 || bad.test(messageField.value)) errors.push('message');
    if (!['de', 'en'].includes(replyLanguage.value)) errors.push('replyLanguage');
    return showErrors(errors);
  }
  document.getElementById('exb-check-form')?.addEventListener('click', () => {
    if (validate()) status.textContent = de ? 'Die Pflichtfelder sind ausgefüllt. Es wurde nichts gesendet oder gespeichert.' : 'The required fields are filled in. Nothing has been sent or stored.';
  });
  document.querySelectorAll('a.exb6-flag').forEach(link => link.addEventListener('click', event => {
    if (dirty && !confirm(de ? 'Die Eingaben sind nicht gesendet. Sprache wechseln und diese Eingabe verlassen?' : 'Your entries have not been sent. Change language and leave this form?')) event.preventDefault();
  }));
})();
