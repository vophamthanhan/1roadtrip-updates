# 1Roadtrip Extension (Chrome MV3)

1Roadtrip Extension is a department workspace sidebar. Its first production module, Proxy Guard, keeps supported web traffic locked until a fixed proxy, request profile, WebRTC protection, and any enabled Deep mode settings are applied.

The Home view is designed as a workspace shell: Proxy Guard and the local Privacy Audit are available now; Department Hub and Workflows are clearly marked as coming soon until their business requirements are defined.

## Security model

- A static declarativeNetRequest rule blocks controllable HTTP, HTTPS, and WebSocket traffic by default.
- Session rules unlock traffic only after Chrome confirms that this extension controls the requested fixed proxy.
- Chrome's implicit loopback bypass is explicitly subtracted with `<-loopback>`, so supported localhost traffic is not silently sent direct.
- `disable_non_proxied_udp` is applied through Chrome's Privacy API to reduce WebRTC IP leaks.
- Proxy authentication is returned only for the configured proxy host and port, with one credential attempt per request.
- Pasting `host:port:username:password` into the host field automatically fills the four proxy fields. Scheme-prefixed, `username:password@host:port`, and bracketed IPv6 forms are also supported.
- Multiple named proxy profiles can be selected, edited, duplicated, deleted, bulk imported, and exported without passwords.
- Credentials are retained per authenticated proxy in `chrome.storage.local` and reused after Chrome restarts. Editing a saved profile only replaces it after Apply succeeds.
- A newer Apply or Lock operation cancels older in-flight work, so a stale operation cannot unlock traffic later.
- Proxy or WebRTC settings being replaced by another extension or policy immediately returns the extension to locked state.
- Runtime proxy errors are counted. Three consecutive errors lock traffic and the Retry action reapplies the current profile; any successful supported request resets the counter.
- Optional Deep mode uses Chrome Debugger Protocol per HTTP(S) tab to synchronize the User-Agent, User-Agent Client Hints, locale, timezone, platform, hardware concurrency, device memory, screen metrics, and color depth.
- Deep mode installs a stable per-profile privacy shield before page scripts run. It reduces common Canvas, WebGL debug renderer, Audio, and local-font fingerprint surfaces without contacting an external service.
- Deep mode derives a stable, private seed from the profile secret and page origin. The same origin remains stable while different origins receive different seeds. The implementation does not expose a `globalThis` marker.
- Deep mode covers OffscreenCanvas, Canvas `toBlob`, WebGL `readPixels`, AudioBuffer copies, media preferences, touch points, WebGPU exposure, optional manual geolocation, and an OS-aware font allowlist.
- Newly created tabs are attached before their first supported navigation when Chrome permits it. Navigations, child targets, service-worker restarts, and Chrome restarts reapply the saved profile.
- If a protected debugger session is unexpectedly detached or a normal web tab cannot be protected, the extension returns to locked state.
- The local audit page groups results as Consistent, Warning, Unsupported by extension, or Possible leak. It reads only local Chrome state and does not perform an external fingerprint request.
- Optional Privacy Lockdown uses the already-declared `privacy` permission to disable network prediction, Topics, and third-party cookies. Location/camera/microphone global controls are intentionally not included because they require an additional sensitive permission.

## Deep mode

Deep mode is opt-in for each saved profile. Enable it in the side panel, pick a ready-made US User-Agent, location, or city+device profile from the dropdowns, or use **Use current** as a safe baseline. You can still edit locale, IANA timezone, platform, CPU threads, memory, screen metrics, and surface protections after a preset is applied. The User-Agent must contain a Chrome or Chromium version and must match the selected operating-system platform. US presets build the User-Agent with this Chrome's version so Deep mode's native consistency check can pass.

Applying the profile performs a consistency audit before traffic is unlocked. A successful result means Chrome accepted the proxy and relevant CDP commands and the saved fields agree with one another. It does not compare the proxy IP with a geographic database because the extension has no built-in third-party endpoint.

