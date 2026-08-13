const $ = (id) => document.getElementById(id);
const els = {
  homeView: $('homeView'), proxyView: $('proxyView'), homeBtn: $('homeBtn'), backHomeBtn: $('backHomeBtn'),
  openProxyHeroBtn: $('openProxyHeroBtn'), moduleSearch: $('moduleSearch'), moduleGrid: $('moduleGrid'),
  homeProxyState: $('homeProxyState'), homeStatusTitle: $('homeStatusTitle'), homeStatusCopy: $('homeStatusCopy'),
  compactBtn: $('compactBtn'), appVersion: $('appVersion'), updateBtn: $('updateBtn'), updateMessage: $('updateMessage'),
  scheme: $('scheme'), port: $('port'), host: $('host'), username: $('username'), password: $('password'),
  userAgent: $('userAgent'), uaPreset: $('uaPreset'), uaPresetHint: $('uaPresetHint'),
  validationUrl: $('validationUrl'), applyBtn: $('applyBtn'), lockBtn: $('lockBtn'), retryBtn: $('retryBtn'), nativeUaBtn: $('nativeUaBtn'),
  deepMode: $('deepMode'), deepFields: $('deepFields'), deepMessage: $('deepMessage'), nativeFingerprintBtn: $('nativeFingerprintBtn'),
  usBundlePreset: $('usBundlePreset'), usBundleHint: $('usBundleHint'), usPresetSummary: $('usPresetSummary'),
  usLocationPreset: $('usLocationPreset'), localePreset: $('localePreset'), timezonePreset: $('timezonePreset'),
  localeTimezoneCustom: $('localeTimezoneCustom'), locale: $('locale'), timezone: $('timezone'),
  platform: $('platform'), hardwareConcurrency: $('hardwareConcurrency'), deviceMemory: $('deviceMemory'),
  devicePreset: $('devicePreset'), screenPreset: $('screenPreset'),
  screenWidth: $('screenWidth'), screenHeight: $('screenHeight'), deviceScaleFactor: $('deviceScaleFactor'), colorDepth: $('colorDepth'),
  maxTouchPoints: $('maxTouchPoints'), colorGamut: $('colorGamut'), colorScheme: $('colorScheme'), reducedMotion: $('reducedMotion'), blockWebGpu: $('blockWebGpu'),
  geolocationEnabled: $('geolocationEnabled'), geolocationFields: $('geolocationFields'), geoPreset: $('geoPreset'),
  latitude: $('latitude'), longitude: $('longitude'), locationAccuracy: $('locationAccuracy'),
  protectCanvas: $('protectCanvas'), protectWebGl: $('protectWebGl'), protectAudio: $('protectAudio'), protectFonts: $('protectFonts'),
  auditBtn: $('auditBtn'), lockdownEnabled: $('lockdownEnabled'), disableNetworkPrediction: $('disableNetworkPrediction'),
  disableTopics: $('disableTopics'), blockThirdPartyCookies: $('blockThirdPartyCookies'), lockdownMessage: $('lockdownMessage'),
  statusText: $('statusText'), statusPill: $('statusPill'), proxyRoute: $('proxyRoute'), statusMessage: $('statusMessage'), healthMessage: $('healthMessage'),
  profileSelect: $('profileSelect'), profileName: $('profileName'), profileCount: $('profileCount'),
  newProfileBtn: $('newProfileBtn'), duplicateProfileBtn: $('duplicateProfileBtn'), deleteProfileBtn: $('deleteProfileBtn'),
  importText: $('importText'), importProfilesBtn: $('importProfilesBtn'), exportProfilesBtn: $('exportProfilesBtn'), profileMessage: $('profileMessage')
};

const presets = globalThis.UsPresets;
let syncingPresets = false;

const dashboard = {
  profiles: [],
  selectedProfileId: null,
  activeProfileId: null,
  health: null,
  fingerprintAudit: null
};
let currentProfileId = null;

init();
restoreCompactState();
renderAppVersion();
bindUpdateButton();
refreshRemoteUpdateState();

async function init() {
  try {
    populatePresetSelects();
    const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (!res?.ok) throw new Error(res?.error || 'Unable to load profile.');
    applyDashboard(res, { fillForm: true });
  } catch (error) {
    renderError(error);
  }
}

