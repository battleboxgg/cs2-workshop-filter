// Pure scoring logic (shared with the options page).
const CS2WF_DEFAULTS = {
  enabled: true,
  dimThreshold: 30,
  hideThreshold: 70,
  cyrDescMin: 8,          // min. Cyrillic characters in the description
  cyrDescScore: 70,
  cyrTitleScore: 30,
  spamPhraseScore: 80,
  titleKeywordScore: 15,
  titleKeywordMax: 30,
  newAccountScore: 10,
  newAccountFrom: '76561199700000000',
  titleKeywords: ['models', 'online', 'cheats', 'skins', 'random', 'bhop', 'brainrot', 'walls', 'wars', 'war '],
  spamPhrases: [
    'disable_workshop_command_filtering',
    'auto-?connect',
    'параметры запуска',
    'подключ',
    'connect\\s+\\d{1,3}(\\.\\d{1,3}){3}',
    '\\d{1,3}(\\.\\d{1,3}){3}:\\d{4,5}'
  ],
  blockedAuthors: [],
  allowedAuthors: []
};

function cs2wfScore(item, cfg) {
  const title = String(item.title || '');
  const desc = String(item.short_description || '');
  const author = String(item.creator || '');
  const reasons = [];
  let score = 0;

  if (author && cfg.allowedAuthors.includes(author)) return { score: 0, reasons: ['Author allowed'] };
  if (author && (cfg.blockedAuthors.includes(author) || (typeof CS2WF_SEED !== 'undefined' && CS2WF_SEED.includes(author)))) { score += 100; reasons.push('Author blocked'); }

  const cyr = s => (s.match(/[Ѐ-ӿ]/g) || []).length;
  const cd = cyr(desc);
  if (cd >= cfg.cyrDescMin) { score += cfg.cyrDescScore; reasons.push('Cyrillic description'); }
  if (cyr(title) >= 3) { score += cfg.cyrTitleScore; reasons.push('Cyrillic title'); }

  for (const p of cfg.spamPhrases) {
    try {
      if (new RegExp(p, 'i').test(desc)) { score += cfg.spamPhraseScore; reasons.push('Spam phrase: ' + p); break; }
    } catch (e) {}
  }

  const t = title.toLowerCase() + ' ';
  const hits = cfg.titleKeywords.filter(k => k && t.includes(k.toLowerCase()));
  if (hits.length) {
    score += Math.min(cfg.titleKeywordMax, hits.length * cfg.titleKeywordScore);
    reasons.push('Title: ' + hits.join(', '));
  }

  try {
    if (author && BigInt(author) >= BigInt(cfg.newAccountFrom)) { score += cfg.newAccountScore; reasons.push('new account'); }
  } catch (e) {}

  return { score, reasons };
}
