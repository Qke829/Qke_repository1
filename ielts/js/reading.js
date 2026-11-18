// reading.js - 阅读训练：列表 + 详情（文章+6道单选+答案解析）
const app = document.getElementById('app');

async function init(){
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if(id){ await renderDetail(parseInt(id)); }
  else { await renderList(); }
}

async function renderList(){
  app.innerHTML = pageHeader('阅读训练','外刊精读 · 每篇 6 道单选题 · 雅思难度');
  try{
    const list = await API.readingList();
    if(!list.length){ app.innerHTML += '<div class="empty-hint">暂无阅读内容</div>'; return; }
    const done = Record._read('reading');
    const wrap = el('div','item-list');
    list.forEach((it,i)=>{
      const d = done[it.id] || {completed:false};
      const row = el('div', 'item-row '+(d.completed?'done':'undone'));
      row.innerHTML = `
        <div class="item-num">No.${String(i+1).padStart(2,'0')}</div>
        <div class="item-main">
          <div class="item-title">${it.title}</div>
          <div class="item-meta">${it.source||''} · ${it.word_count||0} 词 ${it.category?'· '+it.category:''}</div>
        </div>
        <span class="status-badge ${d.completed?'status-done':'status-undone'}">${d.completed?'已完成':'未完成'}</span>`;
      row.onclick = ()=>{ location.href = `/Qke_repository1/ielts/pages/reading.html?id=${it.id}`; };
      wrap.appendChild(row);
    });
    app.appendChild(wrap);
  }catch(e){ app.innerHTML += `<div class="empty-hint">加载失败：${e.message}</div>`; }
}

async function renderDetail(id){
  try{
    const it = await API.readingDetail(id);
    app.innerHTML = pageHeader('阅读训练', `${it.source||''} · ${it.word_count||0}词 · ${it.category||''}`);
    const det = el('div','detail-wrap');
    det.innerHTML = `
      <div class="detail-title">${it.title}</div>
      <div class="detail-meta">难度：雅思水平 · 建议阅读时间：15-18 分钟</div>
      <div class="article-body" id="article"></div>
      <div id="questions"></div>
      <div style="margin-top:24px;text-align:center">
        <button class="btn btn-primary" id="submit-btn">提交答案</button>
      </div>
      <div id="result"></div>`;
    app.appendChild(det);
    document.getElementById('article').innerHTML = `<div style="font-size:15px;line-height:2;color:#1f2937">${(it.content||'').replace(/\n/g,'<br>')}</div>`;

    const qWrap = document.getElementById('questions');
    const saved = Record.get('reading', id).answers || {};
    it.questions.forEach((q,qi)=>{
      const block = el('div','question-block');
      block.innerHTML = `
        <div class="q-title">第 ${qi+1} 题<span class="q-type-tag">单选</span></div>
        <div style="margin-bottom:10px">${q.question}</div>
        <div class="q-options" id="q-${qi}"></div>
        <div class="explanation" id="ex-${qi}"><strong>解析：</strong>${q.explanation}<br><strong>正确答案：</strong><span class="ans-${qi}"></span></div>`;
      qWrap.appendChild(block);
      const optWrap = block.querySelector(`#q-${qi}`);
      q.options.forEach((opt,oi)=>{
        const letter = String.fromCharCode(65+oi);
        const inp = `<input type="radio" name="q${qi}" value="${letter}" ${(saved[qi]===letter)?'checked':''}>`;
        const o = el('label','q-option',`${inp}<span class="q-option-text">${letter}. ${opt}</span>`);
        optWrap.appendChild(o);
      });
    });

    document.getElementById('submit-btn').onclick = ()=>{
      const answers = {};
      let allAnswered = true;
      it.questions.forEach((q,qi)=>{
        const checked = document.querySelector(`input[name="q${qi}"]:checked`);
        answers[qi] = checked?checked.value:'';
        if(!checked) allAnswered = false;
      });
      if(!allAnswered){
        if(!confirm('还有题目未作答，确定要提交吗？（未作答的题计为错误）')) return;
      }
      Record.saveAnswers('reading', id, answers);
      let correct = 0;
      it.questions.forEach((q,qi)=>{
        const ex = document.getElementById(`ex-${qi}`);
        ex.classList.add('show');
        if(answers[qi]===q.answer) correct++;
        const opts = $$(`#q-${qi} .q-option`);
        opts.forEach((optEl,oi)=>{
          const letter = String.fromCharCode(65+oi);
          optEl.classList.remove('selected','correct','wrong');
          if(letter===q.answer) optEl.classList.add('correct');
          else if(letter===answers[qi]) optEl.classList.add('wrong');
        });
        ex.querySelector(`.ans-${qi}`).textContent = q.answer;
      });
      Record.setCompleted('reading', id);
      const total = it.questions.length;
      document.getElementById('result').innerHTML = `
        <div class="result-box">
          <div class="score">${correct} / ${total}</div>
          <div style="margin-top:6px;color:#166534">本篇已自动标记为「已完成」</div>
        </div>`;
      document.getElementById('submit-btn').disabled = true;
      document.getElementById('submit-btn').textContent = '已提交';
    };
  }catch(e){ app.innerHTML = pageHeader('阅读训练')+`<div class="empty-hint">加载失败：${e.message}</div>`; }
}

init();
