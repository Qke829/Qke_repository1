// vocab.js - 词汇积累：选词库 → 统一顺序刷词（4选1）→ 展示完整释义 → 记录 + 错词本
// 顺序：词库文件本身已是固定随机顺序（全设备一致），前端不再 shuffle；每词带 no 编号
let VOCAB = {
  cat: null,
  words: [],
  order: [],       // 统一顺序的索引数组（= 词库文件顺序）
  pos: 0,
  answered: false,
  chosen: -1,
  history: [],     // 本次会话已刷记录（仅用于回看恢复）
};

const CAT_NAMES = {
  cet4: '四级词汇', cet6: '六级词汇', tem4: '专四词汇', tem8: '专八词汇',
  ielts: '雅思词汇', toefl: '托福词汇', toefl_highfreq: '托福高频词',
};
const CAT_ICONS = { cet4: '🔤', cet6: '📗', tem4: '🎓', tem8: '🏆', ielts: '🎯', toefl: '🌍', toefl_highfreq: '⚡' };
// 可从错词本跳转 / 直接锁定的全部类别
const VALID_CATS = Object.keys(CAT_NAMES);

// 解析编号输入：支持 "150-200"、"3,5,9"、"3 5 150-160" 混写，返回去重排序后的合法编号
function parseSpec(str, max){
  const out = new Set();
  String(str || '').split(/[,，、;；\s]+/).filter(Boolean).forEach(part => {
    const m = part.match(/^(\d+)\s*[-~—～]\s*(\d+)$/);
    if(m){
      let a = parseInt(m[1]), b = parseInt(m[2]);
      if(a > b) [a, b] = [b, a];
      for(let n = a; n <= b; n++) if(n >= 1 && n <= max) out.add(n);
    }else if(/^\d+$/.test(part)){
      const n = parseInt(part);
      if(n >= 1 && n <= max) out.add(n);
    }
  });
  return [...out].sort((a, b) => a - b);
}
// 按编号取词对象（编号 = no，从 1 开始；无 no 时退化为数组位置）
function wordsByNos(nos){
  const byNo = {};
  VOCAB.words.forEach((w, i) => { byNo[w.no || (i + 1)] = w; });
  return nos.map(n => byNo[n]).filter(Boolean);
}

function renderCats(cats){
  const app = $('#app');
  app.innerHTML = pageHeader('词汇积累', '选择词库开始刷词 · 每个词一道四选一 · 答错自动进错词本')
    + `<div class="vocab-cats" id="vocab-cats">
         ${cats.map(c => `<button class="vocab-cat" data-cat="${c.id}">
             <div class="vocab-cat-icon">${CAT_ICONS[c.id] || '📘'}</div>
             <div class="vocab-cat-name">${c.name}</div>
             <div class="vocab-cat-count">${c.total} 词</div>
           </button>`).join('')}
       </div>
       <div class="vocab-record-bar">
         <button class="btn btn-record" id="open-record-btn">📖 学习记录</button>
         <span class="vocab-record-tip" id="record-tip"></span>
       </div>`;
  // 学习记录数量提示
  const all = Record.all('vocab');
  $('#record-tip').textContent = Object.keys(all).length ? `已学 ${Object.keys(all).length} 词` : '还没有学习记录';
  $('#open-record-btn').onclick = renderRecord;
  $$('.vocab-cat').forEach(btn => btn.onclick = () => startCategory(btn.dataset.cat));
}

async function startCategory(cat, focusWord, startNo){
  showLoading('正在加载词库…');
  try{
    const data = await API.vocabWords(cat);
    if(!data.words || !data.words.length) throw new Error('词库为空');
    // 统一固定顺序：直接按文件顺序刷，任何设备一致（父亲 2026-11-26 要求）
    const order = data.words.map((_, i) => i);
    let pos = 0;
    if(startNo){
      const si = data.words.findIndex((w, i) => (w.no || i + 1) === startNo);
      pos = si >= 0 ? si : Math.min(Math.max(startNo - 1, 0), data.words.length - 1);
    }
    // 从错词本跳转：直接定位到该词的位置（统一顺序下无需置顶）
    if(focusWord){
      const fi = data.words.findIndex(w => w.word.toLowerCase() === focusWord.toLowerCase());
      if(fi >= 0) pos = fi;
    }
    VOCAB = { cat, words: data.words, order, pos, answered: false, chosen: -1, history: [] };
    renderQuestion();
  }catch(e){
    $('#app').innerHTML = pageHeader('词汇积累') + `<div class="empty-hint"><p>词库加载失败：${e.message}</p></div>`;
  }
}

