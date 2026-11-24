// wrongwords.js - 错词本：选错的词自动收集，重做答对标记「已解决」沉底，可手动删除
const app = document.getElementById('app');
const CAT_NAMES = { cet4: '四级', cet6: '六级', tem4: '专四', tem8: '专八', ielts: '雅思', toefl: '托福', toefl_highfreq: '托福高频' };

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtTime(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function init(){
  await Record.loadAll();
  const all = Record.all('wrongwords');
  const entries = Object.keys(all)
    .filter(k => !k.startsWith('_') && all[k])
    .map(k => Object.assign({ key: k }, all[k]));
  // 未解决在前（新→旧），已解决沉底
  entries.sort((a, b) => {
    if(a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return (b.first_at || 0) - (a.first_at || 0);
  });
  const open = entries.filter(e => !e.resolved).length;
  const done = entries.length - open;

  app.innerHTML = pageHeader('错词本', '词汇选错自动收集 · 重做答对标记「已解决」· 可手动删除')
    + `<div class="wrong-summary">
         <div class="ws-item"><span class="ws-num">${open}</span><span class="ws-label">待复习</span></div>
         <div class="ws-item"><span class="ws-num ok">${done}</span><span class="ws-label">已解决</span></div>
       </div>
       <div id="wrong-list"></div>`;
  const list = $('#wrong-list');
  if(!entries.length){
    list.innerHTML = `<div class="empty-hint"><div style="font-size:48px">✅</div><h3>错词本是空的</h3><p>去词汇积累刷题，选错的词会自动收进这里</p></div>`;
    return;
  }
  list.innerHTML = entries.map(e => {
    const coll = (e.collocations || []).map(c => `<div class="vocab-coll"><b>${esc(c.en)}</b> <span>${esc(c.cn)}</span></div>`).join('');
    const exs = (e.examples || []).map(x => `<div class="vocab-ex"><div class="vocab-ex-en">${esc(x.en)}</div><div class="vocab-ex-cn">${esc(x.cn)}</div></div>`).join('');
    return `<div class="wrong-item ${e.resolved ? 'is-resolved' : ''}">
      <div class="wrong-head">
        <div class="wrong-word-block">
          <span class="wrong-word">${esc(e.word)}</span>
          <span class="wrong-phonetic">${esc(e.phonetic || '')}</span>
          <span class="wrong-cat">${CAT_NAMES[e.category] || e.category}</span>
        </div>
        <span class="wrong-status ${e.resolved ? 'resolved' : 'open'}">${e.resolved ? '✓ 已解决' : '● 待复习'}</span>
      </div>
      <div class="wrong-meaning">${esc(e.meaning)}</div>
      ${coll ? `<div class="vocab-section"><div class="vocab-sec-title">固定搭配</div>${coll}</div>` : ''}
      ${exs ? `<div class="vocab-section"><div class="vocab-sec-title">例句</div>${exs}</div>` : ''}
      <div class="wrong-foot">
        <span class="wrong-time">首次错于 ${fmtTime(e.first_at)}</span>
        <div class="wrong-actions">
          <button class="btn btn-jump" data-word="${esc(e.word)}" data-cat="${esc(e.category)}">🔁 重新刷这个词</button>
          <button class="btn btn-del" data-del="${esc(e.key)}">删除</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $$('[data-del]').forEach(btn => btn.onclick = async () => {
    if(!confirm('确定删除这个错词记录吗？')) return;
    await Record.removeWrongWord(btn.dataset.del);
    init();
  });
  $$('[data-word]').forEach(btn => btn.onclick = () => {
    // 带参数跳到词汇页，词汇页会优先刷该词
    location.href = `/Qke_repository1/ielts/pages/vocab.html?cat=${encodeURIComponent(btn.dataset.cat)}&word=${encodeURIComponent(btn.dataset.word)}`;
  });
}

document.addEventListener('DOMContentLoaded', init);
