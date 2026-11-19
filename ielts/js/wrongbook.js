// wrongbook.js - 错题本：错题显式存储，不自动消失
// 重做答对 → 标记「已解决」；用户可手动删除；新错题在上，已解决的沉底
const app = document.getElementById('app');

function fmtAns(a){ return Array.isArray(a) ? a.join(', ') : a; }
function fmtTime(ts){
  if(!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// 一次性迁移：老版本错题是从答题记录实时推导的，这里转成显式条目（存 _migrated 标记，只跑一次）
async function migrateLegacy(mods){
  if(Record.all('wrongbook')['_migrated']) return;
  for(const mod of mods){
    const recs = Record.all(mod.key);
    for(const id of Object.keys(recs)){
      const rec = recs[id];
      if(!rec || !rec.completed || !rec.answers || !Object.keys(rec.answers).length) continue;
      let it;
      try{ it = await mod.detailFn(id); }catch(e){ continue; }
      if(!it) continue;
      for(let qi=0; qi<it.questions.length; qi++){
        const ua = rec.answers[qi];
        if(!ansIsWrong(it.questions[qi].answer, ua)) continue;
        const key = `${mod.key}_${id}_${qi}`;
        if(!Record.all('wrongbook')[key]){
          await Record._save('wrongbook', key, {
            module: mod.key, itemId: String(id), qi,
            userAns: Array.isArray(ua) ? [...ua].sort() : (ua || ''),
            correctAns: it.questions[qi].answer,
            resolved: false,
            first_at: rec.updated_at || Date.now(),
          });
        }
      }
    }
  }
  await Record._save('wrongbook', '_migrated', { done: true });
}

async function init(){
  await Record.loadAll();
  const mods = [
    {key:'listening', label:'听力', page:'listening', listFn: ()=>API.listeningList(), detailFn:(id)=>API.listeningDetail(id), icon:'🎧'},
    {key:'reading',   label:'阅读', page:'reading',   listFn: ()=>API.readingList(),   detailFn:(id)=>API.readingDetail(id),   icon:'📖'},
  ];
  app.innerHTML = pageHeader('错题本','听力 / 阅读错题自动收集 · 新错题在上 · 重做答对标记「已解决」· 可手动删除');
  const wrap = el('div','wrongbook-wrap');
  app.appendChild(wrap);
  try{
    await migrateLegacy(mods);

    // 取全部错题条目（排除 _migrated 标记），按模块分组
    const all = Record.all('wrongbook');
    const entries = Object.keys(all)
      .filter(k => !k.startsWith('_') && all[k])
      .map(k => Object.assign({ key: k }, all[k]));

    // 顶部汇总
    const openN = entries.filter(x=>!x.resolved).length;
    const solvedN = entries.length - openN;
    const summary = el('div','wrongbook-summary',
      openN === 0 && solvedN === 0
        ? '🎉 当前没有错题，状态很好！做完题提交后，错题会自动收进来。'
        : `共 <b>${openN}</b> 道未解决错题${solvedN ? `，另有 <b>${solvedN}</b> 道已解决` : ''}。错题不会自动消失：重做答对后标记「已解决」，确认掌握后可点「删除」移出。`);
    wrap.appendChild(summary);

    let totalShown = 0;
    for(const mod of mods){
      const section = el('div','wrong-section');
      section.innerHTML = `<div class="wrong-section-title">${mod.icon} ${mod.label}错题 <span class="wrong-count" id="count-${mod.key}">…</span></div>`;
      wrap.appendChild(section);
      const listWrap = el('div','item-list');
      section.appendChild(listWrap);
      const countEl = section.querySelector(`#count-${mod.key}`);

      // 该模块的条目：未解决在上（新的在前），已解决沉底（新的在前）
      const modEntries = entries
        .filter(x => x.module === mod.key)
        .sort((a,b) => {
          if(!!a.resolved !== !!b.resolved) return a.resolved ? 1 : -1;
          return (b.first_at || b.updated_at || 0) - (a.first_at || a.updated_at || 0);
        });

      if(!modEntries.length){
        countEl.textContent = '0 错';
        listWrap.innerHTML = `<div class="empty-hint">暂无${mod.label}错题，继续保持！做完题提交后，错题会自动收进来。</div>`;
        continue;
      }

      // 篇目号映射（列表顺序 = No.XX）
      const listData = await mod.listFn();
      const noMap = {};
      listData.forEach((it,i)=>{ noMap[it.id] = i+1; });

      // 篇目详情缓存（同篇多题只取一次）
      const detailCache = {};
      let modOpen = 0, modSolved = 0;

      for(const e of modEntries){
        if(e.resolved) modSolved++; else modOpen++;
        totalShown++;
        let it = detailCache[e.itemId];
        if(it === undefined){
          try{ it = await mod.detailFn(e.itemId) || null; }catch(err){ it = null; }
          detailCache[e.itemId] = it;
        }
        const no = noMap[e.itemId] || e.itemId;
        const q = it ? (it.questions || [])[e.qi] : null;

        const block = el('div','wrong-item' + (e.resolved ? ' is-resolved' : ''));
        // 头部：篇目号 + 题号 + 状态徽章 + 跳转/删除
        const head = el('div','wrong-head');
        head.innerHTML = `
          <span class="wrong-loc">${mod.label} No.${String(no).padStart(2,'0')} · 第 ${e.qi+1} 题
            <span class="wrong-src">${it ? (it.title||'') : '（原篇目数据缺失）'} · 做错于 ${fmtTime(e.first_at)}</span>
          </span>
          <span class="wrong-head-btns">
            <span class="wrong-status ${e.resolved?'resolved':'open'}">${e.resolved?'✓ 已解决':'未解决'}</span>
            <button class="btn btn-outline btn-jump">跳转原题 ↗</button>
            <button class="btn btn-outline btn-del">删除</button>
          </span>`;
        head.querySelector('.btn-jump').onclick = ()=>{ location.href = `/Qke_repository1/ielts/pages/${mod.page}.html?id=${e.itemId}`; };
        head.querySelector('.btn-del').onclick = async ()=>{
          if(!confirm('确定删除这条错题吗？删除后不再显示（除非再次做错）。')) return;
          await Record.removeWrong(e.key);
          location.reload();
        };
        block.appendChild(head);

        if(!q){
          // 数据缺失兜底：至少显示答案对照
          block.appendChild(el('div','wrong-question','（找不到原题数据，可能内容已更新）'));
          block.appendChild(el('div','wrong-ansline',
            `<span class="tag-user">你的答案：<b>${fmtAns(e.userAns) || '未作答'}</b></span>` +
            `<span class="tag-right">正确答案：<b>${fmtAns(e.correctAns)}</b></span>`));
          listWrap.appendChild(block);
          continue;
        }

        // 题干
        block.appendChild(el('div','wrong-question', q.question));

        // 选项：正确标绿，错选标红（静态展示，不可点）
        const optWrap = el('div','q-options');
        q.options.forEach((opt,oi)=>{
          const letter = String.fromCharCode(65+oi);
          const shouldCorrect = Array.isArray(q.answer) ? q.answer.includes(letter) : letter===q.answer;
          const userPicked = Array.isArray(e.userAns) ? e.userAns.includes(letter) : letter===e.userAns;
          const cls = 'q-option' + (shouldCorrect?' correct':'') + (!shouldCorrect && userPicked?' wrong':'');
          optWrap.appendChild(el('label', cls, `<span class="q-letter">${letter}.</span><span class="q-option-text">${opt}</span>`));
        });
        block.appendChild(optWrap);

        // 错选 / 正确答案
        block.appendChild(el('div','wrong-ansline',
          `<span class="tag-user">你的答案：<b>${fmtAns(e.userAns) || '未作答'}</b></span>` +
          `<span class="tag-right">正确答案：<b>${fmtAns(e.correctAns)}</b></span>`));

        // 解析（复用做题界面样式）
        block.appendChild(el('div','explanation show', `<strong>解析：</strong>${q.explanation || ''}`));
        listWrap.appendChild(block);
      }
      countEl.textContent = `${modOpen} 错${modSolved ? ` · ${modSolved} 已解决` : ''}`;
    }
    if(totalShown === 0 && openN === 0 && solvedN === 0){
      // 全空：移除空模块占位已在上面处理
    }
  }catch(e){
    app.innerHTML = pageHeader('错题本') + `<div class="empty-hint">加载失败：${e.message}</div>`;
  }
}

init();