els.nativeUaBtn.addEventListener('click', () => {
  els.userAgent.value = navigator.userAgent;
  syncPresetSelects();
});
els.nativeFingerprintBtn.addEventListener('click', useNativeFingerprint);
els.deepMode.addEventListener('change', () => {
  renderDeepFields();
  updateUaHint();
});
els.geolocationEnabled.addEventListener('change', () => {
  renderGeolocationFields();
  syncPresetSelects();
});
els.uaPreset.addEventListener('change', () => applyUserAgentPreset(els.uaPreset.value));
els.userAgent.addEventListener('input', () => syncPresetSelects());
els.usBundlePreset.addEventListener('change', () => applyUsBundle(els.usBundlePreset.value));
els.usLocationPreset.addEventListener('change', () => applyUsLocation(els.usLocationPreset.value));
els.localePreset.addEventListener('change', () => applyLocalePreset(els.localePreset.value));
els.timezonePreset.addEventListener('change', () => applyTimezonePreset(els.timezonePreset.value));
els.locale.addEventListener('input', () => syncPresetSelects());
els.timezone.addEventListener('input', () => syncPresetSelects());
els.platform.addEventListener('change', updateUaHint);
els.devicePreset.addEventListener('change', () => applyDevicePreset(els.devicePreset.value));
els.screenPreset.addEventListener('change', () => applyScreenPreset(els.screenPreset.value));
els.screenWidth.addEventListener('input', () => syncPresetSelects());
els.screenHeight.addEventListener('input', () => syncPresetSelects());
els.deviceScaleFactor.addEventListener('input', () => syncPresetSelects());
els.hardwareConcurrency.addEventListener('input', () => syncPresetSelects());
els.deviceMemory.addEventListener('change', () => syncPresetSelects());
els.colorDepth.addEventListener('change', () => syncPresetSelects());
els.maxTouchPoints.addEventListener('input', () => syncPresetSelects());
els.geoPreset.addEventListener('change', () => applyGeoPreset(els.geoPreset.value));
els.latitude.addEventListener('input', () => syncPresetSelects());
els.longitude.addEventListener('input', () => syncPresetSelects());
els.lockdownEnabled.addEventListener('change', renderLockdownFields);
els.auditBtn.addEventListener('click', openAudit);
els.homeBtn.addEventListener('click', () => showView('home'));
els.backHomeBtn.addEventListener('click', () => showView('home'));
els.openProxyHeroBtn.addEventListener('click', () => showView('proxy'));
els.moduleGrid.addEventListener('click', (event) => {
  const card = event.target.closest('[data-module]');
  if (card?.dataset.module === 'proxy') showView('proxy');
  if (card?.dataset.module === 'audit') openAudit();
});
els.moduleSearch.addEventListener('input', filterModules);
els.compactBtn.addEventListener('click', toggleCompactMode);
els.host.addEventListener('paste', () => { setTimeout(fillCombinedProxyInput, 0); });
els.host.addEventListener('change', fillCombinedProxyInput);
els.retryBtn.addEventListener('click', applyCurrentProfile);
els.lockBtn.addEventListener('click', async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'LOCK_NOW' });
    if (!res?.ok) throw new Error(res?.error || 'Unable to lock traffic.');
    applyDashboard(res, { fillForm: false });
  } catch (error) {
    renderError(error);
  }
});

els.applyBtn.addEventListener('click', applyCurrentProfile);

els.profileSelect.addEventListener('change', async () => {
  try {
    const profileId = els.profileSelect.value || null;
    const res = await chrome.runtime.sendMessage({
      type: profileId ? 'SELECT_PROFILE' : 'NEW_PROFILE',
      profileId
    });
    if (!res?.ok) throw new Error(res?.error || 'Unable to select profile.');
    applyDashboard(res, { fillForm: true });
  } catch (error) {
    renderProfileError(error);
  }
});

els.newProfileBtn.addEventListener('click', async () => {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'NEW_PROFILE' });
    if (!res?.ok) throw new Error(res?.error || 'Unable to create a new profile.');
    applyDashboard(res, { fillForm: false });
    currentProfileId = null;
    clearProfileForm();
    renderProfileManager();
  } catch (error) {
    renderProfileError(error);
  }
});

els.duplicateProfileBtn.addEventListener('click', async () => {
  if (!currentProfileId) return;
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'DUPLICATE_PROFILE',
      profileId: currentProfileId
    });
    if (!res?.ok) throw new Error(res?.error || 'Unable to duplicate profile.');
    applyDashboard(res, { fillForm: true });
    els.profileMessage.textContent = 'Profile duplicated. Apply to activate or save edits.';
  } catch (error) {
    renderProfileError(error);
  }
});

els.deleteProfileBtn.addEventListener('click', async () => {
  if (!currentProfileId) return;
  const selected = dashboard.profiles.find((profile) => profile.id === currentProfileId);
  if (!confirm(`Delete profile “${selected?.name || 'Unnamed profile'}”?`)) return;
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'DELETE_PROFILE',
      profileId: currentProfileId
    });
    if (!res?.ok) throw new Error(res?.error || 'Unable to delete profile.');
    applyDashboard(res, { fillForm: true });
    els.profileMessage.textContent = 'Profile deleted.';
  } catch (error) {
    renderProfileError(error);
  }
});

