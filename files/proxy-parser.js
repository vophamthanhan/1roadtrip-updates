(function exposeProxyParser(globalScope) {
  function parse(value) {
    if (typeof value !== 'string') return null;
    let source = value.trim();
    if (!source) return null;

    let scheme = '';
    const schemeMatch = source.match(/^(https?|socks4|socks5):\/\//i);
    if (schemeMatch) {
      scheme = schemeMatch[1].toLowerCase();
      source = source.slice(schemeMatch[0].length);
    }

    let host = '';
    let portText = '';
    let username = '';
    let password = '';
    const authSeparator = source.lastIndexOf('@');

    if (authSeparator > 0) {
      const credentials = source.slice(0, authSeparator);
      const endpoint = parseEndpoint(source.slice(authSeparator + 1));
      if (!endpoint || endpoint.tail.length) return null;

      const credentialSeparator = credentials.indexOf(':');
      username = credentialSeparator >= 0
        ? credentials.slice(0, credentialSeparator).trim()
        : credentials.trim();
      password = credentialSeparator >= 0 ? credentials.slice(credentialSeparator + 1) : '';
      host = endpoint.host;
      portText = endpoint.portText;
    } else {
      const endpoint = parseEndpoint(source);
      if (!endpoint) return null;
      host = endpoint.host;
      portText = endpoint.portText;
      username = endpoint.tail.shift()?.trim() || '';
      password = endpoint.tail.join(':');
    }

    const port = Number(portText);
    if (!host || /\s/.test(host)) return null;
    if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) return null;

    return { scheme, host, port, username, password };
  }

  function parseEndpoint(source) {
    if (source.startsWith('[')) {
      const closingBracket = source.indexOf(']');
      if (closingBracket < 2 || source[closingBracket + 1] !== ':') return null;
      return {
        host: source.slice(1, closingBracket).trim(),
        portText: source.slice(closingBracket + 2).split(':', 1)[0].trim(),
        tail: source.slice(closingBracket + 2).split(':').slice(1)
      };
    }

    const parts = source.split(':');
    if (parts.length < 2) return null;
    return {
      host: parts.shift().trim(),
      portText: parts.shift().trim(),
      tail: parts
    };
  }

  const api = Object.freeze({ parse });
  globalScope.ProxyInputParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
