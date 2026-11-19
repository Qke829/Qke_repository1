// speaking.js - 口语训练：列表 + 话题卡（用户自行切换完成状态）
const app = document.getElementById('app');

async function init(){
  await Record.loadAll();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if(id){ await renderDetail(parseInt(id)); }
  else { await renderList(); }
}

async function renderList(){
  app.innerHTML = pageHeader('口语训练','雅思 Part 1/2/3 真题模拟 · 自行标记完成状态');
  try{
    const list = await API.speakingList();
    if(!list.length){ app.innerHTML += '<div class="empty-hint">暂无口语题目</div>'; return; }
    // 筛选条
    const parts = ['全部','Part 1','Part 2','Part 3'];
    const bar = el('div','filter-bar');
    parts.forEach((p,i)=>{
      const chip = el('span','filter-chip'+(i===0?' active':''), p);
      chip.onclick = ()=>{
        $$('.filter-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        renderItems(p);
      };
      bar.appendChild(chip);
    });
    app.appendChild(bar);
    const wrap = el('div','item-list');
    wrap.id = 'items';
    app.appendChild(wrap);
    renderItems('全部');

    function renderItems(part){
      wrap.innerHTML = '';
      const done = Record.all('speaking');
      list.forEach((it,i)=>{
        if(part!=='全部' && it.part!==part) return;
        const d = done[it.id] || done[String(it.id)] || {completed:false};
        const row = el('div', 'item-row '+(d.completed?'done':'undone'));
        row.innerHTML = `
          <div class="item-num">No.${String(i+1).padStart(2,'0')}</div>
          <div class="item-main">
            <div class="item-title">${it.part} · ${it.topic}</div>
            <div class="item-meta">${it.category||''}</div>
          </div>
          <span class="status-badge ${d.completed?'status-done':'status-undone'}">${d.completed?'已完成':'未完成'}</span>`;
        row.onclick = ()=>{ location.href = `/Qke_repository1/ielts/pages/speaking.html?id=${it.id}`; };
        wrap.appendChild(row);
      });
    }
  }catch(e){ app.innerHTML += `<div class="empty-hint">加载失败：${e.message}</div>`; }
}

async function renderDetail(id){
  try{
    const it = await API.speakingDetail(id);
    app.innerHTML = pageHeader('口语训练', `${it.part} · ${it.category||''}`);
    const card = el('div','topic-card');
    const rec = Record.get('speaking', id);
    card.innerHTML = `
      <div class="topic-head">
        <span class="topic-part">${it.part}</span>
        <div class="topic-h">${it.topic}</div>
      </div>
      <div class="topic-body">${it.prompt.replace(/\n/g,'<br>')}</div>
      ${it.follow_up?`<div style="margin-top:16px"><strong>延伸问题：</strong><div class="topic-body" style="margin-top:6px">${it.follow_up.replace(/\n/g,'<br>')}</div></div>`:''}
      <div class="topic-tips"><strong>答题建议：</strong>${it.tips.replace(/\n/g,'<br>')}</div>
      <div class="topic-actions">
        <label class="toggle-switch">
          <input type="checkbox" id="done-toggle" ${rec.completed?'checked':''}>
          <span class="toggle-slider"></span>
          <span id="done-label">${rec.completed?'已完成':'标记为已完成'}</span>
        </label>
        <a class="btn btn-outline" href="/pages/speaking.html">← 返回列表</a>
      </div>`;
    app.appendChild(card);
    document.getElementById('done-toggle').onchange = async function(){
      const done = await Record.toggleCompleted('speaking', id);
      document.getElementById('done-label').textContent = done?'已完成':'标记为已完成';
    };
  }catch(e){ app.innerHTML = pageHeader('口语训练')+`<div class="empty-hint">加载失败：${e.message}</div>`; }
}

init();
