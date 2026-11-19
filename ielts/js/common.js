// common.js (静态版) - localStorage 学习记录 + 读静态JSON的API
// BUILD_VER=1795051516 —— 每次构建注入版本号，fetch 带 ?v= 绕开浏览器缓存
const BASE = "/Qke_repository1/ielts";
const BUILD_VER = "1795051516";
const API = {
  async get(path){
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(BASE + path + sep + 'v=' + BUILD_VER);
    if(!r.ok) throw new Error('请求失败: '+path);
    return r.json();
  },
  async _all(module){ return await this.get('/data/'+module+'.json'); },
  async listeningList(){ return await this._all('listening'); },
  async listeningDetail(id){ return (await this._all('listening')).find(x=>x.id==id); },
  async readingList(){ return await this._all('reading'); },
  async readingDetail(id){ return (await this._all('reading')).find(x=>x.id==id); },
  async speakingList(){ return await this._all('speaking'); },
  async speakingDetail(id){ return (await this._all('speaking')).find(x=>x.id==id); },
  async writingList(){ return await this._all('writing'); },
  async writingDetail(id){ return (await this._all('writing')).find(x=>x.id==id); },
  async stats(){
    const [l,r,s,w] = await Promise.all([
      this._all('listening'), this._all('reading'), this._all('speaking'), this._all('writing')
    ]);
    return {listening:l.length, reading:r.length, speaking:s.length, writing:w.length};
  },
};

// 学习记录管理 —— 全部存 localStorage
const Record = {
  _key(module){ return `ielts_progress_${module}`; },
  _read(module){
    try{ return JSON.parse(localStorage.getItem(this._key(module))) || {}; }
    catch{ return {}; }
  },
  _write(module, data){ localStorage.setItem(this._key(module), JSON.stringify(data)); },
  get(module, id){ const all=this._read(module); return all[id] || {completed:false, answers:{}}; },
  saveAnswers(module, id, answers){
    const all=this._read(module);
    if(!all[id]) all[id]={completed:false, answers:{}};
    all[id].answers=answers; this._write(module, all);
  },
  setCompleted(module, id){
    const all=this._read(module);
    if(!all[id]) all[id]={completed:false, answers:{}};
    all[id].completed=true; this._write(module, all);
  },
  toggleCompleted(module, id){
    const all=this._read(module);
    if(!all[id]) all[id]={completed:false, answers:{}};
    all[id].completed=!all[id].completed; this._write(module, all);
    return all[id].completed;
  },
  countDone(module){ return Object.values(this._read(module)).filter(x=>x.completed).length; }
};

function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
function $(s, root=document){ return root.querySelector(s); }
function $$(s, root=document){ return [...root.querySelectorAll(s)]; }
function pageHeader(title, desc, backHref=BASE+'/'){
  return `<div class="page-header">
    <a class="back-btn" href="${backHref}">← 返回大厅</a>
    <div class="page-title">${title}</div>
    <div class="page-desc">${desc||''}</div>
  </div>`;
}
