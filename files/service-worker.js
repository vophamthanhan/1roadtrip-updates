const GLOBAL_ALLOW_RULE = 1001;
const UA_RULE = 1002;
const VALIDATION_ALLOW_RULE = 1003;
const UPDATE_ALLOW_RULE = 1004;
const WEBRTC_POLICY = 'disable_non_proxied_udp';
const VALIDATION_TIMEOUT_MS = 10000;
const MAX_AUTH_ATTEMPTS = 1;
const PROXY_ERROR_THRESHOLD = 3;
const DEBUGGER_PROTOCOL_VERSION = '1.3';
const DEEP_TAB_SCHEMES = /^(https?):\/\//i;

const defaultFingerprint = {
  enabled: false,
  locale: 'en-US',
  timezone: 'UTC',
  platform: 'Windows',
  hardwareConcurrency: 4,
  deviceMemory: 8,
  screenWidth: 1920,
  screenHeight: 1080,
  deviceScaleFactor: 1,
  colorDepth: 24,
  maxTouchPoints: 0,
  colorGamut: 'srgb',
  colorScheme: 'light',
  reducedMotion: false,
  blockWebGpu: true,
  geolocationEnabled: false,
  latitude: 0,
  longitude: 0,
  locationAccuracy: 100,
  profileSecret: '',
  protectCanvas: true,
  protectWebGl: true,
  protectAudio: true,
  protectFonts: true
};

const defaultPrivacyLockdown = {
  enabled: false,
  disableNetworkPrediction: true,
  disableTopics: true,
  blockThirdPartyCookies: true
};

const defaultState = {
  proxy: { scheme: 'http', host: '', port: 0, username: '' },
  userAgent: '',
  fingerprint: { ...defaultFingerprint },
  privacyLockdown: { ...defaultPrivacyLockdown },
  validationUrl: '',
  validationMode: 'local',
  status: 'locked',
  lastError: '',
  lastAppliedAt: null
};

const defaultProxyHealth = {
  consecutiveErrors: 0,
  lastError: '',
  lastErrorAt: null,
  lockedAt: null
};

let operationEpoch = 0;
let activeOperation = null;
let activeValidationController = null;
let proxyMutationQueue = Promise.resolve();
let ruleMutationQueue = Promise.resolve();
let stateMutationQueue = Promise.resolve();
let credentialMutationQueue = Promise.resolve();
let profileMutationQueue = Promise.resolve();
let healthMutationQueue = Promise.resolve();
let healthCache = null;
const authAttempts = new Map();
const attachedDeepTabs = new Set();
const expectedDebuggerDetaches = new Set();
const deepTabQueue = new Map();
const deepScriptIds = new Map();
const deepTargetTypes = new Map();
const configuredDeepTargets = new Set();
const configuredDeepContexts = new Set();
let publishedUpdatePending = false;

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const initialization = await initializeStorage(details.reason === 'install');
    const reason = initialization.freshInstall
      ? 'Extension installed. Configure proxy and User-Agent.'
      : 'Extension loaded or updated. Revalidating the saved profile…';
    await lockTraffic(reason);
    await ensureWebRtcProtection();
    if (!initialization.freshInstall) {
      await applySavedProfileIfComplete(initialization.appState, initialization.activeProfileId);
    }
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await requestPublishedUpdate();
  } catch (error) {
    await recordBackgroundError(`Initialization failed: ${error.message}`);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await initializeStorage(false);
    const [{ activeProfileId = null }, appState] = await Promise.all([
      chrome.storage.local.get('activeProfileId'),
      readLocalState()
    ]);
    await lockTraffic('Confirming saved profile…');
    await ensureWebRtcProtection();

    await applySavedProfileIfComplete(appState, activeProfileId);
    await requestPublishedUpdate();
  } catch (error) {
    await recordBackgroundError(`Startup failed: ${error.message}`);
  }
});

chrome.runtime.onUpdateAvailable?.addListener(() => {
  if (activeOperation) {
    publishedUpdatePending = true;
    return;
  }
  reloadForPublishedUpdate();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_STATE') {
    respondWith(getDashboardState().then((dashboard) => ({ ok: true, ...dashboard })), sendResponse);
    return true;
  }

  if (message?.type === 'APPLY_PROFILE') {
    respondWith(
      applyProfile(message.appState, false, {
        profileId: message.profileId || null,
        profileName: message.profileName || ''
      }),
      sendResponse
    );
    return true;
  }

  if (message?.type === 'SELECT_PROFILE') {
    respondWith(selectProfile(message.profileId), sendResponse);
    return true;
  }

  if (message?.type === 'NEW_PROFILE') {
    respondWith(selectProfile(null), sendResponse);
    return true;
  }

  if (message?.type === 'DUPLICATE_PROFILE') {
    respondWith(duplicateProfile(message.profileId), sendResponse);
    return true;
  }

  if (message?.type === 'DELETE_PROFILE') {
    respondWith(deleteProfile(message.profileId), sendResponse);
    return true;
  }

  if (message?.type === 'IMPORT_PROFILES') {
    respondWith(importProfiles(message.profiles), sendResponse);
    return true;
  }

  if (message?.type === 'OPEN_LOCAL_AUDIT') {
    respondWith(openLocalAudit(), sendResponse);
    return true;
  }

  if (message?.type === 'RUN_LOCAL_AUDIT') {
    respondWith(runLocalAudit(Number(message.tabId)), sendResponse);
    return true;
  }

  if (message?.type === 'LOCK_NOW') {
    respondWith(
      lockTraffic('Locked manually.')
        .then(async () => ({ ok: true, appState: await getStateForUi() })),
      sendResponse
    );
    return true;
  }
});

