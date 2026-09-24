/* Browser-only persistence for the synthetic prototype. Never touches the archive or Agent files. */
(() => {
  const prefix = 'dm-prototype:v1:';
  const projectPrefix = key => prefix + 'version:' + encodeURIComponent(key) + ':';
  const settingsKey = prefix + 'settings';
  function keysStartingWith(value) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(value)) keys.push(key);
    }
    return keys;
  }
  function validSnapshot(s) {
    return s && typeof s.model === 'string' && typeof s.generatedAt === 'string' && Number.isInteger(s.count) && s.count >= 0 &&
      s.context && typeof s.context.project === 'string' && s.context.counts && s.context.range && s.context.gaps &&
      typeof s.context.range.start === 'string' && typeof s.context.range.end === 'string' &&
      Array.isArray(s.catalog) && s.catalog.every(a => a && typeof a.id === 'string' && ['claude','codex'].includes(a.source) && typeof a.date === 'string') &&
      s.evidence && typeof s.evidence === 'object' && Object.values(s.evidence).every(x => x && x.session && Array.isArray(x.messages) && x.messages.every(m => m && ['user','assistant','tool'].includes(m.role) && typeof m.text === 'string')) &&
      Array.isArray(s.events) && s.events.length <= 2000 && s.events.every(e => e && ['pending','confirmed','ignored'].includes(e.review) &&
        ['unknown','active','inactive','replaced'].includes(e.applicability) && typeof e.id === 'string' && typeof e.title === 'string' &&
        typeof e.reason === 'string' && typeof e.scope === 'string' && typeof e.date === 'string' && typeof e.quote === 'string' &&
        e.anchor && typeof e.anchor.id === 'string' && ['claude','codex'].includes(e.anchor.source) && typeof e.anchor.date === 'string');
  }
  function list(projectKey) {
    const versions = [], problems = [];
    try {
      for (const key of keysStartingWith(projectPrefix(projectKey))) {
        try {
          const record = JSON.parse(localStorage.getItem(key));
          if (record?.schema !== 1 || record.projectKey !== projectKey || typeof record.id !== 'string' ||
              !Number.isFinite(record.savedAt) || !validSnapshot(record.snapshot)) throw new Error('invalid');
          versions.push(record);
        } catch { problems.push(key); }
      }
      versions.sort((a,b) => a.savedAt - b.savedAt || a.id.localeCompare(b.id));
      return { available: true, versions, corrupt: problems.length };
    } catch { return { available: false, versions: [], corrupt: 0 }; }
  }
  function save(projectKey, snapshot, simulateFailure = false) {
    if (simulateFailure) throw new Error('模拟保存失败；已有版本保持不变。');
    if (!validSnapshot(snapshot)) throw new Error('当前内容未通过保存检查；已有版本保持不变。');
    const state = list(projectKey);
    if (!state.available) throw new Error('当前浏览器不允许本地保存，请保持页面打开后重试。');
    const record = { schema: 1, id: crypto.randomUUID(), savedAt: Math.max(Date.now(), (state.versions.at(-1)?.savedAt || 0) + 1), projectKey, snapshot };
    try {
      // Each complete version has its own key: a new save cannot overwrite an older version.
      localStorage.setItem(projectPrefix(projectKey) + record.id, JSON.stringify(record));
    } catch { throw new Error('浏览器本地空间不可写或容量不足；当前修改仍在页面中，已有版本未被改写。'); }
    return record;
  }
  function settings() {
    try {
      const s = JSON.parse(localStorage.getItem(settingsKey) || '{}');
      return {
        roots: { claude: typeof s.roots?.claude === 'string' ? s.roots.claude : '~/.claude/projects', codex: typeof s.roots?.codex === 'string' ? s.roots.codex : '~/.codex/sessions' },
        model: typeof s.model === 'string' ? s.model : '', configured: s.configured === true
      };
    } catch { return { roots: { claude:'~/.claude/projects', codex:'~/.codex/sessions' }, model:'', configured:false }; }
  }
  function saveSettings(s) {
    const roots = s.roots || {};
    if (['claude','codex'].some(k => typeof roots[k] !== 'string' || !roots[k].trim() || roots[k].length > 500 || /\0/.test(roots[k]))) throw new Error('请填写有效的演示目录，长度不超过 500 字。');
    if (typeof s.model !== 'string' || s.model.length > 80) throw new Error('模型名称最多 80 字。');
    const safe = { roots: { claude:roots.claude.trim(), codex:roots.codex.trim() }, model:s.model.trim(), configured:!!s.configured };
    try { localStorage.setItem(settingsKey, JSON.stringify(safe)); }
    catch { throw new Error('设置未能保存；原有设置保持不变。'); }
  }
  function clear(scope, projectKey) {
    const keys = scope === 'all' ? keysStartingWith(prefix) : scope === 'settings' ? [settingsKey] : keysStartingWith(projectPrefix(projectKey));
    for (const key of keys) localStorage.removeItem(key);
    return keys.length;
  }
  window.MuseumStore = Object.freeze({ list, save, settings, saveSettings, clear, prefix });
})();
