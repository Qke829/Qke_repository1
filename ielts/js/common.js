// common.js (静态版) - 读静态JSON的API（学习记录在 record.js）
// BUILD_VER=1795414905 —— 每次构建注入版本号，fetch 带 ?v= 绕开浏览器缓存
const BASE = "/Qke_repository1/ielts";
const BUILD_VER = "1795414905";
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