chrome.webRequest.onAuthRequired.addListener(
  async (details, callback) => {
    try {
      if (!details.isProxy) return callback({});

      const profile = await getProfileForProxyAuth();
      if (!profile || !proxyChallengeMatches(details.challenger, profile.proxy)) {
        return callback({ cancel: true });
      }

      const attempts = authAttempts.get(details.requestId) || 0;
      if (attempts >= MAX_AUTH_ATTEMPTS) {
        authAttempts.delete(details.requestId);
        return callback({ cancel: true });
      }

      if (!profile.proxy.username) return callback({});
      authAttempts.set(details.requestId, attempts + 1);
      callback({
        authCredentials: {
          username: profile.proxy.username,
          password: profile.proxy.password || ''
        }
      });
    } catch {
      callback({ cancel: true });
    }
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

chrome.webRequest.onCompleted.addListener(handleRequestCompleted, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(clearAuthAttempt, { urls: ['<all_urls>'] });

chrome.proxy.onProxyError.addListener((details) => {
  recordProxyError(details).catch(() => {});
});

chrome.proxy.settings.onChange.addListener((details) => {
  handleProxySettingsChange(details).catch(() => {});
});

chrome.privacy.network.webRTCIPHandlingPolicy.onChange.addListener((details) => {
  handleWebRtcPolicyChange(details).catch(() => {});
});

for (const setting of [
  chrome.privacy.network.networkPredictionEnabled,
  chrome.privacy.websites?.topicsEnabled,
  chrome.privacy.websites?.thirdPartyCookiesAllowed
]) {
  setting?.onChange?.addListener((details) => {
    handlePrivacySettingChange(details).catch(() => {});
  });
}

chrome.tabs.onCreated.addListener((tab) => {
  applyDeepModeToNewTab(tab, { initialAttach: true }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    applyDeepModeToNewTab({ ...tab, id: tabId }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedDeepTabs.delete(tabId);
  expectedDebuggerDetaches.delete(tabId);
  deepTabQueue.delete(tabId);
  deepScriptIds.delete(tabId);
  configuredDeepTargets.delete(`tab:${tabId}`);
  for (const key of [...configuredDeepContexts]) {
    if (key.startsWith(`tab:${tabId}:`)) configuredDeepContexts.delete(key);
  }
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  attachedDeepTabs.delete(removedTabId);
  deepScriptIds.delete(removedTabId);
  applyDeepModeToNewTab({ id: addedTabId }, { initialAttach: true }).catch(() => {});
});

chrome.debugger.onDetach.addListener((source, reason) => {
  handleDebuggerDetach(source, reason).catch(() => {});
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  handleDebuggerEvent(source, method, params).catch(() => {});
});

async function applyProfile(input, isStartup, profileMeta = {}) {
  const token = beginOperation();
  const clean = normalizeProfile(input);
  clean.fingerprint.profileSecret = await resolveProfileSecret(clean, profileMeta);
  const previousState = await readLocalState();
  assertCurrentOperation(token);
  await lockTraffic('Applying profile…', clean, { cancelPending: false, token });

  try {
    validateProfile(clean);
    await validateNativeConsistency(clean);
    activeOperation = { token, profile: clean };
    await ensureWebRtcProtection();
    assertCurrentOperation(token);

    await ensurePrivacyLockdown(clean.privacyLockdown);
    assertCurrentOperation(token);

    await applyProxy(clean.proxy, token);
    assertCurrentOperation(token);
    await confirmAppliedProxy(clean.proxy);
    assertCurrentOperation(token);

    await installUaRule(clean.userAgent, token);
    assertCurrentOperation(token);

    await applyDeepMode(clean, token);
    assertCurrentOperation(token);

    if (clean.validationUrl) {
      await validateConnectivity(clean.validationUrl, token);
      assertCurrentOperation(token);
    }

    // Close the tab-creation race while traffic was locked during validation.
    await applyDeepMode(clean, token);
    assertCurrentOperation(token);

    await installGlobalAllowRule(token);
    assertCurrentOperation(token);

    const active = toStoredState({
      ...clean,
      validationMode: clean.validationUrl ? 'endpoint' : 'local',
      status: 'active',
      lastError: '',
      lastAppliedAt: Date.now()
    });
    await writeLocalState(active, token);
    assertCurrentOperation(token);

    await savePersistentCredential(clean.proxy, token);
    assertCurrentOperation(token);

    const profileId = isStartup
      ? profileMeta.profileId
      : await upsertAppliedProfile(clean, profileMeta, token);
    assertCurrentOperation(token);

    const health = await resetProxyHealth();

    activeOperation = null;
    if (publishedUpdatePending) {
      reloadForPublishedUpdate();
      return {
        ok: true,
        ...(await getDashboardState(active)),
        activeProfileId: profileId || profileMeta.profileId || null,
        health,
        startup: isStartup
      };
    }
    broadcastState(active);
    return {
      ok: true,
      ...(await getDashboardState(active)),
      activeProfileId: profileId || profileMeta.profileId || null,
      health,
      startup: isStartup
    };
  } catch (error) {
    if (!isCurrentOperation(token)) {
      return { ok: false, cancelled: true, error: 'Profile application was cancelled by a newer operation.' };
    }

    await removeSessionRules([GLOBAL_ALLOW_RULE, UA_RULE, VALIDATION_ALLOW_RULE]);
    await detachAllDeepTabs();
    const failed = toStoredState({
      ...previousState,
      status: 'locked',
      lastError: `Could not apply profile: ${formatError(error)}`,
      lastAppliedAt: previousState.lastAppliedAt
    });
    await writeLocalState(failed, token);
    activeOperation = null;
    broadcastState(failed);
    return { ok: false, error: failed.lastError, ...(await getDashboardState(failed)) };
  }
}

function normalizeProfile(input = {}) {
  const rawValidationUrl = String(input?.validationUrl || '').trim();
  return {
    proxy: {
      scheme: ['http', 'https', 'socks4', 'socks5'].includes(input?.proxy?.scheme)
        ? input.proxy.scheme
        : 'http',
      host: String(input?.proxy?.host || '').trim(),
      port: Number(input?.proxy?.port || 0),
      username: String(input?.proxy?.username || ''),
      password: String(input?.proxy?.password || '')
    },
    userAgent: String(input?.userAgent || '').trim(),
    fingerprint: normalizeFingerprint(input?.fingerprint),
    privacyLockdown: normalizePrivacyLockdown(input?.privacyLockdown),
    validationUrl: normalizeValidationUrl(rawValidationUrl),
    validationMode: rawValidationUrl ? 'endpoint' : 'local',
    status: input?.status || 'locked',
    lastError: input?.lastError || '',
    lastAppliedAt: input?.lastAppliedAt || input?.lastCheckedAt || null
  };
}

function validateProfile(profile) {
  if (!profile.proxy.host) throw new Error('Proxy host is required.');
  if (/\s|[/?#]/.test(profile.proxy.host)) throw new Error('Proxy host contains invalid characters.');
  if (!Number.isInteger(profile.proxy.port) || profile.proxy.port < 1 || profile.proxy.port > 65535) {
    throw new Error('Proxy port must be an integer from 1 to 65535.');
  }
  if (!profile.userAgent) throw new Error('User-Agent is required.');
  if (/[\r\n\0]/.test(profile.userAgent)) throw new Error('User-Agent contains invalid control characters.');
  if (profile.userAgent.length > 512) throw new Error('User-Agent must not exceed 512 characters.');
  validateFingerprint(profile.fingerprint, profile.userAgent);

  if (profile.validationUrl) {
    let url;
    try {
      url = new URL(profile.validationUrl);
    } catch {
      throw new Error('Validation URL is invalid.');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Validation URL must use HTTP or HTTPS.');
    }
    if (url.username || url.password) {
      throw new Error('Validation URL must not contain credentials.');
    }
    if (profile.validationUrl.length > 1500) {
      throw new Error('Validation URL is too long.');
    }
  }
}

function normalizeFingerprint(input = {}) {
  const platform = ['Windows', 'macOS', 'Linux'].includes(input?.platform)
    ? input.platform
    : defaultFingerprint.platform;
  return {
    enabled: Boolean(input?.enabled),
    locale: String(input?.locale || defaultFingerprint.locale).trim(),
    timezone: String(input?.timezone || defaultFingerprint.timezone).trim(),
    platform,
    hardwareConcurrency: Number(input?.hardwareConcurrency || defaultFingerprint.hardwareConcurrency),
    deviceMemory: Number(input?.deviceMemory || defaultFingerprint.deviceMemory),
    screenWidth: Number(input?.screenWidth || defaultFingerprint.screenWidth),
    screenHeight: Number(input?.screenHeight || defaultFingerprint.screenHeight),
    deviceScaleFactor: Number(input?.deviceScaleFactor || defaultFingerprint.deviceScaleFactor),
    colorDepth: Number(input?.colorDepth || defaultFingerprint.colorDepth),
    maxTouchPoints: Number.isInteger(Number(input?.maxTouchPoints)) ? Number(input.maxTouchPoints) : defaultFingerprint.maxTouchPoints,
    colorGamut: ['srgb', 'p3'].includes(input?.colorGamut) ? input.colorGamut : defaultFingerprint.colorGamut,
    colorScheme: ['light', 'dark'].includes(input?.colorScheme) ? input.colorScheme : defaultFingerprint.colorScheme,
    reducedMotion: Boolean(input?.reducedMotion),
    blockWebGpu: input?.blockWebGpu !== false,
    geolocationEnabled: Boolean(input?.geolocationEnabled),
    latitude: Number(input?.latitude || 0),
    longitude: Number(input?.longitude || 0),
    locationAccuracy: Number(input?.locationAccuracy || defaultFingerprint.locationAccuracy),
    profileSecret: String(input?.profileSecret || ''),
    protectCanvas: input?.protectCanvas !== false,
    protectWebGl: input?.protectWebGl !== false,
    protectAudio: input?.protectAudio !== false,
    protectFonts: input?.protectFonts !== false
  };
}

function normalizePrivacyLockdown(input = {}) {
  return {
    enabled: Boolean(input?.enabled),
    disableNetworkPrediction: input?.disableNetworkPrediction !== false,
    disableTopics: input?.disableTopics !== false,
    blockThirdPartyCookies: input?.blockThirdPartyCookies !== false
  };
}

function validateFingerprint(fingerprint, userAgent) {
  if (!fingerprint.enabled) return;
  try {
    new Intl.Locale(fingerprint.locale);
  } catch {
    throw new Error('Deep mode locale must be a valid BCP 47 language tag.');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: fingerprint.timezone }).format();
  } catch {
    throw new Error('Deep mode timezone must be a valid IANA timezone.');
  }
  if (!extractChromiumVersion(userAgent)) {
    throw new Error('Deep mode requires a Chrome or Chromium User-Agent with a version number.');
  }
  const expectedPlatformToken = {
    Windows: /Windows NT/i,
    macOS: /Macintosh|Mac OS X/i,
    Linux: /Linux|X11/i
  }[fingerprint.platform];
  if (!expectedPlatformToken.test(userAgent)) {
    throw new Error(`User-Agent does not match the selected ${fingerprint.platform} platform.`);
  }
  if (!Number.isInteger(fingerprint.hardwareConcurrency)
    || fingerprint.hardwareConcurrency < 1 || fingerprint.hardwareConcurrency > 64) {
    throw new Error('Hardware concurrency must be an integer from 1 to 64.');
  }
  if (![1, 2, 4, 8].includes(fingerprint.deviceMemory)) {
    throw new Error('Device memory must be 1, 2, 4, or 8 GB.');
  }
  if (!Number.isInteger(fingerprint.screenWidth)
    || fingerprint.screenWidth < 320 || fingerprint.screenWidth > 7680
    || !Number.isInteger(fingerprint.screenHeight)
    || fingerprint.screenHeight < 240 || fingerprint.screenHeight > 4320) {
    throw new Error('Deep mode screen size is outside the supported range.');
  }
  if (!Number.isFinite(fingerprint.deviceScaleFactor)
    || fingerprint.deviceScaleFactor < 0.5 || fingerprint.deviceScaleFactor > 4) {
    throw new Error('Device scale factor must be between 0.5 and 4.');
  }
  if (![16, 24, 30, 32].includes(fingerprint.colorDepth)) {
    throw new Error('Color depth must be 16, 24, 30, or 32 bits.');
  }
  if (!Number.isInteger(fingerprint.maxTouchPoints) || fingerprint.maxTouchPoints < 0 || fingerprint.maxTouchPoints > 10) {
    throw new Error('Max touch points must be an integer from 0 to 10.');
  }
  if (fingerprint.geolocationEnabled) {
    if (!Number.isFinite(fingerprint.latitude) || fingerprint.latitude < -90 || fingerprint.latitude > 90
      || !Number.isFinite(fingerprint.longitude) || fingerprint.longitude < -180 || fingerprint.longitude > 180
      || !Number.isFinite(fingerprint.locationAccuracy) || fingerprint.locationAccuracy <= 0 || fingerprint.locationAccuracy > 100000) {
      throw new Error('Geolocation latitude, longitude, or accuracy is invalid.');
    }
  }
}

async function validateNativeConsistency(profile) {
  if (!profile.fingerprint.enabled) return;
  const nativeVersion = extractChromiumVersion(globalThis.navigator?.userAgent || '');
  const requestedVersion = extractChromiumVersion(profile.userAgent);
  if (nativeVersion && requestedVersion && nativeVersion.majorVersion !== requestedVersion.majorVersion) {
    throw new Error(`User-Agent Chrome major ${requestedVersion.majorVersion} does not match installed Chrome ${nativeVersion.majorVersion}.`);
  }
  const platformInfo = await chrome.runtime.getPlatformInfo?.();
  if (!platformInfo?.os) return;
  const actualPlatform = platformInfo.os === 'mac' ? 'macOS' : (platformInfo.os === 'linux' ? 'Linux' : 'Windows');
  if (profile.fingerprint.platform !== actualPlatform) {
    throw new Error(`Deep mode platform ${profile.fingerprint.platform} does not match this device (${actualPlatform}).`);
  }
  if (profile.fingerprint.maxTouchPoints > 0 && profile.fingerprint.screenWidth >= 1280) {
    throw new Error('Desktop profiles with touch enabled are unsupported because they create inconsistent input signals.');
  }
}

async function resolveProfileSecret(profile, profileMeta = {}) {
  if (!profile.fingerprint.enabled) return profile.fingerprint.profileSecret || '';
  if (profile.fingerprint.profileSecret) return profile.fingerprint.profileSecret;
  if (profileMeta.profileId) {
    const profiles = normalizeStoredProfiles((await chrome.storage.local.get('proxyProfiles')).proxyProfiles);
    const existing = profiles.find((item) => item.id === profileMeta.profileId);
    if (existing?.fingerprint?.profileSecret) return existing.fingerprint.profileSecret;
  }
  return createProfileSecret();
}

function createProfileSecret() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function extractChromiumVersion(userAgent) {
  const match = String(userAgent || '').match(/(?:Chrome|Chromium)\/(\d+(?:\.\d+){0,3})/i);
  if (!match) return null;
  const fullVersion = match[1];
  return { fullVersion, majorVersion: fullVersion.split('.')[0] };
}

function getFingerprintPlatform(fingerprint) {
  const definitions = {
    Windows: { navigatorPlatform: 'Win32', platformVersion: '10.0.0', architecture: 'x86', bitness: '64' },
    macOS: { navigatorPlatform: 'MacIntel', platformVersion: '14.0.0', architecture: 'arm', bitness: '64' },
    Linux: { navigatorPlatform: 'Linux x86_64', platformVersion: '6.0.0', architecture: 'x86', bitness: '64' }
  };
  return definitions[fingerprint.platform] || definitions.Windows;
}

function buildUserAgentMetadata(userAgent, fingerprint) {
  const version = extractChromiumVersion(userAgent);
  if (!version) return undefined;
  const platform = getFingerprintPlatform(fingerprint);
  const brands = [
    { brand: 'Chromium', version: version.majorVersion },
    { brand: 'Google Chrome', version: version.majorVersion },
    { brand: 'Not_A Brand', version: '99' }
  ];
  return {
    brands,
    fullVersionList: brands.map((brand) => ({
      brand: brand.brand,
      version: brand.brand === 'Not_A Brand' ? '99.0.0.0' : version.fullVersion
    })),
    fullVersion: version.fullVersion,
    platform: fingerprint.platform,
    platformVersion: platform.platformVersion,
    architecture: platform.architecture,
    model: '',
    mobile: false,
    bitness: platform.bitness,
    wow64: false,
    formFactors: ['Desktop']
  };
}

async function applyDeepMode(profile, token = null) {
  if (!profile.fingerprint.enabled) {
    await detachAllDeepTabs();
    return;
  }
  const tabs = await chrome.tabs.query({});
  const eligibleTabs = tabs.filter((tab) => Number.isInteger(tab.id) && isDeepModeUrl(tab.pendingUrl || tab.url));
  await Promise.all(eligibleTabs.map((tab) => applyFingerprintToTab(tab.id, profile, token)));
}

function isDeepModeUrl(url) {
  return DEEP_TAB_SCHEMES.test(String(url || ''));
}

async function applyDeepModeToNewTab(tab, options = {}) {
  if (!Number.isInteger(tab?.id)) return;
  if (!options.initialAttach && !isDeepModeUrl(tab.pendingUrl || tab.url)) return;
  const appState = await readLocalState();
  if (appState.status !== 'active' || !appState.fingerprint.enabled) return;
  try {
    await applyFingerprintToTab(tab.id, appState);
  } catch (error) {
    if (options.initialAttach) return;
    if (isClosedDeepTargetError(error)) return;
    await lockTraffic(`Deep mode could not protect tab ${tab.id}: ${formatError(error)}`);
  }
}

function isClosedDeepTargetError(error) {
  return /No (?:tab|target) with given id|Target closed|Detached while handling command/i.test(formatError(error));
}

function isLocaleOverrideConflict(error) {
  return /Another locale override is already in effect/i.test(formatError(error));
}

async function applyFingerprintToTab(tabId, profile, token = null) {
  const previous = deepTabQueue.get(tabId) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (token !== null) assertCurrentOperation(token);
    await ensureDebuggerAttached(tabId);
    if (token !== null) assertCurrentOperation(token);
    await configureDeepTarget({ tabId }, profile, 'page');
    if (token !== null) assertCurrentOperation(token);
  });
  deepTabQueue.set(tabId, task);
  try {
    await task;
  } finally {
    if (deepTabQueue.get(tabId) === task) deepTabQueue.delete(tabId);
  }
}

async function ensureDebuggerAttached(tabId) {
  const target = { tabId };
  if (attachedDeepTabs.has(tabId)) return;
  try {
    await chrome.debugger.sendCommand(target, 'Runtime.enable');
    attachedDeepTabs.add(tabId);
    return;
  } catch {
    // A service-worker restart can forget a debugger session; attach below when needed.
  }
  await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
  attachedDeepTabs.add(tabId);
}

function deepTargetKey(target) {
  return `tab:${target.tabId}:${target.sessionId || 'root'}`;
}

async function configureDeepTarget(target, profile, targetType = 'page') {
  const fingerprint = profile.fingerprint;
  const targetKey = deepTargetKey(target);
  const platform = getFingerprintPlatform(fingerprint);
  const userAgentMetadata = buildUserAgentMetadata(profile.userAgent, fingerprint);
  await chrome.debugger.sendCommand(target, 'Emulation.setUserAgentOverride', {
    userAgent: profile.userAgent,
    acceptLanguage: fingerprint.locale,
    platform: platform.navigatorPlatform,
    userAgentMetadata
  });
  await chrome.debugger.sendCommand(target, 'Emulation.setTimezoneOverride', {
    timezoneId: fingerprint.timezone
  });
  try {
    await chrome.debugger.sendCommand(target, 'Emulation.setLocaleOverride', {
      locale: fingerprint.locale.replace('-', '_')
    });
  } catch (error) {
    if (!isLocaleOverrideConflict(error)) throw error;
  }
  await chrome.debugger.sendCommand(target, 'Emulation.setHardwareConcurrencyOverride', {
    hardwareConcurrency: fingerprint.hardwareConcurrency
  });
  const source = buildPrivacyShieldSource(fingerprint);
  await chrome.debugger.sendCommand(target, 'Runtime.enable');
  if (targetType === 'page' || targetType === 'iframe' || targetType === 'prerender') {
    await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
      width: fingerprint.screenWidth,
      height: fingerprint.screenHeight,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      mobile: false,
      screenWidth: fingerprint.screenWidth,
      screenHeight: fingerprint.screenHeight,
      positionX: 0,
      positionY: 0
    });
    await chrome.debugger.sendCommand(target, 'Emulation.setEmulatedMedia', {
      media: '',
      features: [
        { name: 'prefers-color-scheme', value: fingerprint.colorScheme },
        { name: 'prefers-reduced-motion', value: fingerprint.reducedMotion ? 'reduce' : 'no-preference' },
        { name: 'color-gamut', value: fingerprint.colorGamut }
      ]
    });
    if (fingerprint.geolocationEnabled) {
      await chrome.debugger.sendCommand(target, 'Emulation.setGeolocationOverride', {
        latitude: fingerprint.latitude,
        longitude: fingerprint.longitude,
        accuracy: fingerprint.locationAccuracy
      });
    } else {
      await chrome.debugger.sendCommand(target, 'Emulation.clearGeolocationOverride');
    }
    await chrome.debugger.sendCommand(target, 'Page.enable');
    const previousScriptId = deepScriptIds.get(targetKey);
    if (previousScriptId) {
      await chrome.debugger.sendCommand(target, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: previousScriptId });
    }
    const scriptResult = await chrome.debugger.sendCommand(target, 'Page.addScriptToEvaluateOnNewDocument', { source });
    if (scriptResult?.identifier) deepScriptIds.set(targetKey, scriptResult.identifier);
  }
  if (!configuredDeepTargets.has(targetKey)) {
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: source,
      includeCommandLineAPI: false,
      returnByValue: false,
      awaitPromise: false
    });
    configuredDeepTargets.add(targetKey);
  }
  if (targetType === 'page' || targetType === 'iframe') {
    await chrome.debugger.sendCommand(target, 'Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [
        { type: 'iframe', exclude: false },
        { type: 'worker', exclude: false },
        { type: 'shared_worker', exclude: false },
        { type: 'service_worker', exclude: false }
      ]
    });
  }
}

