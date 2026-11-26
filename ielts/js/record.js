// record.js - 学习记录管理：本地服务器持久化优先 + localStorage 兜底
// 只要本机 8765 服务在跑，所有浏览器（微信内置/Edge/Chrome）读写同一份记录；
// 服务没跑时自动降级为 localStorage，数据不丢。两边数据按 updated_at 新者胜合并。
const Record = {
  _srv: 'http://127.0.0.1:8765',
  _modules: ['listening', 'reading', 'speaking', 'writing', 'wrongbook', 'vocab', 'wrongwords'],
  _cache: {},
  _loaded: false,
  _srvOk: null, // null=未知 true=可用 false=不可用

  _key(module){ return `ielts_progress_${module}`; },
  _lsRead(module){
    try{ return JSON.parse(localStorage.getItem(this._key(module))) || {}; }
    catch{ return {}; }
  },
  _lsWrite(module, data){
    try{ localStorage.setItem(this._key(module), JSON.stringify(data)); }
    catch(e){ console.warn('localStorage 写入失败', e); }
  },

  // 页面初始化时调用一次：拉取服务器记录并与本地合并
  async loadAll(){
    if(this._loaded) return;
    const local = {};
    this._modules.forEach(m => { local[m] = this._lsRead(m); });
    let server = null;
    try{
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(this._srv + '/api/progress', { signal: ctrl.signal });
      clearTimeout(timer);
      if(r.ok){ server = await r.json(); this._srvOk = true; }
      else { this._srvOk = false; }
    }catch(e){ this._srvOk = false; }

    const merged = {};
    this._modules.forEach(m => {
      const s = (server && server[m]) || {};
      const l = local[m] || {};
      const mm = Object.assign({}, s);
      Object.keys(l).forEach(k => {
        const sv = s[k], lv = l[k];
        if(!sv) { mm[k] = lv; return; }               // 服务器没有 → 用本地
        if(!lv) return;                                // 本地没有 → 用服务器
        mm[k] = ((lv.updated_at || 0) > (sv.updated_at || 0)) ? lv : sv; // 新者胜
      });
      merged[m] = mm;
    });
    this._cache = merged;
    this._loaded = true;
  },

  all(module){ return this._cache[module] || {}; },
  get(module, id){
    const all = this.all(module);
    return all[String(id)] || { completed:false, answers:{} };
  },

  async _save(module, id, rec){
    rec.updated_at = Date.now();
    const all = this.all(module);
    all[String(id)] = rec;
    this._cache[module] = all;
    this._lsWrite(module, all); // 先落 localStorage 兜底
    if(this._srvOk !== false){
      try{
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        await fetch(this._srv + '/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module, id: String(id), record: rec }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        this._srvOk = true;
      }catch(e){ this._srvOk = false; }
    }
  },

  async _remove(module, id){
    const all = this.all(module);
    delete all[String(id)];
    this._cache[module] = all;
    this._lsWrite(module, all);
    if(this._srvOk !== false){
      try{
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        await fetch(this._srv + '/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module, id: String(id), record: null }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        this._srvOk = true;
      }catch(e){ this._srvOk = false; }
    }
  },

  // 听力/阅读：提交时一次保存全部结果（答案 + 得分 + 提交标记 + 完成状态）
  async setSubmitted(module, id, answers, score, total){
    await this._save(module, id, {
      completed: true, submitted: true,
      answers, score, total,
    });
  },
  // 口语/写作：用户自行切换完成状态
  async toggleCompleted(module, id){
    const rec = Object.assign({ completed:false, answers:{} }, this.get(module, id));
    rec.completed = !rec.completed;
    if(!rec.answers) rec.answers = {};
    await this._save(module, id, rec);
    return rec.completed;
  },
  // 重做：清空该条记录
  async reset(module, id){
    await this._remove(module, id);
  },
  // 统计完成数
  countDone(module){
    return Object.values(this.all(module)).filter(x => x.completed).length;
  },

  // ===== 错题本（显式存储：不随重做消失，答对标记「已解决」，可手动删除）=====
  // wrongList: [{qi, userAns, correctAns, wrong}] —— 听力/阅读提交时调用
  async syncWrong(module, id, wrongList){
    for(const w of wrongList){
      const key = `${module}_${id}_${w.qi}`;
      const prev = this.all('wrongbook')[key];
      if(w.wrong){
        // 错了 → 新建或更新条目（保留首次做错时间 first_at，用于排序）
        await this._save('wrongbook', key, {
          module, itemId: String(id), qi: w.qi,
          userAns: Array.isArray(w.userAns) ? [...w.userAns].sort() : (w.userAns || ''),
          correctAns: w.correctAns,
          resolved: false,
          first_at: prev ? (prev.first_at || prev.updated_at) : Date.now(),
        });
      } else if(prev && !prev.resolved){
        // 重做答对且此前记过错 → 标记「已解决」（不删除）
        await this._save('wrongbook', key, Object.assign({}, prev, { resolved: true, userAns: w.userAns }));
      }
    }
  },
  // 手动删除一条错题
  async removeWrong(key){
    await this._remove('wrongbook', key);
  },

  // ===== 词汇积累 =====
  // 学习记录：每个词一条，保存最近一次作答 + 累计次数/答对次数
  async vocabLearn(category, word, detail, correct){
    const key = `${category}_${word}`;
    const prev = this.all('vocab')[key] || {};
    await this._save('vocab', key, {
      category, word,
      phonetic: detail.phonetic || '',
      meaning: detail.meaning || '',
      collocations: detail.collocations || [],
      examples: detail.examples || [],
      correct,
      times: (prev.times || 0) + 1,
      right: (prev.right || 0) + (correct ? 1 : 0),
      last_at: Date.now(),
    });
  },
  // 错词本：选错自动加入，重做答对标记已解决，可手动删除（仿错题本）
  async syncWrongWord(category, word, detail, isWrong){
    const key = `${category}_${word}`;
    const prev = this.all('wrongwords')[key];
    if(isWrong){
      await this._save('wrongwords', key, {
        category, word,
        phonetic: detail.phonetic || '',
        meaning: detail.meaning || '',
        collocations: detail.collocations || [],
        examples: detail.examples || [],
        resolved: false,
        first_at: prev ? (prev.first_at || prev.updated_at) : Date.now(),
      });
    } else if(prev && !prev.resolved){
      await this._save('wrongwords', key, Object.assign({}, prev, { resolved: true }));
    }
  },
  async removeWrongWord(key){
    await this._remove('wrongwords', key);
  },

  // 批量保存：合并进缓存 + 一次 localStorage 写入，再逐条同步服务器（服务在时）
  async _saveMany(module, entries){
    const ids = Object.keys(entries);
    if(!ids.length) return;
    const all = this.all(module);
    const now = Date.now();
    ids.forEach(id => { entries[id].updated_at = now; all[id] = entries[id]; });
    this._cache[module] = all;
    this._lsWrite(module, all);
    if(this._srvOk !== false){
      await Promise.all(ids.map(id =>
        fetch(this._srv + '/api/progress', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module, id: String(id), record: entries[id] }),
        }).catch(() => { this._srvOk = false; })
      ));
    }
  },

  // 批量标为「已学习」：只新建没有记录的词；已有记录（答过题/在错词本）原样保留
  async vocabMarkLearned(category, words){
    const all = this.all('vocab');
    const entries = {}; let skipped = 0;
    for(const w of words){
      const key = `${category}_${w.word}`;
      if(all[key]){ skipped++; continue; }
      entries[key] = {
        category, word: w.word,
        phonetic: w.phonetic || '', meaning: w.meaning || '',
        collocations: w.collocations || [], examples: w.examples || [],
        correct: null, manual: true,
        times: 0, right: 0, last_at: Date.now(),
      };
    }
    await this._saveMany('vocab', entries);
    return { marked: Object.keys(entries).length, skipped };
  },

  // 批量加入错词本：已有条目保持原状态（已解决的不被重置回未解决）
  async addWrongWords(category, words){
    const all = this.all('wrongwords');
    const entries = {}; let skipped = 0;
    for(const w of words){
      const key = `${category}_${w.word}`;
      if(all[key]){ skipped++; continue; }
      entries[key] = {
        category, word: w.word,
        phonetic: w.phonetic || '', meaning: w.meaning || '',
        collocations: w.collocations || [], examples: w.examples || [],
        resolved: false, manual: true, first_at: Date.now(),
      };
    }
    await this._saveMany('wrongwords', entries);
    return { added: Object.keys(entries).length, skipped };
  },
};

// 判定一道题是否做错（单选：字符串比较；多选：排序后数组比较）
function ansIsWrong(correctAns, ua){
  const c = Array.isArray(correctAns) ? [...correctAns].sort() : correctAns;
  const u = Array.isArray(ua) ? [...ua].sort() : (ua || '');
  if(Array.isArray(c)) return JSON.stringify(u) !== JSON.stringify(c);
  return u !== c;
}
