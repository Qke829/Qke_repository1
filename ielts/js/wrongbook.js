// wrongbook.js - 错题本：从答题记录推导听力/阅读错题，新错题在上，可跳转原题
const app = document.getElementById('app');

// 判定一道题是否做错（单选：字符串比较；多选：排序后数组比较）
function isWrong(q, ua){
  const correctAns = Array.isArray(q.answer) ? [...q.answer].sort() : q.answer;
  const u = Array.isArray(ua) ? [...ua].sort() : (ua || '');
  if(Array.isArray(correctAns)) return JSON.stringify(u) !== JSON.stringify(correctAns);
  return u !== correctAns;
}
function fmtAns(a){ return Array.isArray(a) ? a.join(', ') : a; }
function fmtTime(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function init(){
  await Record.loadAll();
  app.innerHTML = pageHeader('错题本','听力 / 阅读错题自动收集 · 新错题在上面 · 点「跳转原题」可回原篇目');
  const wrap = el('div','wrongbook-wrap');
  app.appendChild(wrap);
  try{
    const mods = [
      {key:'listening', label:'听力', page:'listening', listFn: ()=>API.listeningList(), detailFn: (id)=>API.listeningDetail(id), icon:'🎧'},
      {key:'reading',   label:'阅读', page:'reading',   listFn: ()=>API.readingList(),   detailFn: (id)=>API.readingDetail(id),   icon:'📖'},
    ];
    let totalWrong = 0;
    for(const mod of mods){
      const section = el('div','wrong-section');
      section.innerHTML = `<div class="wrong-section-title">${mod.icon} ${mod.label}错题 <span class="wrong-count" id="count-${mod.key}">…</span></div>`;
      wrap.appendChild(section);
      const listWrap = el('div','item-list');
      section.appendChild(listWrap);
      const countEl = section.querySelector(`#count-${mod.key}`);

      const recs = Record.all(mod.key);
      const recEntries = Object.keys(recs)
        .filter(id => recs[id] && recs[id].completed && recs[id].answers && Object.keys(recs[id].answers).length > 0)
        .map(id => ({ id, rec: recs[id] }))
        .sort((a,b) => (b.rec.updated_at||0) - (a.rec.updated_at||0)); // 新的篇目在上

      if(!recEntries.length){
        countEl.textContent = '0 错';
        listWrap.innerHTML = `<div class="empty-hint">暂无${mod.label}错题，继续保持！做完题提交后，错题会自动收进来。</div>`;
        continue;
      }

      // 篇目号映射（列表顺序 = No.XX）
      const listData = await mod.listFn();
      const noMap = {};
      listData.forEach((it,i)=>{ noMap[it.id] = i+1; });

      let modWrongCount = 0;
      for(const {id, rec} of recEntries){
        let it;
        try{ it = await mod.detailFn(id); }catch(e){ continue; }
        if(!it) continue;
        const no = noMap[id] || id;
        it.questions.forEach((q,qi)=>{
          const ua = rec.answers[qi];
          if(!isWrong(q, ua)) return;
          modWrongCount++;
          totalWrong++;
          const block = el('div','wrong-item');
          // 头部：篇目号 + 题号 + 跳转
          const head = el('div','wrong-head');
          head.innerHTML = `
            <span class="wrong-loc">${mod.label} No.${String(no).padStart(2,'0')} · 第 ${qi+1} 题
              <span class="wrong-src">${it.title||''} · ${fmtTime(rec.updated_at)}</span>
            </span>
            <button class="btn btn-outline btn-jump">跳转原题 ↗</button>`;
          head.querySelector('.btn-jump').onclick = ()=>{ location.href = `/Qke_repository1/ielts/pages/${mod.page}.html?id=${id}`; };
          block.appendChild(head);

          // 题干
          const qt = el('div','wrong-question', q.question);
          block.appendChild(qt);

          // 选项：正确标绿，错选标红（静态展示，不可点）
          const optWrap = el('div','q-options');
          q.options.forEach((opt,oi)=>{
            const letter = String.fromCharCode(65+oi);
            const shouldCorrect = Array.isArray(q.answer) ? q.answer.includes(letter) : letter===q.answer;
            const userPicked = Array.isArray(ua) ? ua.includes(letter) : letter===ua;
            const cls = 'q-option' + (shouldCorrect?' correct':'') + (!shouldCorrect && userPicked?' wrong':'');
            const o = el('label', cls, `<span class="q-letter">${letter}.</span><span class="q-option-text">${opt}</span>`);
            optWrap.appendChild(o);
          });
          block.appendChild(optWrap);

          // 错选 / 正确答案
          const ansLine = el('div','wrong-ansline',
            `<span class="tag-user">你的答案：<b>${fmtAns(ua) || '未作答'}</b></span>` +
            `<span class="tag-right">正确答案：<b>${fmtAns(q.answer)}</b></span>`);
          block.appendChild(ansLine);

          // 解析（复用做题界面样式）
          const ex = el('div','explanation show', `<strong>解析：</strong>${q.explanation}`);
          block.appendChild(ex);
          listWrap.appendChild(block);
        });
      }
      countEl.textContent = `${modWrongCount} 错`;
      if(modWrongCount === 0){
        listWrap.innerHTML = `<div class="empty-hint">暂无${mod.label}错题，继续保持！做完题提交后，错题会自动收进来。</div>`;
      }
    }
    // 顶部汇总
    const summary = el('div','wrongbook-summary',
      totalWrong === 0
        ? '🎉 当前没有错题，状态很好！'
        : `共 <b>${totalWrong}</b> 道错题。重做原题并答对后，错题会自动从错题本消失。`);
    wrap.insertBefore(summary, wrap.firstChild);
  }catch(e){
    app.innerHTML = pageHeader('错题本') + `<div class="empty-hint">加载失败：${e.message}</div>`;
  }
}

init();