function buildPrivacyShieldSource(fingerprint) {
  const settings = JSON.stringify({
    hardwareConcurrency: fingerprint.hardwareConcurrency,
    deviceMemory: fingerprint.deviceMemory,
    screenWidth: fingerprint.screenWidth,
    screenHeight: fingerprint.screenHeight,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    colorDepth: fingerprint.colorDepth,
    protectCanvas: fingerprint.protectCanvas,
    protectWebGl: fingerprint.protectWebGl,
    protectAudio: fingerprint.protectAudio,
    protectFonts: fingerprint.protectFonts,
    maxTouchPoints: fingerprint.maxTouchPoints,
    blockWebGpu: fingerprint.blockWebGpu,
    colorGamut: fingerprint.colorGamut,
    colorScheme: fingerprint.colorScheme,
    reducedMotion: fingerprint.reducedMotion,
    platform: fingerprint.platform,
    profileSecret: fingerprint.profileSecret || ''
  });
  return `(() => {
    const next = ${settings};
    const root = globalThis;
    const origin = String(root.location?.origin || 'opaque-origin');
    let seed = 2166136261;
    for (const character of next.profileSecret + '|' + origin) {
      seed ^= character.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    next.seed = seed >>> 0;
    const shield = { settings: next };
    const defineGetter = (prototype, property, getter) => {
      try { Object.defineProperty(prototype, property, { configurable: true, get: getter }); } catch {}
    };
    if (root.Navigator?.prototype) {
      defineGetter(root.Navigator.prototype, 'hardwareConcurrency', () => shield.settings.hardwareConcurrency);
      defineGetter(root.Navigator.prototype, 'deviceMemory', () => shield.settings.deviceMemory);
    }
    if (root.navigator) {
      defineGetter(root.navigator, 'hardwareConcurrency', () => shield.settings.hardwareConcurrency);
      defineGetter(root.navigator, 'deviceMemory', () => shield.settings.deviceMemory);
      defineGetter(root.navigator, 'maxTouchPoints', () => shield.settings.maxTouchPoints);
      if (shield.settings.blockWebGpu) defineGetter(root.navigator, 'gpu', () => undefined);
    }
    if (root.Screen?.prototype) {
      defineGetter(root.Screen.prototype, 'width', () => shield.settings.screenWidth);
      defineGetter(root.Screen.prototype, 'height', () => shield.settings.screenHeight);
      defineGetter(root.Screen.prototype, 'availWidth', () => shield.settings.screenWidth);
      defineGetter(root.Screen.prototype, 'availHeight', () => shield.settings.screenHeight);
      defineGetter(root.Screen.prototype, 'colorDepth', () => shield.settings.colorDepth);
      defineGetter(root.Screen.prototype, 'pixelDepth', () => shield.settings.colorDepth);
    }
    if (root.screen) {
      defineGetter(root.screen, 'width', () => shield.settings.screenWidth);
      defineGetter(root.screen, 'height', () => shield.settings.screenHeight);
      defineGetter(root.screen, 'availWidth', () => shield.settings.screenWidth);
      defineGetter(root.screen, 'availHeight', () => shield.settings.screenHeight);
      defineGetter(root.screen, 'colorDepth', () => shield.settings.colorDepth);
      defineGetter(root.screen, 'pixelDepth', () => shield.settings.colorDepth);
    }
    if (root.Window?.prototype) {
      defineGetter(root.Window.prototype, 'devicePixelRatio', () => shield.settings.deviceScaleFactor);
    }
    if (root.window) {
      defineGetter(root.window, 'devicePixelRatio', () => shield.settings.deviceScaleFactor);
    }
    const noise = (index) => ((index + shield.settings.seed) % 2 === 0 ? 1 : -1);
    let rawCanvasGetImageData = null;
    if (root.CanvasRenderingContext2D?.prototype) {
      const originalGetImageData = root.CanvasRenderingContext2D.prototype.getImageData;
      rawCanvasGetImageData = originalGetImageData;
      root.CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const image = originalGetImageData.apply(this, args);
        if (!shield.settings.protectCanvas) return image;
        for (let index = 0; index < image.data.length; index += 128) {
          image.data[index] = Math.max(0, Math.min(255, image.data[index] + noise(index)));
        }
        return image;
      };
    }
    if (root.HTMLCanvasElement?.prototype) {
      const originalToDataURL = root.HTMLCanvasElement.prototype.toDataURL;
      root.HTMLCanvasElement.prototype.toDataURL = function(...args) {
        if (!shield.settings.protectCanvas || !this.width || !this.height) return originalToDataURL.apply(this, args);
        const context = this.getContext('2d');
        if (!context || !rawCanvasGetImageData) return originalToDataURL.apply(this, args);
        const pixel = rawCanvasGetImageData.call(context, 0, 0, 1, 1);
        const saved = new Uint8ClampedArray(pixel.data);
        pixel.data[0] = Math.max(0, Math.min(255, pixel.data[0] + noise(this.width + this.height)));
        context.putImageData(pixel, 0, 0);
        try { return originalToDataURL.apply(this, args); }
        finally { pixel.data.set(saved); context.putImageData(pixel, 0, 0); }
      };
      const originalToBlob = root.HTMLCanvasElement.prototype.toBlob;
      root.HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        if (!shield.settings.protectCanvas || !this.width || !this.height) return originalToBlob.call(this, callback, ...args);
        const context = this.getContext('2d');
        if (!context || !rawCanvasGetImageData) return originalToBlob.call(this, callback, ...args);
        const pixel = rawCanvasGetImageData.call(context, 0, 0, 1, 1);
        const saved = new Uint8ClampedArray(pixel.data);
        pixel.data[0] = Math.max(0, Math.min(255, pixel.data[0] + noise(this.width + this.height)));
        context.putImageData(pixel, 0, 0);
        return originalToBlob.call(this, (blob) => {
          pixel.data.set(saved); context.putImageData(pixel, 0, 0); callback(blob);
        }, ...args);
      };
    }
    if (root.OffscreenCanvas?.prototype) {
      const originalConvertToBlob = root.OffscreenCanvas.prototype.convertToBlob;
      root.OffscreenCanvas.prototype.convertToBlob = async function(...args) {
        if (!shield.settings.protectCanvas || !this.width || !this.height) return originalConvertToBlob.apply(this, args);
        const context = this.getContext('2d');
        if (!context || !rawCanvasGetImageData) return originalConvertToBlob.apply(this, args);
        const pixel = rawCanvasGetImageData.call(context, 0, 0, 1, 1);
        const saved = new Uint8ClampedArray(pixel.data);
        pixel.data[0] = Math.max(0, Math.min(255, pixel.data[0] + noise(this.width + this.height)));
        context.putImageData(pixel, 0, 0);
        try { return await originalConvertToBlob.apply(this, args); }
        finally { pixel.data.set(saved); context.putImageData(pixel, 0, 0); }
      };
    }
    for (const type of [root.WebGLRenderingContext, root.WebGL2RenderingContext]) {
      if (!type?.prototype) continue;
      const originalGetExtension = type.prototype.getExtension;
      type.prototype.getExtension = function(name) {
        if (shield.settings.protectWebGl && String(name).toLowerCase() === 'webgl_debug_renderer_info') return null;
        return originalGetExtension.call(this, name);
      };
      const originalReadPixels = type.prototype.readPixels;
      type.prototype.readPixels = function(...args) {
        const output = args[6];
        const result = originalReadPixels.apply(this, args);
        if (shield.settings.protectWebGl && output && output.length) output[0] = (output[0] + noise(output.length)) & 255;
        return result;
      };
    }
    if (root.AnalyserNode?.prototype) {
      const originalFrequency = root.AnalyserNode.prototype.getFloatFrequencyData;
      root.AnalyserNode.prototype.getFloatFrequencyData = function(array) {
        const result = originalFrequency.call(this, array);
        if (shield.settings.protectAudio) {
          for (let index = 0; index < array.length; index += 64) array[index] += noise(index) * 0.00001;
        }
        return result;
      };
      const originalCopyFloat = root.AnalyserNode.prototype.getFloatTimeDomainData;
      root.AnalyserNode.prototype.getFloatTimeDomainData = function(array) {
        const result = originalCopyFloat.call(this, array);
        if (shield.settings.protectAudio) for (let index = 0; index < array.length; index += 64) array[index] += noise(index) * 0.00001;
        return result;
      };
    }
    if (root.AudioBuffer?.prototype) {
      const originalChannelData = root.AudioBuffer.prototype.getChannelData;
      const protectedChannels = new WeakSet();
      root.AudioBuffer.prototype.getChannelData = function(channel) {
        const data = originalChannelData.call(this, channel);
        if (shield.settings.protectAudio && !protectedChannels.has(data)) {
          for (let index = 0; index < data.length; index += 256) data[index] += noise(index) * 0.0000001;
          protectedChannels.add(data);
        }
        return data;
      };
      const originalCopyFromChannel = root.AudioBuffer.prototype.copyFromChannel;
      root.AudioBuffer.prototype.copyFromChannel = function(destination, ...args) {
        const result = originalCopyFromChannel.call(this, destination, ...args);
        if (shield.settings.protectAudio) for (let index = 0; index < destination.length; index += 256) destination[index] += noise(index) * 0.0000001;
        return result;
      };
    }
    if (root.FontFaceSet?.prototype) {
      const originalCheck = root.FontFaceSet.prototype.check;
      root.FontFaceSet.prototype.check = function(font, text) {
        if (!shield.settings.protectFonts) return originalCheck.call(this, font, text);
        const generic = /(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace)/i;
        const allowlist = shield.settings.platform === 'Windows'
          ? /Arial|Calibri|Cambria|Consolas|Courier New|Georgia|Segoe UI|Tahoma|Times New Roman|Verdana/i
          : (shield.settings.platform === 'macOS' ? /Arial|Courier|Georgia|Helvetica|Menlo|Monaco|Times|Verdana/i : /Arial|DejaVu|Liberation|Noto|Ubuntu|Verdana/i);
        return generic.test(String(font)) || allowlist.test(String(font))
          ? originalCheck.call(this, font, text) : false;
      };
    }
  })()`;
}

