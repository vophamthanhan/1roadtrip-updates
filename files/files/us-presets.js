(function exposeUsPresets(globalScope) {
  const LOCALES = Object.freeze([
    { id: 'en-US', label: 'English (United States) — en-US' },
    { id: 'es-US', label: 'Spanish (United States) — es-US' },
    { id: 'en', label: 'English — en' }
  ]);

  const TIMEZONES = Object.freeze([
    { id: 'America/New_York', label: 'Eastern — America/New_York', region: 'Eastern' },
    { id: 'America/Detroit', label: 'Eastern (Detroit) — America/Detroit', region: 'Eastern' },
    { id: 'America/Indiana/Indianapolis', label: 'Eastern (Indiana) — America/Indiana/Indianapolis', region: 'Eastern' },
    { id: 'America/Chicago', label: 'Central — America/Chicago', region: 'Central' },
    { id: 'America/Denver', label: 'Mountain — America/Denver', region: 'Mountain' },
    { id: 'America/Phoenix', label: 'Arizona — America/Phoenix', region: 'Mountain' },
    { id: 'America/Los_Angeles', label: 'Pacific — America/Los_Angeles', region: 'Pacific' },
    { id: 'America/Anchorage', label: 'Alaska — America/Anchorage', region: 'Alaska' },
    { id: 'Pacific/Honolulu', label: 'Hawaii — Pacific/Honolulu', region: 'Hawaii' },
    { id: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico) — America/Puerto_Rico', region: 'Atlantic' }
  ]);

  const LOCATIONS = Object.freeze([
    { id: 'eastern', kind: 'region', label: 'Eastern Time (generic)', timezone: 'America/New_York', locale: 'en-US', region: 'US time zones' },
    { id: 'central', kind: 'region', label: 'Central Time (generic)', timezone: 'America/Chicago', locale: 'en-US', region: 'US time zones' },
    { id: 'mountain', kind: 'region', label: 'Mountain Time (generic)', timezone: 'America/Denver', locale: 'en-US', region: 'US time zones' },
    { id: 'arizona', kind: 'region', label: 'Arizona (no DST)', timezone: 'America/Phoenix', locale: 'en-US', region: 'US time zones' },
    { id: 'pacific', kind: 'region', label: 'Pacific Time (generic)', timezone: 'America/Los_Angeles', locale: 'en-US', region: 'US time zones' },
    { id: 'alaska', kind: 'region', label: 'Alaska Time (generic)', timezone: 'America/Anchorage', locale: 'en-US', region: 'US time zones' },
    { id: 'hawaii', kind: 'region', label: 'Hawaii Time (generic)', timezone: 'Pacific/Honolulu', locale: 'en-US', region: 'US time zones' },
    { id: 'atlantic', kind: 'region', label: 'Atlantic Time (Puerto Rico)', timezone: 'America/Puerto_Rico', locale: 'en-US', region: 'US time zones' },

    city('new-york', 'New York, NY', 'Eastern', 'America/New_York', 40.7128, -74.0060),
    city('philadelphia', 'Philadelphia, PA', 'Eastern', 'America/New_York', 39.9526, -75.1652),
    city('boston', 'Boston, MA', 'Eastern', 'America/New_York', 42.3601, -71.0589),
    city('washington-dc', 'Washington, DC', 'Eastern', 'America/New_York', 38.9072, -77.0369),
    city('miami', 'Miami, FL', 'Eastern', 'America/New_York', 25.7617, -80.1918),
    city('orlando', 'Orlando, FL', 'Eastern', 'America/New_York', 28.5383, -81.3792),
    city('tampa', 'Tampa, FL', 'Eastern', 'America/New_York', 27.9506, -82.4572),
    city('atlanta', 'Atlanta, GA', 'Eastern', 'America/New_York', 33.7490, -84.3880),
    city('charlotte', 'Charlotte, NC', 'Eastern', 'America/New_York', 35.2271, -80.8431),
    city('detroit', 'Detroit, MI', 'Eastern', 'America/Detroit', 42.3314, -83.0458),
    city('indianapolis', 'Indianapolis, IN', 'Eastern', 'America/Indiana/Indianapolis', 39.7684, -86.1581),

    city('chicago', 'Chicago, IL', 'Central', 'America/Chicago', 41.8781, -87.6298),
    city('houston', 'Houston, TX', 'Central', 'America/Chicago', 29.7604, -95.3698),
    city('dallas', 'Dallas, TX', 'Central', 'America/Chicago', 32.7767, -96.7970),
    city('austin', 'Austin, TX', 'Central', 'America/Chicago', 30.2672, -97.7431),
    city('nashville', 'Nashville, TN', 'Central', 'America/Chicago', 36.1627, -86.7816),
    city('minneapolis', 'Minneapolis, MN', 'Central', 'America/Chicago', 44.9778, -93.2650),
    city('new-orleans', 'New Orleans, LA', 'Central', 'America/Chicago', 29.9511, -90.0715),

    city('denver', 'Denver, CO', 'Mountain', 'America/Denver', 39.7392, -104.9903),
    city('salt-lake-city', 'Salt Lake City, UT', 'Mountain', 'America/Denver', 40.7608, -111.8910),
    city('phoenix', 'Phoenix, AZ', 'Mountain', 'America/Phoenix', 33.4484, -112.0740),

    city('los-angeles', 'Los Angeles, CA', 'Pacific', 'America/Los_Angeles', 34.0522, -118.2437),
    city('san-francisco', 'San Francisco, CA', 'Pacific', 'America/Los_Angeles', 37.7749, -122.4194),
    city('san-diego', 'San Diego, CA', 'Pacific', 'America/Los_Angeles', 32.7157, -117.1611),
    city('seattle', 'Seattle, WA', 'Pacific', 'America/Los_Angeles', 47.6062, -122.3321),
    city('portland', 'Portland, OR', 'Pacific', 'America/Los_Angeles', 45.5152, -122.6784),
    city('las-vegas', 'Las Vegas, NV', 'Pacific', 'America/Los_Angeles', 36.1699, -115.1398),

    city('anchorage', 'Anchorage, AK', 'Alaska', 'America/Anchorage', 61.2181, -149.9003),
    city('honolulu', 'Honolulu, HI', 'Hawaii', 'Pacific/Honolulu', 21.3069, -157.8583),
    city('san-juan', 'San Juan, PR', 'Atlantic', 'America/Puerto_Rico', 18.4655, -66.1057)
  ]);

  const SCREENS = Object.freeze([
    { id: '1366x768', label: '1366 × 768 — HD laptop', width: 1366, height: 768, scale: 1 },
    { id: '1440x900', label: '1440 × 900 — laptop', width: 1440, height: 900, scale: 1 },
    { id: '1536x864', label: '1536 × 864 — 125% scaling', width: 1536, height: 864, scale: 1.25 },
    { id: '1600x900', label: '1600 × 900', width: 1600, height: 900, scale: 1 },
    { id: '1680x1050', label: '1680 × 1050', width: 1680, height: 1050, scale: 1 },
    { id: '1920x1080', label: '1920 × 1080 — Full HD desktop', width: 1920, height: 1080, scale: 1 },
    { id: '1920x1080-125', label: '1920 × 1080 @ 125% — laptop', width: 1920, height: 1080, scale: 1.25 },
    { id: '1920x1200', label: '1920 × 1200', width: 1920, height: 1200, scale: 1 },
    { id: '2560x1440', label: '2560 × 1440 — QHD desktop', width: 2560, height: 1440, scale: 1 },
    { id: '2560x1600', label: '2560 × 1600 @ 125%', width: 2560, height: 1600, scale: 1.25 },
    { id: '3840x2160', label: '3840 × 2160 — 4K', width: 3840, height: 2160, scale: 1.5 }
  ]);

  const DEVICES = Object.freeze([
    device('desktop-fhd', 'US desktop — 8 threads, 8 GB, 1080p', 8, 8, '1920x1080'),
    device('desktop-qhd', 'US desktop — 12 threads, 8 GB, 1440p', 12, 8, '2560x1440'),
    device('laptop-fhd', 'US laptop — 8 threads, 8 GB, 1080p @ 125%', 8, 8, '1920x1080-125'),
    device('laptop-scaled', 'US laptop — 8 threads, 8 GB, 1536×864 @ 125%', 8, 8, '1536x864'),
    device('laptop-hd', 'US laptop — 4 threads, 4 GB, 1366×768', 4, 4, '1366x768')
  ]);

  const USER_AGENTS = Object.freeze([
    { id: 'chrome-windows', platform: 'Windows', label: 'Chrome on Windows — US desktop' },
    { id: 'chrome-macos', platform: 'macOS', label: 'Chrome on macOS — US desktop' },
    { id: 'chrome-linux', platform: 'Linux', label: 'Chrome on Linux — US desktop' }
  ]);

  const BUNDLES = Object.freeze([
    bundle('nyc-desktop', 'New York desktop — 1080p, Eastern', 'new-york', 'desktop-fhd'),
    bundle('nyc-laptop', 'New York laptop — 1080p @ 125%, Eastern', 'new-york', 'laptop-fhd'),
    bundle('la-desktop', 'Los Angeles desktop — 1080p, Pacific', 'los-angeles', 'desktop-fhd'),
    bundle('la-laptop', 'Los Angeles laptop — 1080p @ 125%, Pacific', 'los-angeles', 'laptop-fhd'),
    bundle('chicago-desktop', 'Chicago desktop — 1080p, Central', 'chicago', 'desktop-fhd'),
    bundle('houston-desktop', 'Houston desktop — 1080p, Central', 'houston', 'desktop-fhd'),
    bundle('dallas-desktop', 'Dallas desktop — 1080p, Central', 'dallas', 'desktop-fhd'),
    bundle('austin-laptop', 'Austin laptop — 1080p @ 125%, Central', 'austin', 'laptop-fhd'),
    bundle('miami-desktop', 'Miami desktop — 1080p, Eastern', 'miami', 'desktop-fhd'),
    bundle('atlanta-desktop', 'Atlanta desktop — 1080p, Eastern', 'atlanta', 'desktop-fhd'),
    bundle('boston-desktop', 'Boston desktop — 1080p, Eastern', 'boston', 'desktop-fhd'),
    bundle('dc-desktop', 'Washington, DC desktop — 1080p, Eastern', 'washington-dc', 'desktop-fhd'),
    bundle('seattle-laptop', 'Seattle laptop — 1080p @ 125%, Pacific', 'seattle', 'laptop-fhd'),
    bundle('sf-laptop', 'San Francisco laptop — 1080p @ 125%, Pacific', 'san-francisco', 'laptop-fhd'),
    bundle('phoenix-desktop', 'Phoenix desktop — 1080p, Arizona', 'phoenix', 'desktop-fhd'),
    bundle('denver-desktop', 'Denver desktop — 1080p, Mountain', 'denver', 'desktop-fhd'),
    bundle('honolulu-desktop', 'Honolulu desktop — 1080p, Hawaii', 'honolulu', 'desktop-fhd')
  ]);

  function city(id, label, region, timezone, latitude, longitude) {
    return Object.freeze({
      id,
      kind: 'city',
      label,
      region,
      timezone,
      locale: 'en-US',
      latitude,
      longitude,
      locationAccuracy: 100
    });
  }

  function device(id, label, hardwareConcurrency, deviceMemory, screenId) {
    const screen = SCREENS.find((item) => item.id === screenId);
    return Object.freeze({
      id,
      label,
      hardwareConcurrency,
      deviceMemory,
      screenId,
      screenWidth: screen.width,
      screenHeight: screen.height,
      deviceScaleFactor: screen.scale,
      colorDepth: 24,
      maxTouchPoints: 0
    });
  }

  function bundle(id, label, locationId, deviceId) {
    return Object.freeze({ id, label, locationId, deviceId });
  }

  function find(list, id) {
    return list.find((item) => item.id === id) || null;
  }

  function chromeVersionFromUserAgent(userAgent) {
    const match = String(userAgent || '').match(/(?:Chrome|Chromium)\/(\d+(?:\.\d+){0,3})/i);
    return match ? match[1] : '';
  }

  function detectPlatformFromUserAgent(userAgent) {
    const value = String(userAgent || '');
    if (/Windows NT/i.test(value)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(value)) return 'macOS';
    if (/Linux|X11/i.test(value)) return 'Linux';
    return '';
  }

  function detectNativePlatform(userAgent, platform) {
    const text = `${userAgent || ''} ${platform || ''}`;
    if (/Mac/i.test(text)) return 'macOS';
    if (/Linux/i.test(text)) return 'Linux';
    return 'Windows';
  }

  function buildUserAgent(platform, chromeVersion) {
    const version = String(chromeVersion || '').trim();
    if (!version) return '';
    if (platform === 'macOS') {
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
    }
    if (platform === 'Linux') {
      return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
    }
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  }

  function matchUserAgentPreset(userAgent, chromeVersion) {
    const version = chromeVersion || chromeVersionFromUserAgent(userAgent);
    if (!version) return 'custom';
    const match = USER_AGENTS.find((item) => buildUserAgent(item.platform, version) === String(userAgent || '').trim());
    return match ? match.id : 'custom';
  }

  function matchLocale(value) {
    return LOCALES.some((item) => item.id === value) ? value : 'custom';
  }

  function matchTimezone(value) {
    return TIMEZONES.some((item) => item.id === value) ? value : 'custom';
  }

  function almostEqual(left, right) {
    return Math.abs(Number(left) - Number(right)) < 0.0001;
  }

  function matchLocation(input = {}) {
    const cityMatch = LOCATIONS.find((item) => item.kind === 'city'
      && almostEqual(item.latitude, input.latitude)
      && almostEqual(item.longitude, input.longitude));
    if (cityMatch) return cityMatch.id;
    const regionMatch = LOCATIONS.find((item) => item.kind === 'region'
      && item.timezone === input.timezone
      && item.locale === (input.locale || 'en-US'));
    return regionMatch ? regionMatch.id : 'custom';
  }

  function matchCity(input = {}) {
    const cityMatch = LOCATIONS.find((item) => item.kind === 'city'
      && almostEqual(item.latitude, input.latitude)
      && almostEqual(item.longitude, input.longitude));
    return cityMatch ? cityMatch.id : 'custom';
  }

  function matchScreen(input = {}) {
    const match = SCREENS.find((item) => item.width === Number(input.width)
      && item.height === Number(input.height)
      && Number(item.scale) === Number(input.scale));
    return match ? match.id : 'custom';
  }

  function matchDevice(input = {}) {
    const match = DEVICES.find((item) => item.hardwareConcurrency === Number(input.hardwareConcurrency)
      && item.deviceMemory === Number(input.deviceMemory)
      && item.screenWidth === Number(input.screenWidth)
      && item.screenHeight === Number(input.screenHeight)
      && Number(item.deviceScaleFactor) === Number(input.deviceScaleFactor)
      && item.colorDepth === Number(input.colorDepth || 24)
      && Number(input.maxTouchPoints || 0) === 0);
    return match ? match.id : 'custom';
  }

  function matchBundle(input = {}) {
    const match = BUNDLES.find((item) => item.locationId === input.locationId && item.deviceId === input.deviceId);
    return match ? match.id : 'custom';
  }

  function option(value, label) {
    return { value, label };
  }

  function userAgentGroups(nativePlatform) {
    const matching = USER_AGENTS.filter((item) => item.platform === nativePlatform)
      .map((item) => option(item.id, `${item.label} (this device)`));
    const others = USER_AGENTS.filter((item) => item.platform !== nativePlatform)
      .map((item) => option(item.id, item.label));
    return [
      option('custom', 'Custom / current browser'),
      { label: 'This device', options: matching },
      { label: 'Other platforms', options: others }
    ];
  }

  function groupedLocations(kind) {
    const items = kind ? LOCATIONS.filter((item) => item.kind === kind) : LOCATIONS;
    const groups = [];
    const seen = new Map();
    items.forEach((item) => {
      const groupName = item.kind === 'region' ? 'US time zones' : item.region;
      if (!seen.has(groupName)) {
        const group = { label: groupName, options: [] };
        seen.set(groupName, group);
        groups.push(group);
      }
      seen.get(groupName).options.push(option(item.id, item.label));
    });
    return groups;
  }

  function locationGroups() {
    return [option('custom', 'Custom location'), ...groupedLocations()];
  }

  function cityGroups() {
    return [option('custom', 'Custom coordinates'), ...groupedLocations('city')];
  }

  function localeOptions() {
    return [...LOCALES.map((item) => option(item.id, item.label)), option('custom', 'Custom locale')];
  }

  function timezoneOptions() {
    return [...TIMEZONES.map((item) => option(item.id, item.label)), option('custom', 'Custom timezone')];
  }

  function screenOptions() {
    return [option('custom', 'Custom resolution'), ...SCREENS.map((item) => option(item.id, item.label))];
  }

  function deviceOptions() {
    return [option('custom', 'Custom device'), ...DEVICES.map((item) => option(item.id, item.label))];
  }

  function bundleOptions() {
    return [option('custom', 'Choose a US profile to fill fields'), ...BUNDLES.map((item) => option(item.id, item.label))];
  }

  function summarize(parts) {
    return parts.filter(Boolean).join(' · ');
  }

  const api = Object.freeze({
    locales: LOCALES,
    timezones: TIMEZONES,
    locations: LOCATIONS,
    screens: SCREENS,
    devices: DEVICES,
    userAgents: USER_AGENTS,
    bundles: BUNDLES,
    find,
    chromeVersionFromUserAgent,
    detectPlatformFromUserAgent,
    detectNativePlatform,
    buildUserAgent,
    matchUserAgentPreset,
    matchLocale,
    matchTimezone,
    matchLocation,
    matchCity,
    matchScreen,
    matchDevice,
    matchBundle,
    userAgentGroups,
    locationGroups,
    cityGroups,
    localeOptions,
    timezoneOptions,
    screenOptions,
    deviceOptions,
    bundleOptions,
    summarize
  });

  globalScope.UsPresets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