els.importProfilesBtn.addEventListener('click', async () => {
  const rawImport = els.importText.value.trim();
  const parsedProfiles = [];
  const invalidLines = [];
  if (rawImport.startsWith('[')) {
    try {
      const exportedProfiles = JSON.parse(rawImport);
      if (!Array.isArray(exportedProfiles)) throw new Error('Exported JSON must be an array.');
      exportedProfiles.forEach((profile) => {
        parsedProfiles.push({
          name: profile?.name || `${profile?.proxy?.host || 'Imported'}:${profile?.proxy?.port || ''}`,
          proxy: { ...profile.proxy, password: '' },
          userAgent: profile?.userAgent || els.userAgent.value.trim() || navigator.userAgent,
          fingerprint: profile?.fingerprint || collectFingerprint(),
          privacyLockdown: profile?.privacyLockdown || collectPrivacyLockdown(),
          validationUrl: profile?.validationUrl || ''
        });
      });
    } catch (error) {
      renderProfileError(new Error(`Invalid exported JSON: ${error.message}`));
      return;
    }
  } else {
    const lines = rawImport.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      const parsed = globalThis.ProxyInputParser?.parse(line);
      if (!parsed) {
        invalidLines.push(index + 1);
        return;
      }
      parsedProfiles.push({
        name: `Imported ${index + 1} — ${parsed.host}:${parsed.port}`,
        proxy: { ...parsed, scheme: parsed.scheme || 'http' },
        userAgent: els.userAgent.value.trim() || navigator.userAgent,
        fingerprint: collectFingerprint(),
        privacyLockdown: collectPrivacyLockdown(),
        validationUrl: ''
      });
    });
  }

  if (!parsedProfiles.length) {
    renderProfileError(new Error('No valid proxy lines were found.'));
    return;
  }

  try {
    const res = await chrome.runtime.sendMessage({ type: 'IMPORT_PROFILES', profiles: parsedProfiles });
    if (!res?.ok) throw new Error(res?.error || 'Unable to import profiles.');
    applyDashboard(res, { fillForm: true });
    els.importText.value = '';
    els.profileMessage.textContent = `${res.importedCount} profile(s) imported${invalidLines.length ? `; skipped lines ${invalidLines.join(', ')}` : ''}.`;
  } catch (error) {
    renderProfileError(error);
  }
});

