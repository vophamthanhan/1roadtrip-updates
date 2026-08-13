(function exposeUpdateFeed(globalScope) {
  const api = Object.freeze({
    baseUrl: 'https://vophamthanhan.github.io/1roadtrip-updates',
    latestPath: '/latest.json',
    filesPrefix: '/files/'
  });
  globalScope.UpdateFeed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