function stableFingerprintSeed(fingerprint) {
  const source = [
    fingerprint.locale, fingerprint.timezone, fingerprint.platform,
    fingerprint.hardwareConcurrency, fingerprint.deviceMemory,
    fingerprint.screenWidth, fingerprint.screenHeight, fingerprint.colorDepth
  ].join('|');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function handleDebuggerEvent(source, method, params = {}) {
  if (method !== 'Target.attachedToTarget' || !source?.tabId || !params.sessionId) return;
  const appState = await readLocalState();
  if (appState.status !== 'active' || !appState.fingerprint.enabled) return;
  const child = { tabId: source.tabId, sessionId: params.sessionId };
  const targetType = params.targetInfo?.type || 'iframe';
  deepTargetTypes.set(deepTargetKey(child), targetType);
  try {
    await configureDeepTarget(child, appState, targetType);
  } catch (error) {
    if (isClosedDeepTargetError(error)) return;
    await lockTraffic(`Deep mode could not protect a child frame: ${formatError(error)}`);
  }
}

async function handleDebuggerDetach(source, reason) {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId)) return;
  attachedDeepTabs.delete(tabId);
  if (expectedDebuggerDetaches.delete(tabId) || reason === 'target_closed') return;
  const appState = await readLocalState();
  if (appState.status === 'active' && appState.fingerprint.enabled) {
    await lockTraffic(`Deep mode detached from tab ${tabId}. Traffic was locked.`);
  }
}