els.exportProfilesBtn.addEventListener('click', () => {
  const exported = dashboard.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    proxy: {
      scheme: profile.proxy.scheme,
      host: profile.proxy.host,
      port: profile.proxy.port,
      username: profile.proxy.username
    },
    userAgent: profile.userAgent,
    fingerprint: profile.fingerprint,
    privacyLockdown: profile.privacyLockdown,
    validationUrl: profile.validationUrl
  }));
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `proxy-guard-profiles-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  els.profileMessage.textContent = `${exported.length} profile(s) exported without passwords.`;
});

async function applyCurrentProfile() {
  setApplying(true);
  try {
    const appState = collect();
    const res = await chrome.runtime.sendMessage({
      type: 'APPLY_PROFILE',
      appState,
      profileId: currentProfileId,
      profileName: els.profileName.value.trim()
    });
    applyDashboard(res, { fillForm: Boolean(res?.ok) });
    if (!res?.ok) throw new Error(res?.error || 'Unable to apply profile.');
    els.profileMessage.textContent = 'Profile applied and saved successfully.';
  } catch (error) {
    renderError(error);
  } finally {
    setApplying(false);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'STATE_UPDATED') render(message.appState);
  if (message?.type === 'HEALTH_UPDATED') {
    dashboard.health = message.health;
    renderHealth(message.health);
  }
});

function collect() {
  return {
    proxy: {
      scheme: els.scheme.value,
      host: els.host.value.trim(),
      port: Number(els.port.value || 0),
      username: els.username.value,
      password: els.password.value
    },
    userAgent: els.userAgent.value.trim(),
    fingerprint: collectFingerprint(),
    privacyLockdown: collectPrivacyLockdown(),
    validationUrl: els.validationUrl.value.trim()
  };
}

function collectFingerprint() {
  return {
    enabled: els.deepMode.checked,
    locale: els.locale.value.trim(),
    timezone: els.timezone.value.trim(),
    platform: els.platform.value,
    hardwareConcurrency: Number(els.hardwareConcurrency.value || 4),
    deviceMemory: Number(els.deviceMemory.value || 8),
    screenWidth: Number(els.screenWidth.value || 1920),
    screenHeight: Number(els.screenHeight.value || 1080),
    deviceScaleFactor: Number(els.deviceScaleFactor.value || 1),
    colorDepth: Number(els.colorDepth.value || 24),
    maxTouchPoints: Number(els.maxTouchPoints.value || 0),
    colorGamut: els.colorGamut.value,
    colorScheme: els.colorScheme.value,
    reducedMotion: els.reducedMotion.checked,
    blockWebGpu: els.blockWebGpu.checked,
    geolocationEnabled: els.geolocationEnabled.checked,
    latitude: Number(els.latitude.value || 0),
    longitude: Number(els.longitude.value || 0),
    locationAccuracy: Number(els.locationAccuracy.value || 100),
    protectCanvas: els.protectCanvas.checked,
    protectWebGl: els.protectWebGl.checked,
    protectAudio: els.protectAudio.checked,
    protectFonts: els.protectFonts.checked
  };
}

function collectPrivacyLockdown() {
  return {
    enabled: els.lockdownEnabled.checked,
    disableNetworkPrediction: els.disableNetworkPrediction.checked,
    disableTopics: els.disableTopics.checked,
    blockThirdPartyCookies: els.blockThirdPartyCookies.checked
  };
}

function fillCombinedProxyInput() {
  const parsed = globalThis.ProxyInputParser?.parse(els.host.value);
  if (!parsed) return false;

  if (parsed.scheme) els.scheme.value = parsed.scheme;
  els.host.value = parsed.host;
  els.port.value = String(parsed.port);
  els.username.value = parsed.username;
  els.password.value = parsed.password;
  return true;
}

function fill(s) {
  els.scheme.value = s?.proxy?.scheme || 'http';
  els.host.value = s?.proxy?.host || '';
  els.port.value = s?.proxy?.port || '';
  els.username.value = s?.proxy?.username || '';
  els.password.value = s?.proxy?.password || '';
  els.userAgent.value = s?.userAgent || navigator.userAgent;
  fillFingerprint(s?.fingerprint);
  fillPrivacyLockdown(s?.privacyLockdown);
  els.validationUrl.value = s?.validationUrl || '';
}

function fillPrivacyLockdown(settings = {}) {
  els.lockdownEnabled.checked = Boolean(settings?.enabled);
  els.disableNetworkPrediction.checked = settings?.disableNetworkPrediction !== false;
  els.disableTopics.checked = settings?.disableTopics !== false;
  els.blockThirdPartyCookies.checked = settings?.blockThirdPartyCookies !== false;
  renderLockdownFields();
}

function fillFingerprint(fingerprint = {}) {
  const native = nativeFingerprintValues();
  els.deepMode.checked = Boolean(fingerprint?.enabled);
  els.locale.value = fingerprint?.locale || native.locale;
  els.timezone.value = fingerprint?.timezone || native.timezone;
  els.platform.value = fingerprint?.platform || native.platform;
  els.hardwareConcurrency.value = String(fingerprint?.hardwareConcurrency || native.hardwareConcurrency);
  els.deviceMemory.value = String(fingerprint?.deviceMemory || native.deviceMemory);
  els.screenWidth.value = String(fingerprint?.screenWidth || native.screenWidth);
  els.screenHeight.value = String(fingerprint?.screenHeight || native.screenHeight);
  els.deviceScaleFactor.value = String(fingerprint?.deviceScaleFactor || native.deviceScaleFactor);
  els.colorDepth.value = String(fingerprint?.colorDepth || native.colorDepth);
  els.maxTouchPoints.value = String(fingerprint?.maxTouchPoints ?? native.maxTouchPoints);
  els.colorGamut.value = fingerprint?.colorGamut || 'srgb';
  els.colorScheme.value = fingerprint?.colorScheme || 'light';
  els.reducedMotion.checked = Boolean(fingerprint?.reducedMotion);
  els.blockWebGpu.checked = fingerprint?.blockWebGpu !== false;
  els.geolocationEnabled.checked = Boolean(fingerprint?.geolocationEnabled);
  els.latitude.value = String(fingerprint?.latitude || 0);
  els.longitude.value = String(fingerprint?.longitude || 0);
  els.locationAccuracy.value = String(fingerprint?.locationAccuracy || 100);
  els.protectCanvas.checked = fingerprint?.protectCanvas !== false;
  els.protectWebGl.checked = fingerprint?.protectWebGl !== false;
  els.protectAudio.checked = fingerprint?.protectAudio !== false;
  els.protectFonts.checked = fingerprint?.protectFonts !== false;
  renderGeolocationFields();
  renderDeepFields();
  syncPresetSelects();
}

function nativeFingerprintValues() {
  const platformText = `${navigator.userAgent} ${navigator.platform}`;
  const platform = /Mac/i.test(platformText) ? 'macOS' : (/Linux/i.test(platformText) ? 'Linux' : 'Windows');
  const memory = [1, 2, 4, 8].includes(Number(navigator.deviceMemory)) ? Number(navigator.deviceMemory) : 8;
  const depth = [16, 24, 30, 32].includes(Number(screen.colorDepth)) ? Number(screen.colorDepth) : 24;
  return {
    locale: navigator.language || 'en-US',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    platform,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemory: memory,
    screenWidth: screen.width || 1920,
    screenHeight: screen.height || 1080,
    deviceScaleFactor: window.devicePixelRatio || 1,
    colorDepth: depth
    ,maxTouchPoints: navigator.maxTouchPoints || 0
  };
}

function useNativeFingerprint() {
  const enabled = els.deepMode.checked;
  fillFingerprint({ ...nativeFingerprintValues(), enabled });
}

function renderDeepFields() {
  els.deepFields.hidden = !els.deepMode.checked;
  els.deepMessage.textContent = els.deepMode.checked
    ? 'Deep mode will attach Chrome Debugger to supported HTTP(S) tabs and reapply these values after navigation.'
    : 'Deep mode is disabled for this profile.';
  updateUaHint();
  renderUsSummary();
}

function renderGeolocationFields() {
  els.geolocationFields.hidden = !els.geolocationEnabled.checked;
}

function renderLockdownFields() {
  const enabled = els.lockdownEnabled.checked;
  [els.disableNetworkPrediction, els.disableTopics, els.blockThirdPartyCookies]
    .forEach((input) => { input.disabled = !enabled; });
  els.lockdownMessage.textContent = enabled
    ? 'Privacy Lockdown will be verified before traffic is unlocked.'
    : 'Privacy Lockdown is disabled for this profile.';
}

async function openAudit() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_LOCAL_AUDIT' });
    if (!response?.ok) throw new Error(response?.error || 'Unable to open local audit.');
  } catch (error) {
    renderError(error);
  }
}

function showView(view) {
  const proxy = view === 'proxy';
  els.homeView.hidden = proxy;
  els.proxyView.hidden = !proxy;
  document.body.dataset.view = proxy ? 'proxy' : 'home';
  if (!proxy) els.moduleSearch.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: 'smooth' });
}

function restoreCompactState() {
  const compact = localStorage.getItem('1roadtrip.sidebar.compact') === 'true';
  document.body.classList.toggle('compact', compact);
  updateCompactButton(compact);
}

function toggleCompactMode() {
  const compact = !document.body.classList.contains('compact');
  document.body.classList.toggle('compact', compact);
  localStorage.setItem('1roadtrip.sidebar.compact', String(compact));
  updateCompactButton(compact);
}

function updateCompactButton(compact) {
  els.compactBtn.textContent = compact ? '+' : '−';
  els.compactBtn.title = compact ? 'Mở rộng sidebar' : 'Thu nhỏ sidebar';
  els.compactBtn.setAttribute('aria-label', compact ? 'Mở rộng sidebar' : 'Thu nhỏ sidebar');
  els.compactBtn.setAttribute('aria-expanded', String(!compact));
}

function filterModules() {
  const query = els.moduleSearch.value.trim().toLowerCase();
  const cards = [...els.moduleGrid.querySelectorAll('.module-card')];
  cards.forEach((card) => {
    card.classList.toggle('filtered-out', Boolean(query) && !card.dataset.search.includes(query));
  });
}

function clearProfileForm() {
  fill({
    proxy: { scheme: 'http', host: '', port: 0, username: '', password: '' },
    userAgent: navigator.userAgent,
    fingerprint: { ...nativeFingerprintValues(), enabled: false },
    privacyLockdown: { enabled: false, disableNetworkPrediction: true, disableTopics: true, blockThirdPartyCookies: true },
    validationUrl: ''
  });
  els.profileName.value = '';
}

function render(s = {}) {
  const active = s.status === 'active';
  document.body.classList.toggle('active', active);
  els.statusText.textContent = active ? 'Configured' : 'Locked';
  els.statusPill.textContent = active ? 'ACTIVE' : 'LOCKED';
  els.proxyRoute.textContent = active && s?.proxy?.host
    ? `${s.proxy.scheme}://${s.proxy.host}:${s.proxy.port}`
    : '—';
  els.statusMessage.textContent = active
    ? (s.validationMode === 'endpoint'
      ? 'Proxy connectivity passed using your validation URL. WebRTC leak protection is active.'
      : 'Proxy settings were confirmed locally. No external validation service was contacted.')
    : (s.lastError || 'Web traffic stays blocked until the profile is applied locally.');
  if (s?.fingerprint) {
    els.deepMessage.textContent = s.fingerprint.enabled
      ? (active ? 'Deep mode is active for supported HTTP(S) tabs.' : 'Deep mode is configured but inactive while traffic is locked.')
      : 'Deep mode is disabled for this profile.';
  }
  els.homeProxyState.textContent = active ? 'ACTIVE' : 'LOCKED';
  els.homeProxyState.classList.toggle('active', active);
  els.homeStatusTitle.textContent = active ? 'Traffic protected' : 'Traffic locked';
  els.homeStatusCopy.textContent = active && s?.proxy?.host
    ? `${s.proxy.host}:${s.proxy.port} is the active department route.`
    : 'Open Proxy Guard to configure an approved connection profile.';
}

