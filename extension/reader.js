"use strict";
const main=document.getElementById("main");
const tracks=[
  ["微观经济学","家庭与市场怎样作选择","稀缺与机会成本 → 边际分析 → 供给与需求 → 价格弹性"],
  ["博弈论","当我的选择取决于你","策略与收益 → 最优反应 → 纳什均衡 → 重复博弈"],
  ["宏观与公共财政","从一户人家看整个经济","价格指数 → 就业与产出 → 经济波动 → 财政与货币政策"],
  ["金融市场","今天和未来的钱如何定价","货币的时间价值 → 贴现 → 债券价格与收益率 → 利率风险"],
  ["发展与国际经济","人们如何分享增长","交易成本 → 市场可达性 → 生产率 → 增长与分配"],
  ["家庭理财","收入、时间与风险如何搭配","预算约束 → 跨期选择 → 流动性 → 分散风险"]
];
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;}
function link(label,href,cls=""){const a=el("a",cls,label);a.href=href;if(href.startsWith("https://")){a.target="_blank";a.rel="noopener noreferrer";}return a;}
function img(src,alt){const n=el("img");n.src=src;n.alt=alt;return n;}
function add(parent,...nodes){parent.append(...nodes);return parent;}
function day(){return PolicyDesk.day(Date.now());}
function pretty(date){return date.replace(/-/g,".");}
function readSet(){try{const items=JSON.parse(localStorage.getItem("econ.read")||"[]");return new Set(Array.isArray(items)?items:[]);}catch{return new Set();}}
function todayIssue(today){const published=ISSUES.filter(x=>x.date<=today);return published.at(-1)||null;}
function state(s,today){return s.date>today?"即将刊发":s.date===today?"今日刊":"往期";}
function serial(s){return String(ISSUES.indexOf(s)+1).padStart(3,"0");}
function art(s){
  const f=el("figure","artwork");
  if(s.image){f.append(img(s.image,s.alt));return f;}
  if(!["2026-11-20","2026-11-21"].includes(s.date)){f.append(gridTable(s));return f;}
  const game=s.track==="博弈论";
  f.classList.add("type-art",game?"art-game":"art-choice");
  const left=el("div","art-half"),right=el("div","art-half");
  if(game){add(left,el("small","","左店"),el("strong","","原价"),el("span","","维持价格"));add(right,el("small","","右店"),el("strong","","降价"),el("span","","吸引客流"));}
  else{add(left,el("small","","周六下午"),el("strong","","14:00"),el("span","","一班工钱"));add(right,el("small","","同一时段"),el("strong","","17:00"),el("span","","一次相聚"));}
  return add(f,left,right);
}
function head(container,kicker,title){return add(container,el("p","eyebrow",kicker),el("h1","page-title",title));}
function titleBlock(s){const h=el("h1","cover-title");const pieces=s.title.split("，");for(const [i,p] of pieces.entries()){if(i)h.append(el("br"));h.append(document.createTextNode(p+(i<pieces.length-1?"，":"")));}return h;}
function issueLine(s,today){
  const a=link("","#issue/"+s.date,"issue-line");const meta=el("span","line-meta",pretty(s.date)+"  /  "+s.concept);
  const label=s.date>today?"预读":readSet().has(s.date)?"已读":"阅读";return add(a,meta,el("strong","",s.title),el("span","line-arrow",label+" ↗"));
}
function sourceLink(pair){return link(pair[0]+" ↗",pair[1],"source-link");}
function textBlock(label,title,copy){
  const section=el("section","chapter");return add(section,el("p","eyebrow",label),el("h2","",title),el("p","body-copy",copy));
}
function gridTable(s){
  const section=el("section","ledger-section");const table=el("table","ledger");
  table.append(el("caption","",s.tableTitle));const thead=el("thead"),tr=el("tr");for(const x of s.columns){const th=el("th","",x);th.scope="col";tr.append(th);}thead.append(tr);
  const tbody=el("tbody");for(const row of s.rows){const r=el("tr");row.forEach((v,i)=>{const item=el(i?"td":"th","",v);if(!i)item.scope="row";r.append(item);});tbody.append(r);}
  add(table,thead,tbody);return add(section,table,el("p","caption",s.note));
}
function historical(clip){
  const n=el("section","clipping");return add(n,el("p","eyebrow",clip.type+"   /   "+pretty(clip.date)),el("h3","",clip.title),el("p","",clip.fact),el("p","",clip.explain),link(clip.issuer+" · 原文 ↗",clip.url,"source-link"));
}
function mark(s){
  const btn=el("button","mark");btn.type="button";
  function update(){const yes=readSet().has(s.date);btn.textContent=yes?"✓ 已读 · 撤销":"标记为已读";btn.setAttribute("aria-pressed",String(yes));}
  update();btn.onclick=()=>{const v=readSet();if(v.has(s.date))v.delete(s.date);else v.add(s.date);try{localStorage.setItem("econ.read",JSON.stringify([...v]));update();}catch{btn.textContent="此浏览器未保存阅读进度";}};return btn;
}
async function recent(section,s,today){
  const intro=el("p","eyebrow","政策与数据   /   近七日");section.append(intro);
  const snapshot=document.getElementById("offline-feeds");
  if(location.protocol!=="chrome-extension:"&&!snapshot){section.append(el("p","caption","离线预览 · 通过一键启动器或浏览器扩展打开，可自动读取官方发布。"));return;}
  const status=el("p","caption","正在读取官方发布…");status.setAttribute("role","status");section.append(status);
  const {items,fresh,count}=snapshot?PolicyDesk.fromSnapshot(JSON.parse(snapshot.textContent),today):await PolicyDesk.load(today);if(!section.isConnected)return;
  const selected=items.slice(0,Math.max(0,2-(s.clips??(s.clip?[s.clip]:[])).length));
  status.textContent=(fresh===count?"已检查全部官方来源":fresh?"已更新 "+fresh+" / "+count+" 个官方来源":"官方来源暂时未能更新")+(selected.length?(selected.some(i=>i.cached)?" · 含可用缓存":""):" · 暂无可展示的近期发布");
  for(const n of selected){const card=el("div","news-item");add(card,el("small","",n.source+" · "+pretty(n.date)+(n.updated?" 更新":" 发布")),link(n.title+" ↗",n.url,"news-title"),el("p","","阅读角度 · "+n.concept+"。"+n.explain));section.append(card);}
}
function article(s,today,home){
  main.replaceChildren();
  if(!s){head(main,"编排日程","当期尚未出版");return;}
  const hero=el("section","cover");const left=el("div","cover-copy");
  const label=home&&s.date<today?"最近一期":state(s,today);
  add(left,el("p","eyebrow",label+"  /  VOL. "+serial(s)),titleBlock(s),el("p","deck",s.lead));
  const buttons=el("div","actions");const start=el("button","primary","开始阅读 ↓");start.onclick=()=>document.getElementById("lesson").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth"});
  buttons.append(start);if(s.figma)buttons.append(link("Figma 图解 ↗",s.figma,"text-link"));left.append(buttons);const visual=el("div","cover-visual");
  add(visual,art(s),add(el("div","art-caption"),el("span","",s.concept),el("span","",pretty(s.date))));
  add(hero,left,visual);main.append(hero);
  const spread=el("div","spread"),body=el("article","article");body.id="lesson";
  add(body,textBlock("生活现场",s.storyTitle,s.story),gridTable(s),textBlock("经济学概念",s.concept,s.meaning),textBlock("再往前一步",s.deeperTitle,s.deeper));
  if(s.decisionTakeaway){
    const closing=el("section","chapter");
    body.append(add(closing,el("h2","","用在下一次选择"),el("p","body-copy",s.decisionTakeaway)));
  }
  const side=el("aside","margin");const map=el("section","sidebox");add(map,el("p","eyebrow","学习坐标"),el("h3","",s.track),el("p","",s.concept),link("展开知识地图 →","#map","text-link"));side.append(map);
  for(const clip of s.clips??(s.clip?[s.clip]:[]))side.append(historical(clip));
  const sources=el("details","sources");sources.append(el("summary","","资料与出处"));s.sources.forEach(src=>sources.append(sourceLink(src)));if(s.art)sources.append(sourceLink(["本期 Canva 配图",s.art]));
  add(body,sources,mark(s));add(spread,body,side);main.append(spread);
  if((home || s.date===today)&&location.protocol!=="https:"){const desk=el("section","policy-desk");main.append(desk);recent(desk,s,today);}
}
function archive(today){
  main.replaceChildren();head(main,"按刊期阅读","期刊架");
  const area=el("section","issue-list");ISSUES.filter(s=>s.date<=today).reverse().forEach(s=>area.append(issueLine(s,today)));main.append(area);
}
function mapPage(today){
  main.replaceChildren();head(main,"从家庭选择到整个经济","知识地图");const group=el("div","map-grid");for(const [name,heading,path] of tracks){const card=el("section","map-card");add(card,el("p","eyebrow",name),el("h2","",heading),el("p","path",path));const editions=ISSUES.filter(s=>s.track===name&&s.date<=today);
  if(!editions.length)card.append(el("small","caption","规划中的学习线"));editions.forEach(s=>card.append(link(s.concept+" · "+state(s,today)+" ↗","#issue/"+s.date,"concept-link")));group.append(card);}main.append(group);
}
let renderedDate="", syncState="checking", renderId=0;
let lastCheck=0, refreshing=false;
function notice(message){
  const n=document.getElementById("publication-status");
  if(n){n.textContent=message;n.hidden=!message;}
}
function homeNotice(s,today){
  if(syncState==="offline")return "暂时无法检查新刊 · 当前阅读 "+pretty(s.date);
  if(s.date===today)return "";
  return (syncState==="checking"?"正在检查新刊":"今日待刊")+" · 最近一期 "+pretty(s.date);
}
async function render(reset=false){
  const id=++renderId;
  const today=day(),hash=location.hash.slice(1);renderedDate=today;document.getElementById("clock").textContent=pretty(today);
  notice("");
  const nav=hash==="map"?"map":(hash==="archive"||hash.startsWith("issue/"))?"archive":"today";
  for(const a of document.querySelectorAll("nav a")){if(a.dataset.nav===nav)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");}
  if(hash==="map")mapPage(today);
  else if(hash==="archive")archive(today);
  else{
    const byDate=hash.startsWith("issue/");
    const row=byDate?ISSUES.find(s=>s.date===hash.slice(6)&&s.date<=today):todayIssue(today);
    if(!row && byDate)archive(today);
    else {
      let issue=row;
      if(row&&!row.story){
        main.replaceChildren(el("p","caption","正在读取 "+pretty(row.date)+" 的期刊…"));
        try { issue=await SharedJournal.read(row); }
        catch {
          if(id!==renderId)return;
          issue=null;
          if(!byDate){
            for(const older of ISSUES.filter(s=>s.date<row.date).reverse()){
              try{issue=await SharedJournal.read(older,true);}catch{}
              if(issue)break;
            }
          }
          if(id!==renderId)return;
          notice(issue?"新刊暂时无法下载 · 当前阅读 "+pretty(issue.date):"本期暂时无法下载，请稍后再打开。");
        }
        if(id!==renderId)return;
      }
      if(issue||!row)article(issue,today,!byDate);
      else main.replaceChildren(link("返回期刊架","#archive"));
      if(issue&&!byDate&&issue.date===row.date)notice(homeNotice(issue,today));
    }
  }
  if(reset){window.scrollTo(0,0);main.focus({preventScroll:true});}
}
window.addEventListener("hashchange",()=>render(true));
document.querySelector(".skip").onclick=event=>{event.preventDefault();main.focus();};
async function checkShared(force=false){
  if(typeof SharedJournal==="undefined"||refreshing||(!force&&Date.now()-lastCheck<120000))return;
  refreshing=true;lastCheck=Date.now();
  try { await SharedJournal.refresh(day());syncState="ready"; }
  catch { syncState="offline"; }
  finally {refreshing=false;render();}
}
function syncDate(){if(day()!==renderedDate){render();checkShared(true);}else if(!document.hidden&&todayIssue(day())?.date!==day())checkShared();}
window.addEventListener("focus",syncDate);document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncDate();});
window.addEventListener("storage",e=>{if(e.key==="econ.read")render();});
window.addEventListener("online",()=>checkShared(true));
if(typeof SharedJournal!=="undefined")SharedJournal.restore(day());
setInterval(syncDate,30000);render();checkShared(true);
