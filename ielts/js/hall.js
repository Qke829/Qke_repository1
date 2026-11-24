// hall.js - 大厅页逻辑
(async function(){
  try{
    await Record.loadAll();
    // 同步状态提示：让人看得见记录存到了哪
    const sync = document.getElementById('sync-status');
    if(sync){
      if(Record._srvOk === true){
        sync.textContent = '✓ 学习记录已同步到本机服务，各浏览器/微信通用';
        sync.style.color = '#166534';
      }else{
        sync.innerHTML = '⚠ 记录暂存当前浏览器。如需跨浏览器同步：启动本机服务(8765端口)，并在浏览器首次询问时允许「访问本地网络」';
        sync.style.color = '#92400e';
      }
    }
    const stats = await API.stats();
    const m = {listening:'听力',reading:'阅读',speaking:'口语',writing:'写作'};
    for(const k of ['listening','reading','speaking','writing']){
      const cnt = document.getElementById('count-'+k);
      if(cnt) cnt.textContent = `${stats[k]} 篇`;
      const done = Record.countDone(k);
      const prog = document.getElementById('prog-'+k);
      if(prog) prog.textContent = `${done} / ${stats[k]}`;
    }
    // 词汇积累：7 类总词数（含托福高频词）
    const vocabSelectable = ['cet4','cet6','tem4','tem8','ielts','toefl','toefl_highfreq'];
    const vc = document.getElementById('count-vocab');
    if(vc && stats.vocab){
      const vTotal = vocabSelectable.reduce((a,c)=>a+(stats.vocab[c]||0), 0);
      vc.textContent = `${vTotal} 词 · 7 类`;
    }
  }catch(e){
    console.error('加载统计失败', e);
  }
})();
