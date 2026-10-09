/* EXOBASIS V6 | Progressive enhancement only.
   HTML contains all navigation destinations and all page copy before JavaScript runs.
   Public contact channels are bound by the renderer from confirmed contact settings. */
(() => {
  'use strict';
  const desktopQuery = matchMedia('(min-width: 1200px)');
  const header = document.querySelector('.exb-header-v6');
  const toggles = [...document.querySelectorAll('.exb6-menu-toggle')];
  let hoverOpen = 0;
  let hoverClose = 0;
  const setMenu = (toggle, open) => {
    const panel = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!panel) return;
    toggle.setAttribute('aria-expanded', String(open));
    const label = toggle.closest('.exb6-nav-head').querySelector('[data-nav-label]').textContent.trim();
    toggle.setAttribute('aria-label', document.documentElement.lang === 'en' ? `${label}: ${open ? 'close' : 'open'}` : `Untermenü ${label} ${open ? 'schließen' : 'öffnen'}`);
    panel.hidden = !open;
  };
  const closeMenus = (except = null) => {
    clearTimeout(hoverOpen);
    clearTimeout(hoverClose);
    toggles.forEach(toggle => { if (toggle !== except) setMenu(toggle, false); });
  };
  const openMenu = toggle => { closeMenus(toggle); setMenu(toggle, true); };
  toggles.forEach(toggle => {
    const item = toggle.closest('.exb6-nav-item');
    const head = item.querySelector('.exb6-nav-head');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      closeMenus(toggle); setMenu(toggle, open);
    });
    toggle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault(); openMenu(toggle);
      document.getElementById(toggle.getAttribute('aria-controls')).querySelector('a,button')?.focus();
    });
    head.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || !desktopQuery.matches) return;
      clearTimeout(hoverClose);
      clearTimeout(hoverOpen);
      hoverOpen = setTimeout(() => openMenu(toggle), 170);
    });
    item.addEventListener('pointerenter', () => clearTimeout(hoverClose));
    item.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(hoverOpen);
      if (item.contains(document.activeElement)) return;
      hoverClose = setTimeout(() => closeMenus(), 240);
    });
  });
  document.addEventListener('click', event => {
    if (header && !header.contains(event.target)) closeMenus();
  });
  document.addEventListener('focusin', event => {
    if (!event.target.closest('.exb6-nav')) closeMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = toggles.find(t => t.getAttribute('aria-expanded') === 'true');
    if (open) { closeMenus(); open.focus(); }
  });

  // Vertical service tabs: click, Up/Down/Home/End; normal Tab enters the visible links.
  const tabs = [...document.querySelectorAll('.exb6-service-tab')];
  const activateTab = (chosen, moveFocus = false) => {
    tabs.forEach(tab => {
      const selected = tab === chosen;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (moveFocus) chosen.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); activateTab(tabs[next], true);
    });
  });

  const dialog = document.getElementById('exb6-mobile-menu');
  const trigger = document.getElementById('exb6-mobile-trigger');
  const closeButton = document.getElementById('exb6-mobile-close');
  let oldOverflow = '';
  const closeMobile = () => { if (dialog?.open) dialog.close(); };
  trigger?.addEventListener('click', () => {
    if (!dialog || dialog.open) return;
    closeMenus();
    oldOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  });
  closeButton?.addEventListener('click', closeMobile);
  dialog?.addEventListener('close', () => {
    document.body.style.overflow = oldOverflow;
    trigger.setAttribute('aria-expanded', 'false');
    if (!desktopQuery.matches) trigger.focus();
  });
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeMobile();
  });
  dialog?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobile));
  const setMobileGroup = (toggle, open) => {
    toggle.setAttribute('aria-expanded', String(open));
    const name = toggle.closest('.exb6-mobile-section-head').querySelector('[data-nav-label]').textContent.trim();
    toggle.setAttribute('aria-label', document.documentElement.lang === 'en' ? `${name}: ${open ? 'close' : 'open'}` : `Untermenü ${name} ${open ? 'schließen' : 'öffnen'}`);
    const panel = document.getElementById(toggle.getAttribute('aria-controls'));
    if (panel) panel.hidden = !open;
  };
  dialog?.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const details = event.target.closest('details[open]');
    if (details) {
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector('summary').focus();
      return;
    }
    const toggle = event.target.closest('.exb6-mobile-section')?.querySelector('.exb6-mobile-section-toggle[aria-expanded="true"]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      setMobileGroup(toggle, false);
      toggle.focus();
    }
    // With no inner level open, the native dialog cancel closes the main menu.
  });
  document.querySelectorAll('.exb6-mobile-section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      document.querySelectorAll('.exb6-mobile-section-toggle').forEach(other => {
        const state = other === toggle && open;
        setMobileGroup(other, state);
      });
    });
  });
  desktopQuery.addEventListener('change', event => {
    closeMenus();
    if (event.matches) closeMobile();
  });
})();

/* Supplemental descriptions: hover, keyboard focus, hover over the tooltip,
   Escape to dismiss. Navigation itself is never intercepted. */
(() => {
  'use strict';
  const tip = document.getElementById('exb-tooltip');
  if (!tip) return;
  let owner = null;
  let timer = 0;
  let dismissTimer = 0;
  let pointerType = 'mouse';
  let dismissed = null;
  const hide = () => {
    window.clearTimeout(timer);
    window.clearTimeout(dismissTimer);
    tip.hidden = true;
    owner = null;
  };
  const place = () => {
    if (!owner || tip.hidden || !owner.isConnected) return;
    const rect = owner.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { hide(); return; }
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 16) top = rect.top - height - 8;
    top = Math.max(16, top);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const show = (link, delay) => {
    window.clearTimeout(timer);
    window.clearTimeout(dismissTimer);
    if (dismissed === link) return;
    timer = window.setTimeout(() => {
      if (!link.isConnected || link.getClientRects().length === 0) return;
      // Desktop menu cards already expose their description beside the destination.
      const description = link.closest('.exb6-nav') && link.querySelector('.exb6-menu-link-description, .exb6-choice-description');
      if (description?.textContent.trim() && description.getClientRects().length &&
          !['hidden', 'collapse'].includes(window.getComputedStyle(description).visibility)) { hide(); return; }
      const modal = link.closest('dialog[open]');
      (modal || document.body).append(tip);
      owner = link;
      tip.textContent = link.dataset.linkDescription;
      tip.hidden = false;
      place();
    }, delay);
  };
  document.addEventListener('pointerdown', event => { pointerType = event.pointerType; }, {passive:true});
  document.querySelectorAll('a[data-link-description]').forEach(link => {
    link.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      pointerType = 'mouse';
      show(link, 420);
    });
    link.addEventListener('pointerleave', () => {
      window.clearTimeout(timer);
      dismissed = null;
      if (document.activeElement === link) return;
      dismissTimer = window.setTimeout(hide, 170);
    });
    link.addEventListener('focus', () => { if (pointerType !== 'touch') { dismissed = null; show(link, 160); } });
    link.addEventListener('blur', () => { dismissed = null; hide(); });
    link.addEventListener('click', hide);
  });
  tip.addEventListener('pointerenter', () => window.clearTimeout(dismissTimer));
  tip.addEventListener('pointerleave', () => { dismissTimer = window.setTimeout(hide, 170); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') pointerType = 'keyboard';
    if (event.key === 'Escape' && owner) { dismissed = owner; hide(); }
  });
  window.addEventListener('resize', hide, {passive:true});
  window.addEventListener('scroll', place, {passive:true});
})();