// 进度按「累计已学词数 / 词库总数」显示，与学习记录同步（父亲 2026-11-24 要求）
function updateProgress(){
  const total = VOCAB.words.length;
  const learned = Object.values(Record.all('vocab') || {}).filter(v => v.category === VOCAB.cat).length;
  const prog = total ? Math.round(learned / total * 100) : 0;
  const fill = $('.vocab-progress-fill');
  const txt = $('.vocab-progress-text');
  if(fill) fill.style.width = prog + '%';
  if(txt) txt.textContent = `已学 ${learned} / ${total} 词 · ${prog}%`;
}

function renderQuestion(){
  const app = $('#app');
  const idx = VOCAB.order[VOCAB.pos];
  const w = VOCAB.words[idx];
  const total = VOCAB.words.length;
  const no = w.no || (idx + 1);

  app.innerHTML = pageHeader(CAT_NAMES[VOCAB.cat], '选择「全部中文意思」正确的一项')
    + `<div class="vocab-progress-bar"><div class="vocab-progress-fill"></div></div>
       <div class="vocab-progress-text"></div>
       <details class="vocab-tools">
         <summary>🔢 按编号学习 / 批量操作<span class="vt-hint">编号全设备统一</span></summary>
         <div class="vt-body">
           <div class="vt-row"><span class="vt-label">从编号开始</span><input id="vt-start" type="number" min="1" max="${total}" placeholder="1 - ${total}"><button class="btn btn-secondary" id="vt-go-btn">开始刷</button></div>
           <div class="vt-row"><span class="vt-label">批量标已学</span><input id="vt-learn" placeholder="如 150-200 或 3,5,9"><button class="btn btn-secondary" id="vt-learn-btn">标为已学</button></div>
           <div class="vt-row"><span class="vt-label">加入错词本</span><input id="vt-wrong" placeholder="如 150-160 或 3,5,9"><button class="btn btn-secondary" id="vt-wrong-btn">加入错词本</button></div>
           <div class="vt-tip" id="vt-tip">范围含两端（150-200 = 51 词）· 批量操作不会覆盖已有记录</div>
         </div>
       </details>
       <div class="vocab-quiz-card">
         <div class="vocab-word-row"><span class="vocab-no">#${no}</span><span class="vocab-word">${esc(w.word)}</span></div>
         <div class="vocab-phonetic">${esc(w.phonetic || w.phonetic_uk || '')}</div>
         <div class="vocab-q-title">这个单词的中文意思是？</div>
         <div class="vocab-options" id="vocab-options">
           ${w.options.map((o, i) => `<button class="vocab-option" data-i="${i}"><span class="opt-label">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}
         </div>
         <button class="btn btn-idk" id="idk-btn">🙋 我不会（看答案，进错词本）</button>
         <div class="vocab-nav">
           <button class="btn btn-secondary" id="prev-btn" ${VOCAB.pos === 0 ? 'disabled' : ''}>← 上一词</button>
           <button class="btn btn-primary" id="next-btn" ${VOCAB.answered ? '' : 'disabled'}>${VOCAB.pos === total - 1 ? '完成本轮 ✓' : '下一词 →'}</button>
           <button class="btn btn-ghost" id="back-cats-btn">切换词库</button>
         </div>
         <div id="vocab-result"></div>
       </div>`;

  updateProgress();
  $$('.vocab-option').forEach(btn => btn.onclick = () => onAnswer(parseInt(btn.dataset.i), w, idx));
  $('#idk-btn').onclick = () => onIdk(w, idx);
  $('#prev-btn').onclick = () => { if(VOCAB.pos > 0){ VOCAB.pos--; VOCAB.answered = false; VOCAB.chosen = -1; renderQuestion(); } };
  $('#next-btn').onclick = () => {
    if(VOCAB.pos < VOCAB.words.length - 1){ VOCAB.pos++; VOCAB.answered = false; VOCAB.chosen = -1; renderQuestion(); }
    else { finishRound(); }
  };
  $('#back-cats-btn').onclick = renderCatSelect;

  // 工具面板：从编号开始 / 批量已学 / 批量错词本
  $('#vt-go-btn').onclick = () => {
    const n = parseInt($('#vt-start').value);
    if(!n || n < 1 || n > total){ $('#vt-tip').textContent = `请输入 1 - ${total} 之间的编号`; return; }
    startCategory(VOCAB.cat, null, n);
  };
  $('#vt-learn-btn').onclick = async () => {
    const nos = parseSpec($('#vt-learn').value, total);
    if(!nos.length){ $('#vt-tip').textContent = '请输入有效编号或范围，如 150-200'; return; }
    $('#vt-tip').textContent = '正在标记…';
    const r = await Record.vocabMarkLearned(VOCAB.cat, wordsByNos(nos));
    $('#vt-tip').textContent = `✓ 已标记 ${r.marked} 词为已学${r.skipped ? ` · ${r.skipped} 词已有记录，保持原样` : ''}`;
    updateProgress();
  };
  $('#vt-wrong-btn').onclick = async () => {
    const nos = parseSpec($('#vt-wrong').value, total);
    if(!nos.length){ $('#vt-tip').textContent = '请输入有效编号或范围，如 150-160'; return; }
    $('#vt-tip').textContent = '正在加入…';
    const r = await Record.addWrongWords(VOCAB.cat, wordsByNos(nos));
    $('#vt-tip').textContent = `✓ 已把 ${r.added} 词加入错词本${r.skipped ? ` · ${r.skipped} 词已在错词本，状态不变` : ''}`;
  };

  // 若该题已答过（回看上一词），恢复作答状态
  const rec = VOCAB.history.find(h => h.idx === idx);
  if(rec) showAnswer(w, rec.chosen, rec.correct);
}

async function onAnswer(i, w, idx){
  if(VOCAB.answered) return;
  VOCAB.answered = true;
  VOCAB.chosen = i;
  const correct = (i === w.answer);
  VOCAB.history.push({ idx, chosen: i, correct });
  await Record.vocabLearn(VOCAB.cat, w.word, w, correct);
  await Record.syncWrongWord(VOCAB.cat, w.word, w, !correct);
  updateProgress();
  showAnswer(w, i, correct);
}

// 「我不会」：直接显示正确答案，该词进错词本（等同答错，但不错标任何选项）
async function onIdk(w, idx){
  if(VOCAB.answered) return;
  VOCAB.answered = true;
  VOCAB.chosen = -2;
  VOCAB.history.push({ idx, chosen: -2, correct: false });
  await Record.vocabLearn(VOCAB.cat, w.word, w, false);
  await Record.syncWrongWord(VOCAB.cat, w.word, w, true);
  updateProgress();
  showAnswer(w, -2, false);
}

function showAnswer(w, chosen, correct){
  $$('.vocab-option').forEach((btn, i) => {
    btn.disabled = true;
    if(i === w.answer) btn.classList.add('is-correct');
    else if(i === chosen) btn.classList.add('is-wrong');
  });
  const idk = $('#idk-btn');
  if(idk) idk.disabled = true;
  const collHtml = w.collocations && w.collocations.length
    ? `<div class="vocab-section"><div class="vocab-sec-title">固定搭配</div>${w.collocations.map(c => `<div class="vocab-coll"><b>${esc(c.en)}</b> <span>${esc(c.cn)}</span></div>`).join('')}</div>`
    : '';
  const exHtml = w.examples && w.examples.length
    ? `<div class="vocab-section"><div class="vocab-sec-title">例句</div>${w.examples.map(e => `<div class="vocab-ex"><div class="vocab-ex-en">${esc(e.en)}</div><div class="vocab-ex-cn">${esc(e.cn)}</div></div>`).join('')}</div>`
    : '';
  const head = chosen === -2 ? '🙋 我不会 · 已加入错词本'
    : (correct ? '✓ 答对了' : '✗ 答错了 · 已加入错词本');
  $('#vocab-result').innerHTML = `<div class="vocab-answer-card ${correct ? 'ok' : 'no'}">
      <div class="vocab-answer-head">${head}</div>
      <div class="vocab-answer-row"><span class="vocab-ans-label">正确释义</span><span class="vocab-ans-meaning">${esc(w.meaning)}</span></div>
      <div class="vocab-answer-row"><span class="vocab-ans-label">音标</span><span>${esc(w.phonetic || w.phonetic_uk || '—')}</span></div>
      ${collHtml}${exHtml}
    </div>`;
  $('#next-btn').disabled = false;
}

function finishRound(){
  const done = VOCAB.history.length;
  const right = VOCAB.history.filter(h => h.correct).length;
  $('#app').innerHTML = pageHeader('本轮完成 🎉', CAT_NAMES[VOCAB.cat])
    + `<div class="vocab-finish">
         <div class="vocab-finish-score">${right} / ${done}</div>
         <div class="vocab-finish-label">本轮答对（本次会话）</div>
         <div class="vocab-finish-actions">
           <button class="btn btn-primary" id="again-btn">再刷一轮（从头开始）</button>
           <button class="btn btn-secondary" id="record-btn2">查看学习记录</button>
           <button class="btn btn-ghost" id="back-cats-btn2">切换词库</button>
         </div>
       </div>`;
  $('#again-btn').onclick = () => startCategory(VOCAB.cat);
  $('#record-btn2').onclick = renderRecord;
  $('#back-cats-btn2').onclick = renderCatSelect;
}

function renderCatSelect(){
  API.vocabCategories().then(cats => renderCats(Array.isArray(cats) ? cats : (cats.categories || []))).catch(e => {
    $('#app').innerHTML = pageHeader('词汇积累') + `<div class="empty-hint"><p>加载失败：${e.message}</p></div>`;
  });
}

// ===== 学习记录：所有学过的词 + 完整信息 =====
function renderRecord(){
  showLoading('正在读取学习记录…');
  const all = Record.all('vocab');
  const list = Object.values(all).sort((a, b) => (b.last_at || 0) - (a.last_at || 0));
  const app = $('#app');
  if(!list.length){
    app.innerHTML = pageHeader('学习记录', '你学过的所有单词都会显示在这里', '/Qke_repository1/ielts/pages/vocab.html')
      + `<div class="empty-hint"><div style="font-size:48px">📖</div><h3>还没有学习记录</h3><p>先去刷几个词吧～</p></div>`;
    return;
  }
  app.innerHTML = pageHeader('学习记录', `共学过 ${list.length} 个单词 · 按最近学习时间排序`, '/Qke_repository1/ielts/pages/vocab.html')
    + `<div class="vocab-record-list" id="vocab-record-list">
         ${list.map((r, i) => recordItem(r, i)).join('')}
       </div>`;
}

function recordItem(r, i){
  const coll = (r.collocations || []).map(c => `<div class="vocab-coll"><b>${esc(c.en)}</b> <span>${esc(c.cn)}</span></div>`).join('');
  const exs = (r.examples || []).map(e => `<div class="vocab-ex"><div class="vocab-ex-en">${esc(e.en)}</div><div class="vocab-ex-cn">${esc(e.cn)}</div></div>`).join('');
  return `<details class="record-word" ${i === 0 ? 'open' : ''}>
      <summary><span class="rw-word">${esc(r.word)}</span><span class="rw-phonetic">${esc(r.phonetic || '')}</span><span class="rw-meaning">${esc(r.meaning)}</span><span class="rw-stat">${r.manual && !r.times ? '手动标记已学' : `答对 ${r.right || 0}/${r.times || 0}`}</span></summary>
      <div class="record-word-body">
        <div class="rw-line"><span class="rw-label">中文意思</span>${esc(r.meaning)}</div>
        <div class="rw-line"><span class="rw-label">音标</span>${esc(r.phonetic || r.phonetic_uk || '—')}</div>
        ${coll ? `<div class="rw-line"><span class="rw-label">固定搭配</span><div>${coll}</div></div>` : ''}
        ${exs ? `<div class="rw-line"><span class="rw-label">例句</span><div>${exs}</div></div>` : ''}
      </div>
    </details>`;
}

function showLoading(msg){
  $('#app').innerHTML = `<div class="loading">${msg || '加载中…'}</div>`;
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', async () => {
  await Record.loadAll();
  // ?cat=xxx：直接锁定某词库开刷（如 ?cat=toefl_highfreq）
  // ?cat=xxx&word=yyy：从错词本跳转，定位到该词
  // ?cat=xxx&start=150：从编号 150 开始刷
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat'), word = params.get('word');
  const start = parseInt(params.get('start')) || 0;
  if(cat && VALID_CATS.includes(cat) && (word || start || cat === 'toefl_highfreq')){
    startCategory(cat, word, start);
  } else {
    renderCatSelect();
  }
});
