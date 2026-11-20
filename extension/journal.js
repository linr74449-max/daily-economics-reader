"use strict";
const SharedJournal = (() => {
  const root = "https://daily-economics-journal.lacywalrus16.chatgpt.site/published/";
  const indexKey = "econ.public.index.v1";
  const cacheName = "econ-public-editions-v1";
  const pending = new Map();
  let index = [];
  function metadata(row) {
    return row && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^[a-f0-9]{40}$/.test(row.sha)
      && ["track","title","concept"].every(k => typeof row[k] === "string" && row[k].length > 0);
  }
  function checkedIndex(rows) {
    if (!Array.isArray(rows) || !rows.length || !rows.every(metadata)
      || new Set(rows.map(r=>r.date)).size !== rows.length) throw Error("Invalid publication index");
    return rows.map(({date,title,track,concept,sha})=>({date,title,track,concept,sha}));
  }
  try { index = checkedIndex(JSON.parse(localStorage.getItem(indexKey))); } catch {}
  function merge(rows, day) {
    const full = new Map(ISSUES.map(x=>[x.date,x]));
    for (const r of rows) {
      if (r.date > day) continue;
      if (full.get(r.date)?._sha !== r.sha) full.set(r.date,{...r,_sha:r.sha});
    }
    ISSUES.splice(0,ISSUES.length,...[...full.values()].sort((a,b)=>a.date.localeCompare(b.date)));
  }
  const options = () => ({cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",signal:AbortSignal.timeout(12000)});
  async function refresh(day) {
    const reply = await fetch(root+"index.json",options());
    if (!reply.ok) throw Error("Index unavailable");
    const rows = checkedIndex(await reply.json());
    const all = new Map(index.map(r=>[r.date,r]));
    for (const row of rows) all.set(row.date,row);
    index = [...all.values()];
    merge(index,day);
    try { localStorage.setItem(indexKey,JSON.stringify(index)); } catch {}
  }
  function https(value) {
    try { const u=new URL(value); return u.protocol==="https:" && !u.username && !u.password; } catch { return false; }
  }
  async function parse(reply, row) {
    const data = new Uint8Array(await reply.arrayBuffer());
    if (data.length > 8_000_000) throw Error("Oversized edition");
    const header = new TextEncoder().encode("blob "+data.length+"\0");
    const blob = new Uint8Array(header.length+data.length);
    blob.set(header); blob.set(data, header.length);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-1",blob));
    if (Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("")!==row._sha) throw Error("Edition revision mismatch");
    const s = JSON.parse(new TextDecoder().decode(data));
    if (!["date","title","concept","track"].every(k=>s[k]===row[k])
        || !["lead","storyTitle","story","deeperTitle","deeper","meaning","tableTitle","note"].every(k=>typeof s[k]==="string")
        || !Array.isArray(s.columns) || !Array.isArray(s.rows) || !s.rows.every(r=>Array.isArray(r)&&r.length===s.columns.length)
        || !Array.isArray(s.sources) || !s.sources.every(r=>Array.isArray(r)&&https(r[1]))
        || (s.clips!==undefined && !Array.isArray(s.clips))
        || !(s.clips??(s.clip?[s.clip]:[])).every(c=>c&&typeof c.date==="string"&&https(c.url))
        || (s.figma && (!https(s.figma)||!["figma.com","www.figma.com"].includes(new URL(s.figma).hostname)))
        || (s.image && !/^(?:assets\/[a-zA-Z0-9_-]+\.png$|data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$)/.test(s.image))) throw Error("Invalid edition");
    delete s.art;
    return {...s,_sha:row._sha};
  }
  const urlFor = row => root+row.date+".json?rev="+row._sha;
  async function load(row, cacheOnly) {
    let cache;
    try { cache = await caches.open(cacheName); } catch {}
    const url = urlFor(row);
    const cached = await cache?.match(url);
    if (cached) {
      try { return await parse(cached,row); } catch { await cache.delete(url); }
    }
    if (cacheOnly) return null;
    const reply = await fetch(url,options());
    if (!reply.ok) throw Error("Edition unavailable");
    const issue = await parse(reply.clone(),row);
    try { await cache?.put(url,reply); } catch {}
    return issue;
  }
  async function read(row, cacheOnly=false) {
    if (row.story) return row;
    const key = row._sha+(cacheOnly?":cached":"");
    if (!pending.has(key)) pending.set(key,load(row,cacheOnly).finally(()=>pending.delete(key)));
    const issue=await pending.get(key);
    const i=ISSUES.findIndex(r=>r.date===row.date && r._sha===row._sha);
    if (issue && i>=0) ISSUES[i]=issue;
    return issue;
  }
  return {restore:day=>merge(index,day),refresh,read};
})();
