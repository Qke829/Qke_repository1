// writing.js - 写作训练：列表 + 题目卡（用户自行切换完成状态）
const app = document.getElementById('app');

async function init(){
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if(id){ await renderDetail(parseInt(id)); }
  else { await renderList(); }
}

async function renderList(){
  app.innerHTML = pageHeader('写作训练','雅思 Task 1 图表 + Task 2 议论文 · 自行标记完成状态');
  try{
    const list = await API.writingList();
    if(!list.length){ app.innerHTML += '<div class="empty-hint">暂无写作题目</div>'; return; }
    const tasks = ['全部','Task 1','Task 2'];
    const bar = el('div','filter-bar');
    tasks.forEach((t,i)=>{
      const chip = el('span','filter-chip'+(i===0?' active':''), t);
      chip.onclick = ()=>{
        $$('.filter-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        renderItems(t);
      };
      bar.appendChild(chip);
    });
    app.appendChild(bar);
    const wrap = el('div','item-list'); wrap.id='items';
    app.appendChild(wrap);
    renderItems('全部');
    function renderItems(task){
      wrap.innerHTML='';
      const done = Record._read('writing');
      list.forEach((it,i)=>{
        if(task!=='全部' && it.task!==task) return;
        const d = done[it.id] || {completed:false};
        const row = el('div','item-row '+(d.completed?'done':'undone'));
        row.innerHTML = `
          <div class="item-num">No.${String(i+1).padStart(2,'0')}</div>
          <div class="item-main">
            <div class="item-title">${it.task} · ${it.type}</div>
            <div class="item-meta">${it.topic} · ${it.word_limit}词+</div>
          </div>
          <span class="status-badge ${d.completed?'status-done':'status-undone'}">${d.completed?'已完成':'未完成'}</span>`;
        row.onclick = ()=>{ location.href = `/Qke_repository1/ielts/pages/writing.html?id=${it.id}`; };
        wrap.appendChild(row);
      });
    }
  }catch(e){ app.innerHTML += `<div class="empty-hint">加载失败：${e.message}</div>`; }
}

async function renderDetail(id){
  try{
    const it = await API.writingDetail(id);
    app.innerHTML = pageHeader('写作训练', `${it.task} · ${it.type}`);
    const card = el('div','topic-card');
    const rec = Record.get('writing', id);
    card.innerHTML = `
      <div class="topic-head">
        <span class="topic-part">${it.task}</span>
        <div class="topic-h">${it.type}</div>
      </div>
      <div class="topic-body">${it.prompt.replace(/\n/g,'<br>')}</div>
      ${it.chart?`<div style="margin:14px 0;padding:14px;background:#f8fafc;border-radius:8px;font-size:13px">${it.chart.replace(/\n/g,'<br>')}</div>`:''}
      <div class="topic-tips"><strong>写作要求：</strong>不少于 ${it.word_limit} 词 · 建议用时 ${it.time_limit}<br><strong>高分提示：</strong>${it.tips.replace(/\n/g,'<br>')}</div>
      <div class="topic-actions">
        <label class="toggle-switch">
          <input type="checkbox" id="done-toggle" ${rec.completed?'checked':''}>
          <span class="toggle-slider"></span>
          <span id="done-label">${rec.completed?'已完成':'标记为已完成'}</span>
        </label>
        <a class="btn btn-outline" href="/pages/writing.html">← 返回列表</a>
      </div>`;
    app.appendChild(card);
    document.getElementById('done-toggle').onchange = function(){
      const done = Record.toggleCompleted('writing', id);
      document.getElementById('done-label').textContent = done?'已完成':'标记为已完成';
    };
  }catch(e){ app.innerHTML = pageHeader('写作训练')+`<div class="empty-hint">加载失败：${e.message}</div>`; }
}

init();