Chrome displays a debugging notification while Deep mode is attached. Opening DevTools detaches the extension debugger from that tab; Proxy Guard treats an unexpected detach as a protection failure and locks traffic. Locking manually or applying a non-Deep profile detaches all debugger sessions opened by Proxy Guard.

## Connectivity confirmation

By default, the extension performs local confirmation only. It does not contact an IP-checking or validation service.

An optional validation URL can be entered in the side panel. This URL must be controlled or trusted by the user. When present, the extension requests exactly that HTTP(S) URL through the configured proxy, rejects redirects, omits credentials and referrer information, and unlocks only after a successful HTTP response.

This optional check proves reachability through the configured Chrome proxy route. It reveals the request to the endpoint selected by the user and does not automatically parse or store a public IP.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.
5. Click the extension toolbar icon to open the sidebar.

Saved profiles, credentials, and Deep mode fields are restored automatically after Chrome restarts. Imported proxy lines use `host:port:username:password`; exported JSON intentionally omits passwords.

## Updates

Unpacked developer installs do not auto-update. Published installs do: Chrome checks for a newer package when the browser starts, then the extension reloads and reapplies the saved profile.

- Chrome Web Store (unlisted is enough for a private team): run `npm run package` and upload the zip. See [UPDATE.md](UPDATE.md).
- Self-hosted CRX for company-managed Chrome: set `updates/config.json` to a public GitHub Pages URL, run `npm run release`, and push `updates.xml` plus `1roadtrip-extension.crx`. First install still needs the Web Store or Group Policy; later versions do not. Do not use GitHub Release `latest/download` links as the update URL.

## Development

Run the fast Node unit/integration suite:

```powershell
npm test
```

Run the real-browser E2E suite with the installed Chrome. It launches the unpacked extension with local origin and authenticated proxy servers and performs no external network test:

```powershell
npm run test:e2e
```

Run both suites:

```powershell
npm run test:all
```

Build a clean Chrome Web Store ZIP without generated metadata, test files, or image-generation intermediates:

```powershell
npm run package
```

Build a self-hosted update package (`updates.xml` + CRX) after creating `updates/config.json`:

```powershell
npm run release
```

The output is written to `dist/proxy-guard-sidebar-<version>.zip`.

## Important limitations

- Chrome extensions cannot control every browser-internal connection or page, including `chrome://`, browser update/sync traffic, and other protected browser requests.
- Without Deep mode, a custom User-Agent changes only the outgoing request header. With Deep mode, supported HTTP(S) tabs receive the synchronized profile described above.
- Deep mode cannot change Chromium's TLS/HTTP2 fingerprint, installed browser engine, native codecs, GPU driver, operating-system network stack, or protected `chrome://` pages.
- JavaScript surface protection is a privacy tradeoff, not an invisibility guarantee. Sites can detect modified APIs, and strict Canvas, Audio, WebGL, or font behavior can affect some applications.
- Chrome Debugger Protocol includes experimental commands whose behavior can change between Chrome releases. This build requires Chrome 125 or later and is tested against the locally installed Chrome during development.
- The extension intentionally does not request `cookies`, `contentSettings`, `browsingData`, or session-token access. Website login sessions remain controlled by Chrome and the websites' own authentication flows.
- Local confirmation proves Chrome retained the proxy configuration, not that the proxy is reachable. Use a validation URL you control if reachability must be checked.
- WebRTC leak protection trades some media connectivity options for privacy and may affect applications that require direct UDP.
- The configured proxy and any optional validation endpoint are external parties selected by the user. The extension has no built-in analytics, telemetry, CDN, remote script, or validation service.
- Chrome extension storage is not a dedicated encrypted password vault. Anyone with sufficient access to the Chrome profile or extension context may be able to read the saved proxy credential.

See [PRIVACY.md](PRIVACY.md) for data handling and permission justifications.
