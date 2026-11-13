// Sitewide anonymous visit counter. No cookies, full referrer URLs, query
// strings, addresses, project answers, or other personal data are collected.
(function () {
  var AI = ['chatgpt.com', 'openai.com', 'perplexity.ai', 'copilot.microsoft.com', 'claude.ai', 'gemini.google.com', 'you.com', 'phind.com', 'mistral.ai', 'meta.ai'];
  var SEARCH = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'ecosia.org', 'brave.com', 'yandex.com', 'baidu.com', 'aol.com', 'ask.com'];
  var SOCIAL = ['facebook.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'twitter.com', 'x.com', 'reddit.com', 'youtube.com', 'nextdoor.com', 'pinterest.com', 'threads.net'];
  function matches(host, domains) {
    return domains.some(function (domain) { return host === domain || host.endsWith('.' + domain); });
  }
  function referral() {
    if (!document.referrer) return { source: 'direct', referrer: '' };
    try {
      var url = new URL(document.referrer);
      if (url.origin === location.origin) return { source: 'internal', referrer: '' };
      var host = url.hostname.toLowerCase().replace(/^www\./, '');
      var source = matches(host, AI) ? 'ai' : matches(host, SEARCH) ? 'search' : matches(host, SOCIAL) ? 'social' : 'referral';
      return { source: source, referrer: host };
    } catch (_) {
      return { source: '', referrer: '' };
    }
  }
  try {
    if (sessionStorage.getItem('nhpp-session')) return;
    sessionStorage.setItem('nhpp-session', '1');
    var ref = referral();
    var body = {
      event: 'visit',
      returning: localStorage.getItem('nhpp-visited') === '1',
      source: ref.source,
      referrer: ref.referrer,
      landingPage: location.pathname
    };
    localStorage.setItem('nhpp-visited', '1');
    var data = JSON.stringify(body);
    if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([data], { type: 'application/json' }));
    else fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true }).catch(function () {});
  } catch (_) {}
})();
