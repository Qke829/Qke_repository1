// listening.js - 听力训练：列表 + 详情（播放器+倍速+题目+答案解析）
// 提交结果（答案+得分+解析界面）会持久化；重开已完成的题自动还原提交后界面
const app = document.getElementById('app');

async function init(){
  await Record.loadAll();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if(id){ await renderDetail(parseInt(id)); }
  else { await renderList(); }
}

async function renderList(){
  app.innerHTML = pageHeader('听力训练','TED 演讲精听 · 倍速调节 · 每篇 4 题（3 单选 + 1 多选）');
  try{
    const list = await API.listeningList();
    if(!list.length){ app.innerHTML += '<div class="empty-hint">暂无听力内容</div>'; return; }
    const done = Record.all('listening');
    const wrap = el('div','item-list');
    list.forEach((it,i)=>{
      const d = done[it.id] || done[String(it.id)] || {completed:false};
      const row = el('div', 'item-row '+(d.completed?'done':'undone'));
      row.innerHTML = `
        <div class="item-num">No.${String(i+1).padStart(2,'0')}</div>
        <div class="item-main">
          <div class="item-title">${it.title}</div>
          <div class="item-meta">${it.speaker||''} · ${it.duration||''} ${it.category?'· '+it.category:''}</div>
        </div>
        <span class="status-badge ${d.completed?'status-done':'status-undone'}">${d.completed?'已完成':'未完成'}</span>`;
      row.onclick = ()=>{ location.href = `/Qke_repository1/ielts/pages/listening.html?id=${it.id}`; };
      wrap.appendChild(row);
    });
    app.appendChild(wrap);
  }catch(e){ app.innerHTML += `<div class="empty-hint">加载失败：${e.message}</div>`; }
}