function setApplying(applying) {
  els.applyBtn.disabled = applying;
  els.applyBtn.querySelector('span').textContent = applying ? 'Applying…' : 'Apply & Save Profile';
}

function renderError(error) {
  els.statusMessage.textContent = error instanceof Error ? error.message : String(error || 'Unexpected error.');
}

function applyDashboard(data = {}, options = {}) {
  if (Array.isArray(data.profiles)) dashboard.profiles = data.profiles;
  if (Object.prototype.hasOwnProperty.call(data, 'selectedProfileId')) dashboard.selectedProfileId = data.selectedProfileId;
  if (Object.prototype.hasOwnProperty.call(data, 'activeProfileId')) dashboard.activeProfileId = data.activeProfileId;
  if (data.health) dashboard.health = data.health;
  if (data.fingerprintAudit) dashboard.fingerprintAudit = data.fingerprintAudit;

  currentProfileId = dashboard.selectedProfileId || null;
  renderProfileManager();
  if (options.fillForm) {
    const selected = dashboard.profiles.find((profile) => profile.id === currentProfileId);
    if (selected) {
      fill(selected);
      els.profileName.value = selected.name;
    } else if (data.appState) {
      fill(data.appState);
      els.profileName.value = '';
    }
  }
  if (data.appState) render(data.appState);
  renderHealth(dashboard.health);
  renderFingerprintAudit(data.appState);
}