async function detachAllDeepTabs() {
  const tabIds = [...attachedDeepTabs];
  attachedDeepTabs.clear();
  deepTabQueue.clear();
  deepScriptIds.clear();
  configuredDeepTargets.clear();
  configuredDeepContexts.clear();
  deepTargetTypes.clear();
  await Promise.all(tabIds.map(async (tabId) => {
    expectedDebuggerDetaches.add(tabId);
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      expectedDebuggerDetaches.delete(tabId);
    }
  }));
}

async function applyProxy(proxy, token) {
  const config = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: proxy.scheme,
        host: proxy.host,
        port: proxy.port
      },
      bypassList: ['<-loopback>']
    }
  };
  const task = proxyMutationQueue.then(async () => {
    assertCurrentOperation(token);
    await chrome.proxy.settings.set({ value: config, scope: 'regular' });
    assertCurrentOperation(token);
  });
  proxyMutationQueue = task.catch(() => {});
  await task;
}

async function confirmAppliedProxy(proxy) {
  const current = await chrome.proxy.settings.get({ incognito: false });
  if (!proxySettingsMatch(current, proxy)) {
    throw new Error('Chrome did not retain the requested proxy configuration.');
  }
}

function proxySettingsMatch(settings, proxy) {
  const configured = settings?.value?.rules?.singleProxy;
  return settings?.levelOfControl === 'controlled_by_this_extension'
    && settings?.value?.mode === 'fixed_servers'
    && configured?.scheme === proxy.scheme
    && normalizeHost(configured?.host) === normalizeHost(proxy.host)
    && Number(configured?.port) === proxy.port
    && settings?.value?.rules?.bypassList?.length === 1
    && settings.value.rules.bypassList[0] === '<-loopback>';
}

async function ensureWebRtcProtection() {
  await chrome.privacy.network.webRTCIPHandlingPolicy.set({
    value: WEBRTC_POLICY,
    scope: 'regular'
  });
  const current = await chrome.privacy.network.webRTCIPHandlingPolicy.get({ incognito: false });
  if (current?.levelOfControl !== 'controlled_by_this_extension' || current?.value !== WEBRTC_POLICY) {
    throw new Error('Chrome did not retain the WebRTC leak-protection setting.');
  }
}

async function ensurePrivacyLockdown(settings) {
  const privacy = normalizePrivacyLockdown(settings);
  const chromeSettings = [
    [chrome.privacy.network.networkPredictionEnabled, privacy.disableNetworkPrediction],
    [chrome.privacy.websites?.topicsEnabled, privacy.disableTopics],
    [chrome.privacy.websites?.thirdPartyCookiesAllowed, privacy.blockThirdPartyCookies]
  ];
  for (const [setting, shouldDisable] of chromeSettings) {
    if (!setting) continue;
    if (privacy.enabled && shouldDisable) {
      await setting.set({ value: false, scope: 'regular' });
      const current = await setting.get({ incognito: false });
      if (current?.value !== false || current?.levelOfControl !== 'controlled_by_this_extension') {
        throw new Error('Chrome did not retain a requested Privacy Lockdown setting.');
      }
    } else {
      await setting.clear({ scope: 'regular' });
    }
  }

}

