// hall.js - 大厅页逻辑
(async function(){
  try{
    await Record.loadAll();
    const stats = await API.stats();
    const m = {listening:'听力',reading:'阅读',speaking:'口语',writing:'写作'};
    for(const k of ['listening','reading','speaking','writing']){
      const cnt = document.getElementById('count-'+k);
      if(cnt) cnt.textContent = `${stats[k]} 篇`;
      const done = Record.countDone(k);
      const prog = document.getElementById('prog-'+k);
      if(prog) prog.textContent = `${done} / ${stats[k]}`;
    }
  }catch(e){
    console.error('加载统计失败', e);
  }
})();