async function renderDetail(id){
  try{
    const it = await API.listeningDetail(id);
    app.innerHTML = pageHeader('听力训练', it.speaker+' · '+it.duration);
    const det = el('div','detail-wrap');
    det.innerHTML = `
      <div class="detail-title">${it.title}</div>
      <div class="detail-meta">${it.category||''} · 难度：雅思水平 · ${it.duration||''}</div>
      <div class="audio-player">
        <audio id="player" src="/Qke_repository1/ielts/audio/${it.audio_file}" controls></audio>
        <div class="speed-controls">
          <label>倍速：</label>
          <button class="speed-btn" data-s="0.75">0.75×</button>
          <button class="speed-btn active" data-s="1">1.0×</button>
          <button class="speed-btn" data-s="1.25">1.25×</button>
          <button class="speed-btn" data-s="1.5">1.5×</button>
          <span class="transcript-toggle" id="tr-toggle">显示原文 ▾</span>
        </div>
      </div>
      <div class="transcript-box" id="transcript">${(it.transcript||'').replace(/</g,'&lt;')}</div>
      <div id="questions"></div>
      <div style="margin-top:24px;text-align:center">
        <button class="btn btn-primary" id="submit-btn">提交答案</button>
      </div>
      <div id="result"></div>`;
    app.appendChild(det);

    // 倍速
    const player = document.getElementById('player');
    $$('.speed-btn').forEach(b=>{
      b.onclick = ()=>{
        player.playbackRate = parseFloat(b.dataset.s);
        $$('.speed-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    // transcript
    const trBox = document.getElementById('transcript');
    document.getElementById('tr-toggle').onclick = ()=>{
      trBox.classList.toggle('show');
      document.getElementById('tr-toggle').textContent = trBox.classList.contains('show')?'隐藏原文 ▴':'显示原文 ▾';
    };

    // 渲染题目
    const qWrap = document.getElementById('questions');
    it.questions.forEach((q,qi)=>{
      const block = el('div','question-block');
      const typeTag = q.type==='multiple'?'多选':'单选';
      block.innerHTML = `
        <div class="q-title">第 ${qi+1} 题<span class="q-type-tag">${typeTag}</span></div>
        <div style="margin-bottom:10px">${q.question}</div>
        <div class="q-options" id="q-${qi}"></div>
        <div class="explanation" id="ex-${qi}"><strong>解析：</strong>${q.explanation}<br><strong>正确答案：</strong><span class="ans-${qi}"></span></div>`;
      qWrap.appendChild(block);
      const optWrap = block.querySelector(`#q-${qi}`);
      q.options.forEach((opt,oi)=>{
        const letter = String.fromCharCode(65+oi);
        const inp = q.type==='multiple'
          ? `<input type="checkbox" name="q${qi}" value="${letter}">`
          : `<input type="radio" name="q${qi}" value="${letter}">`;
        const o = el('label','q-option',`${inp}<span class="q-option-text">${letter}. ${opt}</span>`);
        optWrap.appendChild(o);
      });
    });

    // 判分 + 标色 + 解析 + 结果框（persist=false 用于还原历史提交，不重复落盘）
    function gradeAndShow(answers, persist){
      let correct = 0;
      it.questions.forEach((q,qi)=>{
        const ex = document.getElementById(`ex-${qi}`);
        ex.classList.add('show');
        const correctAns = Array.isArray(q.answer)?[...q.answer].sort():q.answer;
        const userAns = answers[qi];
        const isRight = Array.isArray(correctAns)
          ? JSON.stringify(userAns)===JSON.stringify(correctAns)
          : userAns===correctAns;
        if(isRight) correct++;
        const opts = $$(`#q-${qi} .q-option`);
        opts.forEach((optEl,oi)=>{
          const letter = String.fromCharCode(65+oi);
          optEl.classList.remove('selected','correct','wrong');
          const shouldCorrect = Array.isArray(correctAns)?correctAns.includes(letter):letter===correctAns;
          const userPicked = Array.isArray(userAns)?userAns.includes(letter):letter===userAns;
          if(shouldCorrect) optEl.classList.add('correct');
          else if(userPicked) optEl.classList.add('wrong');
        });
        const ansSpan = ex.querySelector(`.ans-${qi}`);
        ansSpan.textContent = Array.isArray(correctAns)?correctAns.join(', '):correctAns;
      });
      const total = it.questions.length;
      document.getElementById('result').innerHTML = `
        <div class="result-box">
          <div class="score">${correct} / ${total}</div>
          <div style="margin-top:6px;color:#166534">本题已自动标记为「已完成」</div>
          <button class="btn btn-outline" id="redo-btn" style="margin-top:14px">重做本篇</button>
        </div>`;
      const sb = document.getElementById('submit-btn');
      sb.disabled = true;
      sb.textContent = '已提交';
      document.getElementById('redo-btn').onclick = async ()=>{
        await Record.reset('listening', id);
        location.reload();
      };
      if(persist){
        Record.setSubmitted('listening', id, answers, correct, total);
      }
      return correct;
    }

    // 提交
    document.getElementById('submit-btn').onclick = ()=>{
      const answers = {};
      let allAnswered = true;
      it.questions.forEach((q,qi)=>{
        if(q.type==='multiple'){
          const checked = $$(`input[name="q${qi}"]:checked`).map(x=>x.value).sort();
          answers[qi] = checked;
          if(!checked.length) allAnswered = false;
        }else{
          const checked = document.querySelector(`input[name="q${qi}"]:checked`);
          answers[qi] = checked?checked.value:'';
          if(!checked) allAnswered = false;
        }
      });
      if(!allAnswered){
        if(!confirm('还有题目未作答，确定要提交吗？（未作答的题计为错误）')) return;
      }
      gradeAndShow(answers, true);
    };

    // 还原历史提交：已完成且存有答案 → 直接呈现提交后的界面
    const rec = Record.get('listening', id);
    const savedAns = rec.answers || {};
    if(rec.completed && Object.keys(savedAns).length > 0){
      // 先把保存的选项勾上，再走判分还原
      it.questions.forEach((q,qi)=>{
        const ua = savedAns[qi];
        if(q.type==='multiple'){
          (Array.isArray(ua)?ua:[]).forEach(v=>{
            const c = document.querySelector(`input[name="q${qi}"][value="${v}"]`);
            if(c) c.checked = true;
          });
        }else if(ua){
          const c = document.querySelector(`input[name="q${qi}"][value="${ua}"]`);
          if(c) c.checked = true;
        }
      });
      gradeAndShow(savedAns, false);
    }
  }catch(e){ app.innerHTML = pageHeader('听力训练')+`<div class="empty-hint">加载失败：${e.message}</div>`; }
}

init();