function renderFingerprintAudit(appState = {}) {
  const audit = dashboard.fingerprintAudit;
  if (!appState?.fingerprint?.enabled || !audit?.enabled) return;
  if (audit.warnings?.length) {
    els.deepMessage.textContent = `Fingerprint warning: ${audit.warnings.join(' ')}`;
  } else if (appState.status === 'active' && audit.consistent) {
    els.deepMessage.textContent = 'Fingerprint audit passed: UA, Client Hints, locale, timezone, platform and device values were applied.';
  }
}

function renderProfileManager() {
  els.profileSelect.replaceChildren();
  const newOption = document.createElement('option');
  newOption.value = '';
  newOption.textContent = 'New unsaved profile';
  els.profileSelect.append(newOption);
  dashboard.profiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    const marks = [];
    if (profile.bundled) marks.push('GIT');
    if (profile.id === dashboard.activeProfileId) marks.push('ACTIVE');
    option.textContent = marks.length ? `${profile.name} • ${marks.join(' · ')}` : profile.name;
    els.profileSelect.append(option);
  });
  els.profileSelect.value = currentProfileId || '';
  els.profileCount.textContent = `${dashboard.profiles.length} saved`;
  els.duplicateProfileBtn.disabled = !currentProfileId;
  els.deleteProfileBtn.disabled = !currentProfileId;
}

function renderHealth(health = {}) {
  const errors = Number(health?.consecutiveErrors || 0);
  if (!health?.lastErrorAt) {
    els.healthMessage.textContent = 'Proxy health: no runtime errors reported.';
    return;
  }
  const checkedAt = new Date(health.lastErrorAt).toLocaleTimeString();
  els.healthMessage.textContent = `Proxy health: ${errors}/3 consecutive errors — ${health.lastError} (${checkedAt})`;
}

function renderUpdateNotice(message) {
  if (els.updateMessage) {
    els.updateMessage.hidden = !message;
    els.updateMessage.textContent = message || '';
  }
  if (els.statusMessage) els.statusMessage.textContent = message;
  if (els.homeStatusCopy) els.homeStatusCopy.textContent = message;
}

function renderAppVersion() {
  const version = chrome.runtime.getManifest?.()?.version;
  if (!els.appVersion || !version) return;
  els.appVersion.textContent = `v${version}`;
  els.appVersion.title = `1Roadtrip Extension ${version}`;
}

function installedVersion() {
  return chrome.runtime.getManifest?.()?.version || '';
}

function bindUpdateButton() {
  if (!els.updateBtn) return;
  els.updateBtn.addEventListener('click', openUnpackedUpdatePage);
}

function openUnpackedUpdatePage() {
  const url = chrome.runtime.getURL('update.html');
  window.open(url, '1roadtrip-update');
}

async function refreshRemoteUpdateState() {
  if (!els.updateBtn || !globalThis.UpdateClient) return;
  try {
    const latest = await globalThis.UpdateClient.fetchLatest();
    const comparison = globalThis.UpdateClient.compareVersions(latest.version, installedVersion());
    els.updateBtn.dataset.remoteVersion = latest.version;
    if (comparison > 0) {
      els.updateBtn.textContent = `Update v${latest.version}`;
      els.updateBtn.classList.add('available');
      els.updateBtn.title = `Có bản ${latest.version} trên GitHub. Bấm để ghi đè thư mục Load unpacked, rồi Reload trên chrome://extensions.`;
    } else {
      els.updateBtn.textContent = 'Update';
      els.updateBtn.classList.remove('available');
      els.updateBtn.title = `Đang là bản ${installedVersion() || latest.version}. Bấm để kiểm tra và đồng bộ lại từ GitHub.`;
    }
  } catch (error) {
    els.updateBtn.title = 'Không kiểm tra được GitHub. Bấm Update để mở trang cập nhật và xem lỗi.';
    renderUpdateNotice(error instanceof Error ? error.message : 'Không đọc được GitHub. Reload extension bản 0.7.1 rồi thử lại.');
  }
}

function renderProfileError(error) {
  els.profileMessage.textContent = error instanceof Error ? error.message : String(error || 'Profile operation failed.');
}

function populatePresetSelects() {
  if (!presets) return;
  setSelectOptions(els.uaPreset, presets.userAgentGroups(nativePlatformName()));
  setSelectOptions(els.usBundlePreset, presets.bundleOptions());
  setSelectOptions(els.usLocationPreset, presets.locationGroups());
  setSelectOptions(els.localePreset, presets.localeOptions());
  setSelectOptions(els.timezonePreset, presets.timezoneOptions());
  setSelectOptions(els.devicePreset, presets.deviceOptions());
  setSelectOptions(els.screenPreset, presets.screenOptions());
  setSelectOptions(els.geoPreset, presets.cityGroups());
}

