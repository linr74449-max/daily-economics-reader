"use strict";
const PolicyDesk = (() => {
  const sources = [
    {id:"mof", name:"中国财政部", region:"中国", domain:"mof.gov.cn", type:"html", url:"https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/"},
    {id:"nbs", name:"国家统计局", region:"中国", domain:"stats.gov.cn", type:"rss", url:"https://www.stats.gov.cn/sj/zxfb/rss.xml"},
    {id:"uk", name:"英国财政部", region:"海外", domain:"gov.uk", type:"atom", url:"https://www.gov.uk/government/organisations/hm-treasury.atom"},
    {id:"fed", name:"美联储", region:"海外", domain:"federalreserve.gov", type:"rss", url:"https://www.federalreserve.gov/feeds/press_monetary.xml"}
  ];
  const themes = [
    [/居民消费价格|通货膨胀|\binflation\b|consumer prices/i, "实际购买力", "读物价数据时，先看比较的是上个月还是去年同期，再看哪些项目对总体变化贡献较大。", 5],
    [/公开市场委员会|fomc statement|federal open market committee|interest rates|利率决议/i, "货币政策", "利率会改变借款和储蓄的成本。会议纪要记录讨论，要区分讨论过的选项与已经作出的决定。", 5],
    [/财政收支|预算执行|budget statement|spending review|autumn budget|spring (?:budget|statement)|财税政策/i, "公共财政", "把政府收入与支出分开读。支出增加对需求的影响，还取决于资金给了谁、何时到位。", 5],
    [/就业|失业|劳动力|employment|labour market/i, "劳动市场", "就业人数和失业率使用不同分母。把就业参与情况也放进来，才能读懂变化。", 4],
    [/国民经济运行|国内生产总值|\bGDP\b|economic growth/i, "经济增长", "区分总量与增速，也留意数据是否扣除了价格变动。总量增加与每个人收入增加是两个层次。", 4],
    [/减税|退税|增值税|income tax|tax rate|tax relief/i, "税负归宿", "先看税制直接改变了谁的收支，再看价格能否调整。最终负担与买卖双方对价格的敏感度有关。", 4],
    [/发行.*国债|\bgilts?\b|government bond/i, "债券与利率", "发行公告中的票面利率、发行价格和到期收益率各有含义。读数前先确认期限及付息方式。", 3]
  ];
  const day = d => new Date(new Date(d).valueOf() + 8*3600000).toISOString().slice(0,10);
  function read(key, fallback) {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}}
  function save(key, value) {try {localStorage.setItem(key,JSON.stringify(value));} catch {}}
  function official(raw, source) {
    try {
      const a=new URL(raw,source.url);
      if (!["http:","https:"].includes(a.protocol) || a.username || a.password ||
          !(a.hostname===source.domain || a.hostname.endsWith("."+source.domain))) return null;
      a.protocol="https:"; return a.href;
    } catch {return null;}
  }
  function parse(source, raw) {
    const collected=[];
    function add(title, href, stamp, updated=false) {
      title=title?.replace(/\s+/g," ").trim();
      if (!title || !href || !stamp || title.length>400) return;
      const url=official(href,source); if(!url) return;
      const match=themes.find(t=>t[0].test(title));
      if (!match || /工作会议|学习贯彻|党组|监管局|研讨会|会员代表大会|minutes of.*engagement|speech:|transparency data:/i.test(title)) return;
      const cnDate=source.region==="中国" && stamp.match(/\d{4}-\d\d-\d\d/);
      const timestamp=Date.parse(stamp);
      if (!cnDate && !Number.isFinite(timestamp)) return;
      collected.push({title,url,date:cnDate?cnDate[0]:day(timestamp),updated,source:source.name,region:source.region,concept:match[1],explain:match[2],weight:match[3]});
    }
    if(source.type==="html") {
      const fragment=document.createElement("template");fragment.innerHTML=raw;
      const rows=fragment.content.querySelectorAll("li");
      if(!Array.from(rows).some(r=>r.querySelector("a") && /\d{4}-\d\d-\d\d/.test(r.textContent))) throw Error("empty index");
      for(const row of rows){const link=row.querySelector("a");add(link?.getAttribute("title")||link?.textContent,link?.getAttribute("href"),row.textContent.match(/\d{4}-\d\d-\d\d/)?.[0]);}
    } else {
      const doc=new DOMParser().parseFromString(raw,"application/xml");
      if(doc.querySelector("parsererror") || !["rss","feed","RDF"].includes(doc.documentElement.localName)) throw Error("invalid feed");
      for(const el of doc.querySelectorAll(source.type==="atom"?"entry":"item")){
        const value=k=>el.querySelector(k)?.textContent?.trim();
        const atom=source.type==="atom";
        add(value("title"),atom?el.querySelector('link[rel="alternate"],link[href]')?.getAttribute("href"):value("link"),atom?(value("published")||value("updated")):value("pubDate"),atom&&!value("published"));
      }
    }
    return collected;
  }
  function select(items,today) {
    const end=Date.parse(today+"T00:00:00Z");
    const eligible=items.filter(i=>{const age=(end-Date.parse(i.date+"T00:00:00Z"))/86400000;return age>=0 && age<=6;});
    const preferChina=(Math.floor(end/86400000)%5)<3;
    const rank=i=>i.weight - (end-Date.parse(i.date+"T00:00:00Z"))/86400000*0.42;
    eligible.sort((a,b)=>rank(b)-rank(a) || Number((b.region==="中国")===preferChina)-Number((a.region==="中国")===preferChina) || a.url.localeCompare(b.url));
    const picks=[];for(const item of eligible){if(picks.some(i=>i.url===item.url||i.title===item.title||i.concept===item.concept))continue;picks.push(item);if(picks.length===2)break;}
    return picks;
  }
  let inFlight;
  async function collect(today) {
    const entries=await Promise.all(sources.map(async source=>{
      const key="econ.feed.v1."+source.id;let cached=read(key,{});const now=Date.now();
      if (cached.day===today || now-(cached.failed||0)<15*60000) return cached;
      try {
        const res=await fetch(source.url,{signal:AbortSignal.timeout(11000),credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store"});
        if(!res.ok) throw Error("HTTP "+res.status);
        const bytes=await res.arrayBuffer();
        const hint=new TextDecoder().decode(bytes.slice(0,1500));
        const charset=(res.headers.get("content-type")||"").match(/charset=["']?([\w-]+)/i)?.[1] || hint.match(/(?:encoding|charset)=["']?([\w-]+)/i)?.[1] || "utf-8";
        const parsed=parse(source,new TextDecoder(charset).decode(bytes));
        cached={day:today,items:parsed.slice(0,60),failed:0};
      }catch{cached={...cached,failed:now};}
      save(key,cached);return cached;
    }));
    const candidates=entries.flatMap(e=>Array.isArray(e.items)?e.items.map(i=>({...i,cached:e.day!==today})):[]);
    return {items:select(candidates,today),fresh:entries.filter(e=>e.day===today).length,count:sources.length};
  }
  function load(today){if(inFlight?.date===today)return inFlight.promise;const promise=collect(today).finally(()=>{if(inFlight?.promise===promise)inFlight=null;});inFlight={date:today,promise};return promise;}
  function fromSnapshot(snapshot,today) {
    const items=[];let fresh=0;
    for(const source of sources){
      const entry=snapshot[source.id];if(!entry?.raw)continue;
      try{items.push(...parse(source,entry.raw).map(i=>({...i,cached:entry.day!==today})));if(entry.day===today)fresh++;}catch{}
    }
    return {items:select(items,today),fresh,count:sources.length};
  }
  return {load,parse,select,sources,day,fromSnapshot};
})();
