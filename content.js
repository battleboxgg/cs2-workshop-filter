(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('appid') && params.get('appid') !== '730') return;

  const currentPage = Number(params.get('p')) || 1;
  const MAX_EXTRA_PAGES = 5;

  let cfg = { ...CS2WF_DEFAULTS };
  const data = new Map();            // publishedfileid -> Item
  let hiddenCount = 0, dimCount = 0, injectedCount = 0;
  let targetCount = 0;               // so viele "gute" Maps soll die Seite zeigen

  const remember = it => { if (it && it.publishedfileid) data.set(String(it.publishedfileid), it); };

  function collect(o, depth = 0) {
    if (depth > 12) return;
    if (typeof o === 'string') {
      if (o.length > 2 && (o[0] === '{' || o[0] === '[') && o.includes('publishedfileid')) {
        try { collect(JSON.parse(o), depth + 1); } catch (e) {}
      }
    } else if (Array.isArray(o)) o.forEach(v => collect(v, depth + 1));
    else if (o && typeof o === 'object') {
      if (o.publishedfileid && o.title !== undefined) remember(o);
      else Object.values(o).forEach(v => collect(v, depth + 1));
    }
  }
  try {
    const el = document.getElementById('valve-ssr-data');
    if (el) collect(JSON.parse(el.textContent));
  } catch (e) {}

  window.addEventListener('message', ev => {
    if (ev.source === window && ev.data && ev.data.source === 'cs2wf') {
      ev.data.items.forEach(remember);
      schedule();
    }
  });

  // --- Fetch result pages (cached): returns parsed document, fills data ---
  const pageCache = new Map();
  function fetchPage(p) {
    if (!pageCache.has(p)) {
      pageCache.set(p, (async () => {
        const u = new URL(location.href);
        u.searchParams.set('p', String(p));
        const html = await (await fetch(u.href, { credentials: 'same-origin' })).text();
        const m = html.match(/id="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/);
        if (m) { try { collect(JSON.parse(m[1])); } catch (e) {} }
        return new DOMParser().parseFromString(html, 'text/html');
      })().catch(e => { console.warn('[cs2wf] fetch failed', p, e); return null; }));
    }
    return pageCache.get(p);
  }

  // --- Duplicates: maps already shown on earlier pages (incl. ones loaded from next pages) ---
  const storeKey = 'cs2wf:' + (() => { const u = new URL(location.href); u.searchParams.delete('p'); return u.search; })();
  const readStore = () => { try { return JSON.parse(sessionStorage.getItem(storeKey)) || {}; } catch (e) { return {}; } };
  const earlier = new Set();
  if (currentPage > 1) {
    const st = readStore();
    for (const pg in st) if (Number(pg) < currentPage) st[pg].forEach(id => earlier.add(id));
  }
  function saveShown() {
    const ids = [...document.querySelectorAll('.cs2wf-card')]
      .filter(c => !c.classList.contains('cs2wf-dup')).map(c => c.dataset.cs2wfId);
    const st = readStore(); st[currentPage] = ids;
    try { sessionStorage.setItem(storeKey, JSON.stringify(st)); } catch (e) {}
  }

  // --- DOM ---
  const LINK = 'a[href*="/sharedfiles/filedetails/?id="]';
  const idOf = a => (a.href.match(/[?&]id=(\d+)/) || [])[1];

  // Card = highest ancestor containing exactly one item ID (independent of CSS class names)
  function cardOf(a) {
    let node = a;
    const stop = a.ownerDocument.body;
    while (node.parentElement && node.parentElement !== stop) {
      const ids = new Set([...node.parentElement.querySelectorAll(LINK)].map(idOf));
      if (ids.size > 1) break;
      node = node.parentElement;
    }
    return node;
  }

  function cardsOf(root) {
    const out = new Map();
    root.querySelectorAll(LINK).forEach(a => {
      const id = idOf(a);
      if (!id || out.has(id)) return;
      const card = cardOf(a);
      if (card.querySelector('img')) out.set(id, card);
    });
    return out;
  }

  function apply(card, id) {
    const it = data.get(id);
    if (!it) return false;
    const r = cs2wfScore(it, cfg);
    card.classList.add('cs2wf-card');
    card.dataset.cs2wfId = id;
    card.classList.remove('cs2wf-hide', 'cs2wf-dim', 'cs2wf-dup');
    card.querySelectorAll('.cs2wf-badge').forEach(b => b.remove());
    if (earlier.has(id) && !card.dataset.cs2wfInjected) card.classList.add('cs2wf-dup');
    if (cfg.enabled) {
      if (r.score >= cfg.hideThreshold) card.classList.add('cs2wf-hide');
      else if (r.score >= cfg.dimThreshold) {
        card.classList.add('cs2wf-dim');
        const b = document.createElement('div');
        b.className = 'cs2wf-badge';
        b.textContent = r.reasons.join(' · ');
        card.appendChild(b);
      }
    }
    card.dataset.cs2wfGood = (r.score < cfg.dimThreshold && !card.classList.contains('cs2wf-dup')) ? '1' : '';
    card.querySelectorAll('.cs2wf-allow').forEach(b => b.remove());
    if (card.classList.contains('cs2wf-dim') && it.creator) {
      const al = document.createElement('div');
      al.className = 'cs2wf-allow';
      al.textContent = '✓ Allow author';
      al.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); allowAuthor(it.creator); });
      card.appendChild(al);
    }
    if (!card.querySelector('.cs2wf-block') && it.creator) {
      const btn = document.createElement('div');
      btn.className = 'cs2wf-block';
      btn.textContent = '⛔ Block author';
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); blockAuthor(it.creator); });
      card.appendChild(btn);
    }
    return true;
  }

  // Kopierte Karten: Steams React-App blendet den Bild-Wrapper (opacity:0) erst nach dem Laden ein – das tun wir selbst
  function fixImages(card, it) {
    card.querySelectorAll('img').forEach(img => {
      img.loading = 'eager';
      for (let el = img; el && el !== card.parentElement; el = el.parentElement) {
        if (getComputedStyle(el).opacity === '0') el.style.setProperty('opacity', '1', 'important');
      }
    });
  }

  let filling = false;
  function scan() {
    const cards = cardsOf(document);
    const missing = [];
    cards.forEach((card, id) => { if (!apply(card, id)) missing.push(id); });

    if (!targetCount && cards.size) targetCount = cards.size;
    if (missing.length && !filling) {
      fetchPage(currentPage).then(() => schedule());
    }
    hiddenCount = document.querySelectorAll('.cs2wf-hide').length;
    dimCount = document.querySelectorAll('.cs2wf-dim').length;
    updateBar();
    if (!missing.length && cfg.enabled) fill();
  }

  // Fill gaps left by hidden maps with the next clean maps from following pages
  let nextExtra = 1;
  async function fill() {
    if (filling) return;
    const good = () => document.querySelectorAll('.cs2wf-card[data-cs2wf-good="1"]').length;
    if (good() >= targetCount) { saveShown(); return; }
    filling = true;
    try {
      while (good() < targetCount && nextExtra <= MAX_EXTRA_PAGES) {
        const doc = await fetchPage(currentPage + nextExtra);
        await new Promise(r => setTimeout(r, 400));
        nextExtra++;
        if (!doc) break;
        const fetched = cardsOf(doc);
        if (!fetched.size) { nextExtra = MAX_EXTRA_PAGES + 1; break; }
        const all = [...document.querySelectorAll('.cs2wf-card')];
        let anchor = all[all.length - 1];
        if (!anchor) break;
        for (const [id, c] of fetched) {
          if (good() >= targetCount) break;
          const it = data.get(id);
          if (!it || document.querySelector(`.cs2wf-card[data-cs2wf-id="${id}"]`)) continue;
          if (cs2wfScore(it, cfg).score >= cfg.dimThreshold) continue;
          const clone = document.importNode(c, true);
          clone.dataset.cs2wfInjected = '1';
          anchor.after(clone);
          apply(clone, id);
          fixImages(clone, it);
          anchor = clone;
          injectedCount++;
        }
      }
    } finally {
      filling = false;
      saveShown();
      hiddenCount = document.querySelectorAll('.cs2wf-hide').length;
      dimCount = document.querySelectorAll('.cs2wf-dim').length;
      updateBar();
    }
  }

  let timer;
  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 150); }

  function allowAuthor(id) {
    if (!cfg.allowedAuthors.includes(id)) cfg.allowedAuthors.push(id);
    chrome.storage.sync.set({ allowedAuthors: cfg.allowedAuthors });
    scan();
  }

  function blockAuthor(id) {
    if (!cfg.blockedAuthors.includes(id)) cfg.blockedAuthors.push(id);
    chrome.storage.sync.set({ blockedAuthors: cfg.blockedAuthors });
    nextExtra = Math.min(nextExtra, MAX_EXTRA_PAGES); // allow the gap to be refilled
    scan();
  }

  // --- Leiste ---
  const bar = document.createElement('div');
  bar.id = 'cs2wf-bar';
  bar.title = 'Click: toggle filter';
  bar.addEventListener('click', () => {
    cfg.enabled = !cfg.enabled;
    chrome.storage.sync.set({ enabled: cfg.enabled });
    scan();
  });
  function updateBar() {
    if (!bar.isConnected) document.body.appendChild(bar);
    bar.classList.toggle('off', !cfg.enabled);
    const txt = cfg.enabled
      ? `🛡 ${hiddenCount} hidden · ${dimCount} dimmed · ${injectedCount} loaded from next pages (click = off)`
      : '🛡 Filter off (click = on)';
    if (bar.textContent !== txt) bar.textContent = txt;
  }

  chrome.storage.sync.get(null, stored => {
    cfg = { ...CS2WF_DEFAULTS, ...stored };
    console.log('[cs2wf] started, items from page:', data.size);
    scan();
    new MutationObserver(muts => { if (muts.some(m => !bar.contains(m.target))) schedule(); }).observe(document.body, { childList: true, subtree: true });
  });
  chrome.storage.onChanged.addListener(ch => {
    for (const k in ch) cfg[k] = ch[k].newValue === undefined ? CS2WF_DEFAULTS[k] : ch[k].newValue;
    scan();
  });
})();