async function validateConnectivity(validationUrl, token) {
  await installValidationAllowRule(validationUrl, token);
  assertCurrentOperation(token);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  activeValidationController = controller;

  try {
    const response = await fetch(validationUrl, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Validation endpoint returned HTTP ${response.status}.`);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Validation endpoint timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
    if (isCurrentOperation(token)) {
      activeValidationController = null;
      await removeSessionRules([VALIDATION_ALLOW_RULE]);
    }
  }
}

async function installValidationAllowRule(validationUrl, token) {
  await updateSessionRules({
    removeRuleIds: [VALIDATION_ALLOW_RULE],
    addRules: [{
      id: VALIDATION_ALLOW_RULE,
      priority: 150,
      action: { type: 'allow' },
      condition: {
        regexFilter: `^${escapeRegex(validationUrl)}$`,
        resourceTypes: ['xmlhttprequest']
      }
    }]
  }, token);
}

async function installUaRule(userAgent, token) {
  await updateSessionRules({
    removeRuleIds: [UA_RULE],
    addRules: [{
      id: UA_RULE,
      priority: 200,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'user-agent', operation: 'set', value: userAgent }]
      },
      condition: {
        regexFilter: '^(https?|wss?)://',
        resourceTypes: allWebResourceTypes()
      }
    }]
  }, token);
}

async function installUpdateFeedAllowRule() {
  const host = await readUpdateFeedHost();
  if (!host) return;
  await updateSessionRules({
    removeRuleIds: [UPDATE_ALLOW_RULE],
    addRules: [{
      id: UPDATE_ALLOW_RULE,
      priority: 10000,
      action: { type: 'allow' },
      condition: {
        requestDomains: [host],
        resourceTypes: allWebResourceTypes()
      }
    }]
  });
}

async function readUpdateFeedHost() {
  try {
    const url = chrome.runtime.getURL?.('update-feed.json');
    if (!url) return '';
    const response = await fetch(url);
    if (!response.ok) return '';
    const payload = await response.json();
    return new URL(String(payload?.baseUrl || '')).hostname;
  } catch {
    return '';
  }
}

async function installGlobalAllowRule(token) {
  await updateSessionRules({
    removeRuleIds: [GLOBAL_ALLOW_RULE],
    addRules: [{
      id: GLOBAL_ALLOW_RULE,
      priority: 100,
      action: { type: 'allow' },
      condition: {
        regexFilter: '^(https?|wss?)://',
        resourceTypes: allWebResourceTypes()
      }
    }]
  }, token);
}

function allWebResourceTypes() {
  return [
    'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
    'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
    'webtransport', 'webbundle', 'other'
  ];
}

async function lockTraffic(reason = '', seed = null, options = {}) {
  const { cancelPending = true, token = null } = options;
  if (cancelPending) cancelCurrentOperation();

  await removeSessionRules([GLOBAL_ALLOW_RULE, UA_RULE, VALIDATION_ALLOW_RULE], token);
  await detachAllDeepTabs();

  const base = seed ? toStoredState(seed) : await readLocalState();
  const next = {
    ...base,
    status: 'locked',
    lastError: reason
  };
  await writeLocalState(next, token);
  broadcastState(next);
  return next;
}

function beginOperation() {
  cancelCurrentOperation();
  return operationEpoch;
}

function cancelCurrentOperation() {
  operationEpoch += 1;
  activeOperation = null;
  if (activeValidationController) {
    activeValidationController.abort();
    activeValidationController = null;
  }
}

function isCurrentOperation(token) {
  return token === operationEpoch;
}

function assertCurrentOperation(token) {
  if (!isCurrentOperation(token)) throw new Error('Operation cancelled.');
}

async function handleProxySettingsChange(details) {
  const appState = await readLocalState();
  if (appState.status !== 'active') return;
  if (!proxySettingsMatch(details, appState.proxy)) {
    await lockTraffic('Proxy settings changed or control was lost. Traffic was locked.');
  }
}

async function handleWebRtcPolicyChange(details) {
  const appState = await readLocalState();
  if (appState.status !== 'active') return;
  if (details?.levelOfControl !== 'controlled_by_this_extension' || details?.value !== WEBRTC_POLICY) {
    await lockTraffic('WebRTC leak protection changed or control was lost. Traffic was locked.');
  }
}

async function handlePrivacySettingChange(details) {
  const appState = await readLocalState();
  const lockdown = normalizePrivacyLockdown(appState.privacyLockdown);
  if (appState.status !== 'active' || !lockdown.enabled) return;
  if (details?.levelOfControl !== 'controlled_by_this_extension' || details?.value !== false) {
    await lockTraffic('Privacy Lockdown was changed or control was lost. Traffic was locked.');
  }
}

async function getProfileForProxyAuth() {
  if (activeOperation?.profile) return activeOperation.profile;

  const appState = await readLocalState();
  if (appState.status !== 'active') return null;
  return mergePersistentPassword(appState);
}

function proxyChallengeMatches(challenger, proxy) {
  if (!challenger?.host) return false;
  const hostMatches = normalizeHost(challenger.host) === normalizeHost(proxy.host);
  const portMatches = challenger.port == null || Number(challenger.port) === proxy.port;
  return hostMatches && portMatches;
}

function clearAuthAttempt(details) {
  authAttempts.delete(details.requestId);
}

function handleRequestCompleted(details) {
  clearAuthAttempt(details);
  recordSuccessfulRequest(details).catch(() => {});
}

async function initializeStorage(isInstall) {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  ]);

  const [
    { appState: rawState, proxyCredential, proxyCredentials = {}, proxyProfiles = [], selectedProfileId, activeProfileId },
    { proxyPassword: sessionPassword = '' }
  ] = await Promise.all([
    chrome.storage.local.get([
      'appState', 'proxyCredential', 'proxyCredentials', 'proxyProfiles',
      'selectedProfileId', 'activeProfileId'
    ]),
    chrome.storage.session.get('proxyPassword')
  ]);
  const freshInstall = Boolean(isInstall && !rawState && !proxyProfiles.length);
  const legacyPassword = freshInstall
    ? ''
    : String(rawState?.proxy?.password || sessionPassword || '');
  const migrated = freshInstall
    ? { ...defaultState, proxy: { ...defaultState.proxy } }
    : migrateState(rawState);
  await writeLocalState(migrated);
  const migratedCredentials = { ...proxyCredentials };
  if (proxyCredential?.identity) {
    migratedCredentials[proxyCredential.identity] = String(proxyCredential.password || '');
  }
  if (legacyPassword && migrated.proxy.username) {
    migratedCredentials[proxyIdentity(migrated.proxy)] = legacyPassword;
  }

  const validProfiles = mergeBundledProfiles(
    normalizeStoredProfiles(proxyProfiles),
    await loadBundledProfiles()
  );
  if (!validProfiles.length && migrated.proxy.host) {
    validProfiles.push(toProfileRecord(migrated, {
      id: createProfileId(),
      name: 'Default profile'
    }));
  }
  const fallbackProfileId = validProfiles[0]?.id || null;
  const nextSelectedId = validProfiles.some((profile) => profile.id === selectedProfileId)
    ? selectedProfileId
    : fallbackProfileId;
  const nextActiveId = validProfiles.some((profile) => profile.id === activeProfileId)
    ? activeProfileId
    : fallbackProfileId;

  await writeLocalValues({
    proxyCredentials: migratedCredentials,
    proxyProfiles: validProfiles,
    selectedProfileId: nextSelectedId,
    activeProfileId: nextActiveId,
    proxyHealth: isInstall ? { ...defaultProxyHealth } : await readProxyHealth()
  });
  await chrome.storage.local.remove('proxyCredential');
  await chrome.storage.session.remove('proxyPassword');
  await installUpdateFeedAllowRule();
  return {
    freshInstall,
    appState: migrated,
    activeProfileId: nextActiveId
  };
}

async function applySavedProfileIfComplete(appState, activeProfileId) {
  const credential = await readPersistentCredential(appState.proxy);
  const password = credential.password;
  const needsPassword = Boolean(appState.proxy.username && !credential.found);
  if (appState.proxy.host && appState.proxy.port && appState.userAgent && !needsPassword) {
    await applyProfile(
      { ...appState, proxy: { ...appState.proxy, password } },
      true,
      { profileId: activeProfileId, profileName: '' }
    );
  } else if (needsPassword) {
    await lockTraffic('No saved password matches this proxy. Enter it to apply the profile.');
  }
}

function migrateState(rawState = {}) {
  const normalized = normalizeProfile(rawState);
  return toStoredState({
    ...normalized,
    status: 'locked',
    lastError: rawState.lastError || '',
    lastAppliedAt: rawState.lastAppliedAt || rawState.lastCheckedAt || null
  });
}

function toStoredState(profile) {
  return {
    proxy: {
      scheme: profile?.proxy?.scheme || 'http',
      host: profile?.proxy?.host || '',
      port: Number(profile?.proxy?.port || 0),
      username: profile?.proxy?.username || ''
    },
    userAgent: profile?.userAgent || '',
    fingerprint: normalizeFingerprint(profile?.fingerprint),
    privacyLockdown: normalizePrivacyLockdown(profile?.privacyLockdown),
    validationUrl: profile?.validationUrl || '',
    validationMode: profile?.validationUrl ? 'endpoint' : 'local',
    status: profile?.status || 'locked',
    lastError: profile?.lastError || '',
    lastAppliedAt: profile?.lastAppliedAt || null
  };
}

async function readLocalState() {
  const { appState } = await chrome.storage.local.get('appState');
  return migrateStateWithoutRelocking(appState);
}

function migrateStateWithoutRelocking(rawState = {}) {
  const normalized = normalizeProfile(rawState);
  return toStoredState({
    ...normalized,
    status: rawState?.status === 'active' ? 'active' : 'locked'
  });
}

async function getStateForUi() {
  return mergePersistentPassword(await readLocalState());
}

async function mergePersistentPassword(appState) {
  const credential = await readPersistentCredential(appState.proxy);
  return { ...appState, proxy: { ...appState.proxy, password: credential.password } };
}

async function savePersistentCredential(proxy, token = null) {
  const task = credentialMutationQueue.then(async () => {
    if (token !== null) assertCurrentOperation(token);
    const { proxyCredentials = {} } = await chrome.storage.local.get('proxyCredentials');
    const nextCredentials = { ...proxyCredentials };
    if (proxy.username) {
      nextCredentials[proxyIdentity(proxy)] = String(proxy.password || '');
    } else {
      delete nextCredentials[proxyIdentity(proxy)];
    }
    await chrome.storage.local.set({ proxyCredentials: nextCredentials });
  });
  credentialMutationQueue = task.catch(() => {});
  await task;
}

async function readPersistentCredential(proxy) {
  const { proxyCredentials = {} } = await chrome.storage.local.get('proxyCredentials');
  const identity = proxyIdentity(proxy);
  if (!Object.prototype.hasOwnProperty.call(proxyCredentials, identity)) {
    return { found: false, password: '' };
  }
  return { found: true, password: String(proxyCredentials[identity] || '') };
}

function proxyIdentity(proxy) {
  return [
    proxy?.scheme || 'http',
    normalizeHost(proxy?.host),
    Number(proxy?.port || 0),
    String(proxy?.username || '')
  ].join('|');
}

async function getDashboardState(appStateOverride = null) {
  const [appState, profileData, health] = await Promise.all([
    appStateOverride ? mergePersistentPassword(appStateOverride) : getStateForUi(),
    getProfilesForUi(),
    readProxyHealth()
  ]);
  return { appState, ...profileData, health, fingerprintAudit: auditFingerprint(appState) };
}

function auditFingerprint(appState) {
  const fingerprint = normalizeFingerprint(appState?.fingerprint);
  if (!fingerprint.enabled) {
    return { enabled: false, consistent: true, warnings: [], checkedAt: Date.now() };
  }
  const warnings = [];
  const version = extractChromiumVersion(appState?.userAgent);
  if (!version) warnings.push('User-Agent has no Chromium version for Client Hints.');
  const expectedPlatformToken = {
    Windows: /Windows NT/i,
    macOS: /Macintosh|Mac OS X/i,
    Linux: /Linux|X11/i
  }[fingerprint.platform];
  if (!expectedPlatformToken?.test(appState?.userAgent || '')) {
    warnings.push(`User-Agent does not match ${fingerprint.platform}.`);
  }
  if (fingerprint.screenWidth < fingerprint.screenHeight) {
    warnings.push('Portrait screen dimensions are unusual for the selected desktop profile.');
  }
  return {
    enabled: true,
    consistent: warnings.length === 0 && appState?.status === 'active',
    warnings,
    checkedAt: Date.now()
  };
}

async function openLocalAudit() {
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('audit.html') });
  return { ok: true, tabId: tab.id };
}

async function runLocalAudit() {
  const [appState, proxySettings, webRtc, platformInfo, targets] = await Promise.all([
    readLocalState(),
    chrome.proxy.settings.get({ incognito: false }),
    chrome.privacy.network.webRTCIPHandlingPolicy.get({ incognito: false }),
    chrome.runtime.getPlatformInfo(),
    chrome.debugger.getTargets()
  ]);
  const fingerprint = normalizeFingerprint(appState.fingerprint);
  const lockdown = normalizePrivacyLockdown(appState.privacyLockdown);
  const privacyResults = {};
  for (const [key, setting] of Object.entries({
    networkPrediction: chrome.privacy.network.networkPredictionEnabled,
    topics: chrome.privacy.websites?.topicsEnabled,
    thirdPartyCookies: chrome.privacy.websites?.thirdPartyCookiesAllowed
  })) {
    if (!setting) {
      privacyResults[key] = { supported: false, value: null, controlled: false };
      continue;
    }
    const current = await setting.get({ incognito: false });
    privacyResults[key] = {
      supported: true,
      value: current?.value,
      controlled: current?.levelOfControl === 'controlled_by_this_extension'
    };
  }
  const checks = [
    {
      id: 'traffic', label: 'Traffic gate', category: 'Network',
      status: appState.status === 'active' ? 'consistent' : 'warning',
      detail: appState.status === 'active' ? 'Supported web traffic is unlocked for the active profile.' : 'Traffic is locked.'
    },
    {
      id: 'proxy', label: 'Proxy control', category: 'Network',
      status: proxySettingsMatch(proxySettings, appState.proxy) ? 'consistent' : 'possible-leak',
      detail: proxySettingsMatch(proxySettings, appState.proxy) ? 'Chrome retained the configured fixed proxy.' : 'Proxy control or values do not match the active profile.'
    },
    {
      id: 'webrtc', label: 'WebRTC route policy', category: 'Network',
      status: webRtc?.value === WEBRTC_POLICY && webRtc?.levelOfControl === 'controlled_by_this_extension' ? 'consistent' : 'possible-leak',
      detail: webRtc?.value === WEBRTC_POLICY ? 'Non-proxied UDP is disabled.' : 'WebRTC policy is not protected.'
    },
    {
      id: 'native', label: 'Native platform consistency', category: 'Fingerprint',
      status: !fingerprint.enabled || fingerprint.platform === platformNameFromOs(platformInfo.os) ? 'consistent' : 'warning',
      detail: `Chrome reports ${platformNameFromOs(platformInfo.os)}; profile requests ${fingerprint.platform}.`
    },
    {
      id: 'debugger', label: 'Deep target coverage', category: 'Fingerprint',
      status: !fingerprint.enabled ? 'unsupported' : (targets.some((target) => target.attached && target.type === 'page') ? 'consistent' : 'warning'),
      detail: fingerprint.enabled ? `${targets.filter((target) => target.attached).length} Chrome target(s) are currently attached.` : 'Deep mode is disabled.'
    },
    {
      id: 'origin-seed', label: 'Per-origin stable seed', category: 'Fingerprint',
      status: fingerprint.enabled && Boolean(fingerprint.profileSecret) ? 'consistent' : 'unsupported',
      detail: fingerprint.enabled ? 'A private profile secret derives a different stable seed for each origin.' : 'Deep mode is disabled.'
    },
    {
      id: 'lockdown', label: 'Privacy Lockdown', category: 'Privacy',
      status: !lockdown.enabled ? 'unsupported' : (Object.values(privacyResults).every((item) => !item.supported || item.value === false) ? 'consistent' : 'warning'),
      detail: lockdown.enabled ? 'Prediction, Topics and third-party cookie settings were checked locally.' : 'Privacy Lockdown is disabled.'
    },
    {
      id: 'transport', label: 'TLS / HTTP2 fingerprint', category: 'Limitations',
      status: 'unsupported', detail: 'Chrome extensions cannot change transport-layer fingerprints.'
    }
  ];
  return {
    ok: true,
    generatedAt: Date.now(),
    appState: {
      status: appState.status,
      proxy: appState.proxy,
      userAgent: appState.userAgent,
      fingerprint: { ...fingerprint, profileSecret: '' },
      privacyLockdown: lockdown
    },
    privacyResults,
    checks
  };
}

function platformNameFromOs(os) {
  if (os === 'mac') return 'macOS';
  if (os === 'linux' || os === 'openbsd' || os === 'cros') return 'Linux';
  return 'Windows';
}

async function getProfilesForUi() {
  const {
    proxyProfiles = [], proxyCredentials = {}, selectedProfileId = null, activeProfileId = null
  } = await chrome.storage.local.get([
    'proxyProfiles', 'proxyCredentials', 'selectedProfileId', 'activeProfileId'
  ]);
  const profiles = normalizeStoredProfiles(proxyProfiles).map((profile) => ({
    ...profile,
    fingerprint: { ...profile.fingerprint, profileSecret: '' },
    proxy: {
      ...profile.proxy,
      password: String(proxyCredentials[proxyIdentity(profile.proxy)] || '')
    }
  }));
  return { profiles, selectedProfileId, activeProfileId };
}

async function upsertAppliedProfile(profile, profileMeta, token) {
  const task = profileMutationQueue.then(async () => {
    assertCurrentOperation(token);
    const {
      proxyProfiles = [], proxyCredentials = {}
    } = await chrome.storage.local.get(['proxyProfiles', 'proxyCredentials']);
    const profiles = normalizeStoredProfiles(proxyProfiles);
    const existingIndex = profiles.findIndex((item) => item.id === profileMeta.profileId);
    const existing = existingIndex >= 0 ? profiles[existingIndex] : null;
    const id = existing?.id || createProfileId();
    const record = toProfileRecord(profile, {
      id,
      name: profileMeta.profileName || existing?.name || `${profile.proxy.host}:${profile.proxy.port}`,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      bundled: existing?.bundled
    });

    if (existingIndex >= 0) profiles[existingIndex] = record;
    else profiles.push(record);

    const nextCredentials = { ...proxyCredentials };
    if (existing && proxyIdentity(existing.proxy) !== proxyIdentity(record.proxy)) {
      const oldIdentity = proxyIdentity(existing.proxy);
      const oldIdentityStillUsed = profiles.some((item) => (
        item.id !== id && proxyIdentity(item.proxy) === oldIdentity
      ));
      if (!oldIdentityStillUsed) delete nextCredentials[oldIdentity];
    }

    assertCurrentOperation(token);
    await chrome.storage.local.set({
      proxyProfiles: profiles,
      proxyCredentials: nextCredentials,
      selectedProfileId: id,
      activeProfileId: id
    });
    return id;
  });
  profileMutationQueue = task.catch(() => {});
  return task;
}

async function selectProfile(profileId) {
  const profiles = normalizeStoredProfiles((await chrome.storage.local.get('proxyProfiles')).proxyProfiles);
  if (profileId !== null && !profiles.some((profile) => profile.id === profileId)) {
    throw new Error('Selected profile no longer exists.');
  }
  await chrome.storage.local.set({ selectedProfileId: profileId });
  return { ok: true, ...(await getDashboardState()) };
}

async function duplicateProfile(profileId) {
  return runProfileMutation(async () => {
    const { proxyProfiles = [] } = await chrome.storage.local.get('proxyProfiles');
    const profiles = normalizeStoredProfiles(proxyProfiles);
    const source = profiles.find((profile) => profile.id === profileId);
    if (!source) throw new Error('Profile to duplicate was not found.');

    const duplicate = toProfileRecord(source, {
      id: createProfileId(),
      name: `${source.name} Copy`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    duplicate.fingerprint.profileSecret = createProfileSecret();
    profiles.push(duplicate);
    await chrome.storage.local.set({ proxyProfiles: profiles, selectedProfileId: duplicate.id });
    return { ok: true, ...(await getDashboardState()) };
  });
}

async function deleteProfile(profileId) {
  return runProfileMutation(async () => {
    const {
      proxyProfiles = [], proxyCredentials = {}, activeProfileId = null
    } = await chrome.storage.local.get(['proxyProfiles', 'proxyCredentials', 'activeProfileId']);
    const appState = await readLocalState();
    if (profileId === activeProfileId && appState.status === 'active') {
      throw new Error('Lock traffic or apply another profile before deleting the active profile.');
    }

    const profiles = normalizeStoredProfiles(proxyProfiles);
    const deleted = profiles.find((profile) => profile.id === profileId);
    if (!deleted) throw new Error('Profile to delete was not found.');
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    const nextCredentials = { ...proxyCredentials };
    const deletedIdentity = proxyIdentity(deleted.proxy);
    if (!nextProfiles.some((profile) => proxyIdentity(profile.proxy) === deletedIdentity)) {
      delete nextCredentials[deletedIdentity];
    }
    const nextSelectedId = nextProfiles[0]?.id || null;
    await chrome.storage.local.set({
      proxyProfiles: nextProfiles,
      proxyCredentials: nextCredentials,
      selectedProfileId: nextSelectedId,
      activeProfileId: profileId === activeProfileId ? null : activeProfileId
    });
    return { ok: true, ...(await getDashboardState()) };
  });
}

async function importProfiles(inputProfiles) {
  if (!Array.isArray(inputProfiles) || !inputProfiles.length) {
    throw new Error('No valid proxy profiles were provided for import.');
  }

  return runProfileMutation(async () => {
    const {
      proxyProfiles = [], proxyCredentials = {}
    } = await chrome.storage.local.get(['proxyProfiles', 'proxyCredentials']);
    const profiles = normalizeStoredProfiles(proxyProfiles);
    const nextCredentials = { ...proxyCredentials };
    const imported = [];

    for (const input of inputProfiles) {
      const normalized = normalizeProfile(input);
      normalized.fingerprint.profileSecret = createProfileSecret();
      validateProfile(normalized);
      const record = toProfileRecord(normalized, {
        id: createProfileId(),
        name: input?.name || `${normalized.proxy.host}:${normalized.proxy.port}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      profiles.push(record);
      imported.push(record);
      if (normalized.proxy.username) {
        nextCredentials[proxyIdentity(normalized.proxy)] = normalized.proxy.password;
      }
    }

    await chrome.storage.local.set({
      proxyProfiles: profiles,
      proxyCredentials: nextCredentials,
      selectedProfileId: imported[0].id
    });
    return { ok: true, importedCount: imported.length, ...(await getDashboardState()) };
  });
}

