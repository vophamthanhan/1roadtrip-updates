# 1Roadtrip Extension — Privacy Policy

Last updated: August 10, 2026

1Roadtrip Extension does not collect, sell, transmit, or share user data with its developer or with a built-in third-party service. It contains no analytics, telemetry, advertisements, remote scripts, or hardcoded validation endpoint.

Published builds may ask Chrome to check for a newer package when the browser starts. Chrome Web Store installs use Google's update service. Self-hosted installs use only the HTTPS `update_url` chosen by the distributor. That check fetches version metadata and, when a newer package exists, the replacement CRX. It does not send proxy credentials, Deep mode fields, or browsing history.

The optional Update button in the sidebar fetches `latest.json` and listed files only from the distributor's GitHub Pages host. When the user confirms a local folder, those files are written there so a Load unpacked install can be reloaded. The request does not send proxy credentials or profile contents.

## Data stored on the device

Named proxy profiles, proxy scheme, host, port, username, custom User-Agent, optional validation URL, selected/active profile identifiers, health error counters, error descriptions, timestamps, and optional Deep mode settings are stored in `chrome.storage.local`. Deep mode settings include locale, timezone, platform, CPU/memory values, screen metrics, and enabled privacy surfaces. This data remains on the local Chrome profile and is removed when the extension is uninstalled.

Passwords for successfully saved authenticated proxy profiles are stored in `chrome.storage.local` so they can be reused after Chrome restarts. Editing an existing profile replaces its saved values and credential only after Apply succeeds. Deleting the last profile that uses a credential removes that credential. Exported profile JSON never includes passwords.

Chrome extension storage is not a dedicated encrypted password vault. A person or process with sufficient access to the Chrome profile or trusted extension context may be able to read the saved password.

Extension storage is restricted to trusted extension contexts. `chrome.storage.session` is used only to migrate and remove credentials from older extension versions.

## Network disclosure

Normal browsing traffic is routed through the proxy configured by the user after the profile is applied. The proxy provider can observe information normally available to a proxy provider.

No connectivity endpoint is contacted by default. If the user enters an optional validation URL, the extension requests exactly that URL through the configured proxy. The selected endpoint can observe the request and proxy exit address. Redirects and request credentials are disabled for this check.

Deep mode does not send fingerprint values to the developer or to a built-in service. Its consistency audit runs locally. Normal websites can still observe the browser values exposed to them, including the values selected in a Deep mode profile. The profile secret is not included in the audit response or UI profile export.

## Permissions

- `sidePanel`: provides the extension interface.
- `storage`: saves named profile settings, their proxy credentials, and local health status in the Chrome profile.
- `debugger`: when Deep mode is explicitly enabled, attaches to supported web tabs and applies Chrome DevTools Protocol emulation and pre-document privacy settings. It is detached when traffic is locked or Deep mode is disabled.
- `privacy`: also supports the optional Privacy Lockdown settings for network prediction, Topics, and third-party cookie controls.
- `proxy`: applies the user-selected fixed proxy and monitors Chrome-reported proxy errors.
- `privacy`: applies and monitors WebRTC non-proxied UDP protection.
- `declarativeNetRequest`: implements the default traffic lock, User-Agent header rule, and session unlock rules.
- `webRequest` and `webRequestAuthProvider`: responds to authentication challenges from the configured proxy only.
- `<all_urls>`: required for traffic rules, proxy authentication, and a validation URL explicitly supplied by the user.

The extension does not request `cookies`, `contentSettings`, `browsingData`, or any permission intended to export website login sessions or session tokens.

## Limitations

Chrome protects some browser-internal traffic from extension control. Without Deep mode, the extension changes only the HTTP User-Agent header. Deep mode improves consistency on supported web tabs but is not a complete or undetectable browser-fingerprint spoofing system and does not alter transport-layer fingerprints.

For questions about this local prototype, contact the distributor from whom you received the extension.
