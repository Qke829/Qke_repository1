// vocab.js - 词汇积累：选词库 → 随机刷词（4选1）→ 展示完整释义 → 记录 + 错词本
let VOCAB = {
  cat: null,
  words: [],
  order: [],       // 随机顺序的索引数组
  pos: 0,
  answered: false,
  chosen: -1,
  history: [],     // 本次会话已刷记录（仅用于当前进度显示）
};

const CAT_NAMES = {
  cet4: '四级词汇', cet6: '六级词汇', tem4: '专四词汇', tem8: '专八词汇',
  ielts: '雅思词汇', toefl: '托福词汇', toefl_highfreq: '托福高频词',
};
const CAT_ICONS = { cet4: '🔤', cet6: '📗', tem4: '🎓', tem8: '🏆', ielts: '🎯', toefl: '🌍', toefl_highfreq: '⚡' };
// 可从错词本跳转 / 直接锁定的全部类别
const VALID_CATS = Object.keys(CAT_NAMES);

function shuffle(arr){
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

async function startCategory(cat, focusWord){
  showLoading('正在加载词库…');
  try{
    const data = await API.vocabWords(cat);
    if(!data.words || !data.words.length) throw new Error('词库为空');
    let order = shuffle(data.words.map((_, i) => i));
    // 从错词本跳转：把目标词排到最前
    if(focusWord){
      const fi = data.words.findIndex(w => w.word.toLowerCase() === focusWord.toLowerCase());
      if(fi >= 0){ order = order.filter(i => i !== fi); order.unshift(fi); }
    }
    VOCAB = { cat, words: data.words, order, pos: 0, answered: false, chosen: -1, history: [] };
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

  app.innerHTML = pageHeader(CAT_NAMES[VOCAB.cat], '选择「全部中文意思」正确的一项')
    + `<div class="vocab-progress-bar"><div class="vocab-progress-fill"></div></div>
       <div class="vocab-progress-text"></div>
       <div class="vocab-quiz-card">
         <div class="vocab-word">${esc(w.word)}</div>
         <div class="vocab-phonetic">${esc(w.phonetic || w.phonetic_uk || '')}</div>
         <div class="vocab-q-title">这个单词的中文意思是？</div>
         <div class="vocab-options" id="vocab-options">
           ${w.options.map((o, i) => `<button class="vocab-option" data-i="${i}"><span class="opt-label">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}
         </div>
         <div class="vocab-nav">
           <button class="btn btn-secondary" id="prev-btn" ${VOCAB.pos === 0 ? 'disabled' : ''}>← 上一词</button>
           <button class="btn btn-primary" id="next-btn" ${VOCAB.answered ? '' : 'disabled'}>${VOCAB.pos === total - 1 ? '完成本轮 ✓' : '下一词 →'}</button>
           <button class="btn btn-ghost" id="back-cats-btn">切换词库</button>
         </div>
         <div id="vocab-result"></div>
       </div>`;

  updateProgress();
  $$('.vocab-option').forEach(btn => btn.onclick = () => onAnswer(parseInt(btn.dataset.i), w, idx));
  $('#prev-btn').onclick = () => { if(VOCAB.pos > 0){ VOCAB.pos--; VOCAB.answered = false; VOCAB.chosen = -1; renderQuestion(); } };
  $('#next-btn').onclick = () => {
    if(VOCAB.pos < VOCAB.words.length - 1){ VOCAB.pos++; VOCAB.answered = false; VOCAB.chosen = -1; renderQuestion(); }
    else { finishRound(); }
  };
  $('#back-cats-btn').onclick = renderCatSelect;

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

function showAnswer(w, chosen, correct){
  $$('.vocab-option').forEach((btn, i) => {
    btn.disabled = true;
    if(i === w.answer) btn.classList.add('is-correct');
    else if(i === chosen) btn.classList.add('is-wrong');
  });
  const collHtml = w.collocations && w.collocations.length
    ? `<div class="vocab-section"><div class="vocab-sec-title">固定搭配</div>${w.collocations.map(c => `<div class="vocab-coll"><b>${esc(c.en)}</b> <span>${esc(c.cn)}</span></div>`).join('')}</div>`
    : '';
  const exHtml = w.examples && w.examples.length
    ? `<div class="vocab-section"><div class="vocab-sec-title">例句</div>${w.examples.map(e => `<div class="vocab-ex"><div class="vocab-ex-en">${esc(e.en)}</div><div class="vocab-ex-cn">${esc(e.cn)}</div></div>`).join('')}</div>`
    : '';
  $('#vocab-result').innerHTML = `<div class="vocab-answer-card ${correct ? 'ok' : 'no'}">
      <div class="vocab-answer-head">${correct ? '✓ 答对了' : '✗ 答错了'}${correct ? '' : ' · 已加入错词本'}</div>
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
           <button class="btn btn-primary" id="again-btn">再刷一轮（重新随机）</button>
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
      <summary><span class="rw-word">${esc(r.word)}</span><span class="rw-phonetic">${esc(r.phonetic || '')}</span><span class="rw-meaning">${esc(r.meaning)}</span><span class="rw-stat">答对 ${r.right || 0}/${r.times || 0}</span></summary>
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
  // ?cat=xxx&word=yyy：从错词本跳转，把该词排最前
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat'), word = params.get('word');
  if(cat && VALID_CATS.includes(cat) && (word || cat === 'toefl_highfreq')){
    startCategory(cat, word);
  } else {
    renderCatSelect();
  }
});
