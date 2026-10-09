(() => {
  'use strict';
  // Keep the root compatible with script-src 'self', without storage or tracking.
  const destinations = {
    de: document.currentScript?.dataset.localeDe,
    en: document.currentScript?.dataset.localeEn
  };
  if (!/^de\/(?:index\.html)?$/.test(destinations.de || '') ||
      !/^en\/(?:index\.html)?$/.test(destinations.en || '')) {
    throw new Error('Root language destinations are missing or invalid.');
  }
  const preferences = [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language];
  const locale = preferences.find(tag => typeof tag === 'string' && /^(?:de|en)(?:-[a-z0-9]{1,8})*$/i.test(tag));
  const language = locale ? locale.toLowerCase().split('-')[0] : 'en';
  window.location.replace(destinations[language] + window.location.search + window.location.hash);
})();