function setSelectOptions(select, items) {
  if (!select) return;
  select.replaceChildren();
  items.forEach((item) => {
    if (item.options) {
      const group = document.createElement('optgroup');
      group.label = item.label;
      item.options.forEach((option) => group.append(createOption(option.value, option.label)));
      select.append(group);
      return;
    }
    select.append(createOption(item.value, item.label));
  });
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function nativePlatformName() {
  return presets?.detectNativePlatform(navigator.userAgent, navigator.platform) || 'Windows';
}

function installedChromeVersion() {
  return presets?.chromeVersionFromUserAgent(navigator.userAgent) || '';
}

function applyUserAgentPreset(presetId) {
  if (!presets || presetId === 'custom') {
    syncPresetSelects();
    return;
  }
  const preset = presets.find(presets.userAgents, presetId);
  const userAgent = preset ? presets.buildUserAgent(preset.platform, installedChromeVersion()) : '';
  if (!userAgent) {
    els.uaPresetHint.textContent = 'Unable to build a US User-Agent because this browser has no Chrome version.';
    return;
  }
  withPresetSync(() => {
    els.userAgent.value = userAgent;
    if (preset.platform) els.platform.value = preset.platform;
  });
}

function applyUsBundle(bundleId) {
  if (!presets || bundleId === 'custom') {
    syncPresetSelects();
    return;
  }
  const bundle = presets.find(presets.bundles, bundleId);
  if (!bundle) return;
  const nativePlatform = nativePlatformName();
  const uaPreset = presets.userAgents.find((item) => item.platform === nativePlatform);
  withPresetSync(() => {
    if (uaPreset) {
      const userAgent = presets.buildUserAgent(uaPreset.platform, installedChromeVersion());
      if (userAgent) {
        els.userAgent.value = userAgent;
        els.uaPreset.value = uaPreset.id;
      }
    }
    els.platform.value = nativePlatform;
    applyUsLocation(bundle.locationId, { silent: true });
    applyDevicePreset(bundle.deviceId, { silent: true });
    els.usBundlePreset.value = bundle.id;
  });
}

function applyUsLocation(locationId, options = {}) {
  if (!presets || locationId === 'custom') {
    if (!options.silent) syncPresetSelects();
    return;
  }
  const location = presets.find(presets.locations, locationId);
  if (!location) return;
  const apply = () => {
    els.locale.value = location.locale;
    els.timezone.value = location.timezone;
    els.localePreset.value = presets.matchLocale(location.locale);
    els.timezonePreset.value = presets.matchTimezone(location.timezone);
    if (location.kind === 'city') {
      els.latitude.value = String(location.latitude);
      els.longitude.value = String(location.longitude);
      els.locationAccuracy.value = String(location.locationAccuracy || 100);
      if (els.geoPreset) els.geoPreset.value = location.id;
    } else if (presets.matchCity({
      latitude: Number(els.latitude.value || 0),
      longitude: Number(els.longitude.value || 0)
    }) !== 'custom') {
      els.latitude.value = '0';
      els.longitude.value = '0';
      if (els.geoPreset) els.geoPreset.value = 'custom';
    }
    els.usLocationPreset.value = location.id;
    renderLocaleTimezoneCustom();
  };
  if (options.silent) apply();
  else withPresetSync(apply);
}

function applyLocalePreset(value) {
  withPresetSync(() => {
    if (value !== 'custom') els.locale.value = value;
    renderLocaleTimezoneCustom();
    if (value === 'custom') els.locale.focus();
  });
}

function applyTimezonePreset(value) {
  withPresetSync(() => {
    if (value !== 'custom') els.timezone.value = value;
    renderLocaleTimezoneCustom();
    if (value === 'custom') els.timezone.focus();
  });
}

function applyDevicePreset(deviceId, options = {}) {
  if (!presets || deviceId === 'custom') {
    if (!options.silent) syncPresetSelects();
    return;
  }
  const device = presets.find(presets.devices, deviceId);
  if (!device) return;
  const apply = () => {
    els.hardwareConcurrency.value = String(device.hardwareConcurrency);
    els.deviceMemory.value = String(device.deviceMemory);
    els.screenWidth.value = String(device.screenWidth);
    els.screenHeight.value = String(device.screenHeight);
    els.deviceScaleFactor.value = String(device.deviceScaleFactor);
    els.colorDepth.value = String(device.colorDepth);
    els.maxTouchPoints.value = String(device.maxTouchPoints);
    els.devicePreset.value = device.id;
    els.screenPreset.value = device.screenId;
  };
  if (options.silent) apply();
  else withPresetSync(apply);
}

function applyScreenPreset(screenId) {
  if (!presets || screenId === 'custom') {
    syncPresetSelects();
    return;
  }
  const screen = presets.find(presets.screens, screenId);
  if (!screen) return;
  withPresetSync(() => {
    els.screenWidth.value = String(screen.width);
    els.screenHeight.value = String(screen.height);
    els.deviceScaleFactor.value = String(screen.scale);
    els.screenPreset.value = screen.id;
  });
}

function applyGeoPreset(cityId) {
  if (!presets || cityId === 'custom') {
    syncPresetSelects();
    return;
  }
  const city = presets.find(presets.locations, cityId);
  if (!city || city.kind !== 'city') return;
  withPresetSync(() => {
    els.latitude.value = String(city.latitude);
    els.longitude.value = String(city.longitude);
    els.locationAccuracy.value = String(city.locationAccuracy || 100);
    els.locale.value = city.locale;
    els.timezone.value = city.timezone;
    els.geoPreset.value = city.id;
    els.usLocationPreset.value = city.id;
    els.localePreset.value = presets.matchLocale(city.locale);
    els.timezonePreset.value = presets.matchTimezone(city.timezone);
    renderLocaleTimezoneCustom();
  });
}

function withPresetSync(mutate) {
  syncingPresets = true;
  try {
    mutate();
  } finally {
    syncingPresets = false;
  }
  syncPresetSelects();
}

function syncPresetSelects() {
  if (!presets || syncingPresets) return;
  const chromeVersion = installedChromeVersion();
  const locationId = presets.matchLocation({
    locale: els.locale.value.trim(),
    timezone: els.timezone.value.trim(),
    latitude: Number(els.latitude.value || 0),
    longitude: Number(els.longitude.value || 0),
    geolocationEnabled: els.geolocationEnabled.checked
  });
  const deviceId = presets.matchDevice({
    hardwareConcurrency: Number(els.hardwareConcurrency.value || 0),
    deviceMemory: Number(els.deviceMemory.value || 0),
    screenWidth: Number(els.screenWidth.value || 0),
    screenHeight: Number(els.screenHeight.value || 0),
    deviceScaleFactor: Number(els.deviceScaleFactor.value || 0),
    colorDepth: Number(els.colorDepth.value || 24),
    maxTouchPoints: Number(els.maxTouchPoints.value || 0)
  });

  els.uaPreset.value = presets.matchUserAgentPreset(els.userAgent.value.trim(), chromeVersion);
  els.localePreset.value = presets.matchLocale(els.locale.value.trim());
  els.timezonePreset.value = presets.matchTimezone(els.timezone.value.trim());
  els.usLocationPreset.value = locationId;
  els.devicePreset.value = deviceId;
  els.screenPreset.value = presets.matchScreen({
    width: Number(els.screenWidth.value || 0),
    height: Number(els.screenHeight.value || 0),
    scale: Number(els.deviceScaleFactor.value || 0)
  });
  if (els.geoPreset) {
    els.geoPreset.value = presets.matchCity({
      latitude: Number(els.latitude.value || 0),
      longitude: Number(els.longitude.value || 0)
    });
  }
  els.usBundlePreset.value = presets.matchBundle({ locationId, deviceId });
  renderLocaleTimezoneCustom();
  updateUaHint();
  renderUsSummary();
}

function renderLocaleTimezoneCustom() {
  const custom = els.localePreset.value === 'custom' || els.timezonePreset.value === 'custom';
  els.localeTimezoneCustom.hidden = !custom;
}

function updateUaHint() {
  const defaultHint = 'Without Deep mode this changes only the request header. Deep mode also synchronizes JavaScript and Client Hints.';
  if (!presets) {
    els.uaPresetHint.textContent = defaultHint;
    return;
  }
  const uaPlatform = presets.detectPlatformFromUserAgent(els.userAgent.value);
  const nativePlatform = nativePlatformName();
  const selectedPlatform = els.platform.value;
  if (els.deepMode.checked && uaPlatform && uaPlatform !== selectedPlatform) {
    els.uaPresetHint.textContent = `Deep mode requires this User-Agent to match the selected ${selectedPlatform} platform.`;
    return;
  }
  if (els.deepMode.checked && selectedPlatform !== nativePlatform) {
    els.uaPresetHint.textContent = `Deep mode will reject platform ${selectedPlatform} because this device is ${nativePlatform}.`;
    return;
  }
  if (els.uaPreset.value !== 'custom') {
    const preset = presets.find(presets.userAgents, els.uaPreset.value);
    els.uaPresetHint.textContent = preset
      ? `Using a ready-made US ${preset.platform} Chrome User-Agent with this browser's Chrome version.`
      : defaultHint;
    return;
  }
  els.uaPresetHint.textContent = defaultHint;
}

function renderUsSummary() {
  if (!els.usPresetSummary || !presets) return;
  if (!els.deepMode.checked) {
    els.usPresetSummary.hidden = true;
    return;
  }
  const location = presets.find(presets.locations, els.usLocationPreset.value);
  const device = presets.find(presets.devices, els.devicePreset.value);
  const parts = [
    location ? location.label : `${els.locale.value.trim() || 'locale'} / ${els.timezone.value.trim() || 'timezone'}`,
    device ? device.label : `${els.screenWidth.value || '?'}×${els.screenHeight.value || '?'}`,
    els.platform.value
  ];
  els.usPresetSummary.innerHTML = `<b>Current US profile</b><br>${presets.summarize(parts)}`;
  els.usPresetSummary.hidden = false;
  els.usBundleHint.textContent = location
    ? `Location fields follow ${location.label}. Coordinates are ready if geolocation is enabled.`
    : 'Pick a US city + device to fill locale, timezone, screen, and a matching User-Agent.';
}
