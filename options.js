const NUM = ['dimThreshold', 'hideThreshold', 'cyrDescMin', 'cyrDescScore'];
const LIST = ['titleKeywords', 'spamPhrases', 'blockedAuthors', 'allowedAuthors'];
const $ = id => document.getElementById(id);

function fill(cfg) {
  NUM.forEach(k => $(k).value = cfg[k]);
  LIST.forEach(k => $(k).value = cfg[k].join('\n'));
}
chrome.storage.sync.get(null, s => fill({ ...CS2WF_DEFAULTS, ...s }));

$('save').onclick = () => {
  const out = {};
  NUM.forEach(k => out[k] = Number($(k).value));
  LIST.forEach(k => out[k] = $(k).value.split('\n').map(x => x.trim()).filter(Boolean));
  chrome.storage.sync.set(out, () => { $('msg').textContent = 'Saved ✓'; });
};
$('reset').onclick = () => chrome.storage.sync.clear(() => { fill(CS2WF_DEFAULTS); $('msg').textContent = 'Reset'; });