function runProfileMutation(operation) {
  const task = profileMutationQueue.then(operation);
  profileMutationQueue = task.catch(() => {});
  return task;
}

function normalizeStoredProfiles(profiles) {
  if (!Array.isArray(profiles)) return [];
  return profiles
    .filter((profile) => profile && typeof profile.id === 'string' && profile.proxy)
    .map((profile) => toProfileRecord(normalizeProfile(profile), {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      bundled: profile.bundled
    }));
}

async function loadBundledProfiles() {
  try {
    const url = chrome.runtime.getURL?.('profiles/bundled-profiles.json');
    if (!url) return [];
    const response = await fetch(url);
    if (!response.ok) return [];
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload?.profiles;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function mergeBundledProfiles(existing, bundled) {
  const next = [...existing];
  for (const incoming of bundled) {
    const record = bundledProfileRecord(incoming);
    if (!record) continue;
    const index = next.findIndex((profile) => profile.id === record.id);
    if (index < 0) {
      next.push(record);
      continue;
    }
    next[index] = toProfileRecord(record, {
      id: record.id,
      name: record.name,
      createdAt: next[index].createdAt,
      updatedAt: Date.now(),
      bundled: true
    });
  }
  return next;
}

function bundledProfileRecord(input) {
  const id = String(input?.id || '').trim();
  if (!id || /[\s/]/.test(id)) return null;
  const normalized = normalizeProfile({ ...input, proxy: { ...input?.proxy, password: '' } });
  if (!normalized.proxy.host || !normalized.proxy.port) return null;
  return toProfileRecord(normalized, {
    id,
    name: input?.name || `${normalized.proxy.host}:${normalized.proxy.port}`,
    createdAt: Number(input?.createdAt || Date.now()),
    updatedAt: Date.now(),
    bundled: true
  });
}

function toProfileRecord(profile, metadata = {}) {
  const stored = toStoredState(profile);
  return {
    id: metadata.id || createProfileId(),
    name: sanitizeProfileName(metadata.name || `${stored.proxy.host}:${stored.proxy.port}`),
    proxy: stored.proxy,
    userAgent: stored.userAgent,
    fingerprint: stored.fingerprint,
    privacyLockdown: stored.privacyLockdown,
    validationUrl: stored.validationUrl,
    createdAt: Number(metadata.createdAt || Date.now()),
    updatedAt: Number(metadata.updatedAt || Date.now()),
    bundled: Boolean(metadata.bundled)
  };
}

function sanitizeProfileName(name) {
  return String(name || 'Unnamed profile').trim().slice(0, 80) || 'Unnamed profile';
}

function createProfileId() {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readProxyHealth() {
  if (healthCache) return { ...healthCache };
  const { proxyHealth = defaultProxyHealth } = await chrome.storage.local.get('proxyHealth');
  healthCache = {
    consecutiveErrors: Number(proxyHealth?.consecutiveErrors || 0),
    lastError: String(proxyHealth?.lastError || ''),
    lastErrorAt: proxyHealth?.lastErrorAt || null,
    lockedAt: proxyHealth?.lockedAt || null
  };
  return { ...healthCache };
}

async function writeProxyHealth(health) {
  healthCache = { ...defaultProxyHealth, ...health };
  await chrome.storage.local.set({ proxyHealth: healthCache });
  broadcastHealth(healthCache);
  return { ...healthCache };
}

async function resetProxyHealth() {
  return runHealthMutation(() => writeProxyHealth({ ...defaultProxyHealth }));
}

async function recordProxyError(details = {}) {
  return runHealthMutation(async () => {
    const appState = await readLocalState();
    if (appState.status !== 'active') return;

    const previous = await readProxyHealth();
    const nextCount = previous.consecutiveErrors + 1;
    const errorText = String(details.error || details.details || 'Chrome reported a proxy error.');
    const next = await writeProxyHealth({
      consecutiveErrors: nextCount,
      lastError: errorText,
      lastErrorAt: Date.now(),
      lockedAt: nextCount >= PROXY_ERROR_THRESHOLD ? Date.now() : null
    });

    if (nextCount >= PROXY_ERROR_THRESHOLD) {
      await lockTraffic(`Proxy reported ${nextCount} consecutive errors. Traffic was locked. Last error: ${errorText}`);
      broadcastHealth(next);
    }
  });
}

async function recordSuccessfulRequest(details) {
  if (!/^(https?|wss?):\/\//i.test(details?.url || '')) return;
  const appState = await readLocalState();
  if (appState.status !== 'active') return;
  const health = await readProxyHealth();
  if (health.consecutiveErrors > 0) await resetProxyHealth();
}

function broadcastHealth(health) {
  chrome.runtime.sendMessage({ type: 'HEALTH_UPDATED', health }).catch(() => {});
}

function runHealthMutation(operation) {
  const task = healthMutationQueue.then(operation);
  healthMutationQueue = task.catch(() => {});
  return task;
}

async function removeSessionRules(ids, token = null) {
  await updateSessionRules({ removeRuleIds: ids }, token);
}

async function updateSessionRules(update, token = null) {
  const task = ruleMutationQueue.then(async () => {
    if (token !== null) assertCurrentOperation(token);
    await chrome.declarativeNetRequest.updateSessionRules(update);
  });
  ruleMutationQueue = task.catch(() => {});
  await task;
}

async function writeLocalState(appState, token = null) {
  await writeLocalValues({ appState }, token);
}

async function writeLocalValues(values, token = null) {
  const task = stateMutationQueue.then(async () => {
    if (token !== null) assertCurrentOperation(token);
    await chrome.storage.local.set(values);
  });
  stateMutationQueue = task.catch(() => {});
  await task;
}

async function recordBackgroundError(message) {
  try {
    await lockTraffic(message);
  } catch {
    // There is no safer fallback if Chrome storage or DNR itself is unavailable.
  }
}

function respondWith(promise, sendResponse) {
  Promise.resolve(promise)
    .then((result) => sendResponse(result?.ok === undefined ? { ok: true, appState: result } : result))
    .catch((error) => sendResponse({ ok: false, error: formatError(error) }));
}

function broadcastState(appState) {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED', appState }).catch(() => {});
}

function normalizeHost(host) {
  return String(host || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
}

function normalizeValidationUrl(value) {
  if (!value) return '';
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function requestPublishedUpdate() {
  try {
    if (typeof chrome.runtime.requestUpdateCheck !== 'function') return;
    await chrome.runtime.requestUpdateCheck();
  } catch {
    // Unpacked developer installs and builds without an update_url cannot use Chrome's updater.
  }
}

function reloadForPublishedUpdate() {
  publishedUpdatePending = false;
  if (typeof chrome.runtime.reload === 'function') chrome.runtime.reload();
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}
