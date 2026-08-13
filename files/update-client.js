(function exposeUpdateClient(globalScope) {
  const HANDLE_DB = '1roadtrip-update';
  const HANDLE_STORE = 'handles';
  const HANDLE_KEY = 'unpackedRoot';

  function compareVersions(left, right) {
    const parse = (value) => String(value || '0').split('.').map((part) => Number.parseInt(part, 10) || 0);
    const a = parse(left);
    const b = parse(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (a[index] || 0) - (b[index] || 0);
      if (delta > 0) return 1;
      if (delta < 0) return -1;
    }
    return 0;
  }

  function assertSafeRelativePath(relativePath) {
    const value = String(relativePath || '').replace(/\\/g, '/').trim();
    if (!value || value.startsWith('/') || value.includes('://') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error('Update file path is not allowed.');
    }
    return value;
  }

  function feedUrl(pathname) {
    const feed = globalScope.UpdateFeed;
    if (!feed?.baseUrl) throw new Error('Update feed is not configured.');
    return `${String(feed.baseUrl).replace(/\/+$/, '')}${pathname}`;
  }

  async function fetchLatest() {
    const response = await fetch(feedUrl(globalScope.UpdateFeed.latestPath), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to read update feed (${response.status}).`);
    const payload = await response.json();
    if (!payload?.version || !Array.isArray(payload.files) || !payload.files.length) {
      throw new Error('Update feed is missing version or files.');
    }
    return {
      version: String(payload.version),
      files: payload.files.map((item) => assertSafeRelativePath(typeof item === 'string' ? item : item?.path))
    };
  }

  async function fetchFileBytes(relativePath) {
    const safePath = assertSafeRelativePath(relativePath);
    const response = await fetch(feedUrl(`${globalScope.UpdateFeed.filesPrefix}${safePath}`), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to download ${safePath} (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }

  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const request = globalScope.indexedDB.open(HANDLE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
          request.result.createObjectStore(HANDLE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readStoredDirectoryHandle() {
    try {
      const db = await openHandleDb();
      const handle = await new Promise((resolve, reject) => {
        const request = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle || null;
    } catch {
      return null;
    }
  }

  async function storeDirectoryHandle(handle) {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  }

  async function ensureWritePermission(handle) {
    const current = await handle.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
    const next = await handle.requestPermission({ mode: 'readwrite' });
    return next === 'granted';
  }

  async function verifyExtensionDirectory(handle) {
    const fileHandle = await handle.getFileHandle('manifest.json');
    const text = await (await fileHandle.getFile()).text();
    const manifest = JSON.parse(text);
    if (manifest?.name !== '1Roadtrip Extension') {
      throw new Error('That folder is not the 1Roadtrip extension. Choose the Load unpacked folder.');
    }
    return manifest;
  }

  async function writeRelativeFile(root, relativePath, bytes) {
    const parts = assertSafeRelativePath(relativePath).split('/');
    let directory = root;
    for (const folder of parts.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(folder, { create: true });
    }
    const fileHandle = await directory.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async function chooseExtensionDirectory() {
    if (typeof globalScope.showDirectoryPicker !== 'function') {
      throw new Error('This Chrome build cannot choose a folder. Update Chrome and try again.');
    }
    return globalScope.showDirectoryPicker({
      id: '1roadtrip-unpacked',
      mode: 'readwrite'
    });
  }

  async function resolveExtensionDirectory() {
    const stored = await readStoredDirectoryHandle();
    if (stored && await ensureWritePermission(stored)) {
      await verifyExtensionDirectory(stored);
      return stored;
    }
    const picked = await chooseExtensionDirectory();
    await verifyExtensionDirectory(picked);
    await storeDirectoryHandle(picked);
    return picked;
  }

  async function applyLatestToDirectory(onProgress) {
    const latest = await fetchLatest();
    const root = await resolveExtensionDirectory();
    let completed = 0;
    for (const relativePath of latest.files) {
      const bytes = await fetchFileBytes(relativePath);
      await writeRelativeFile(root, relativePath, bytes);
      completed += 1;
      onProgress?.({ completed, total: latest.files.length, path: relativePath, version: latest.version });
    }
    return latest;
  }

  const api = Object.freeze({
    compareVersions,
    assertSafeRelativePath,
    fetchLatest,
    applyLatestToDirectory
  });
  globalScope.UpdateClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
