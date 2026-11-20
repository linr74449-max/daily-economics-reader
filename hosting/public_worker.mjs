// ASSETS contains the same reader that ships in the extension.
const today = () => new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const validDate = day => /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today();
const jsonHeaders = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:jsonHeaders});
const editionKey = day => "published/"+day+".json";
async function publish(request,env) {
  if (!env.PUBLISH_KEY || Number(request.headers.get("content-length"))>6_000_000) return json({error:"unavailable"},403);
  const reader=request.body?.getReader();
  if(!reader)return json({error:"forbidden"},403);
  const chunks=[];let size=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.length;
    if(size>6_000_000){await reader.cancel();return json({error:"too large"},413);}
    chunks.push(value);
  }
  let envelope;
  try {envelope=JSON.parse(await new Blob(chunks).text());}catch{return json({error:"forbidden"},403);}
  if(typeof envelope?.payload!=="string"||!(/^[0-9a-f]{64}$/).test(envelope.signature))return json({error:"forbidden"},403);
  const utf8=new TextEncoder();
  const keyData=await crypto.subtle.importKey("raw",utf8.encode(env.PUBLISH_KEY),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const mac=Uint8Array.from(envelope.signature.match(/../g),n=>parseInt(n,16));
  if(!await crypto.subtle.verify("HMAC",keyData,mac,utf8.encode(envelope.payload)))return json({error:"forbidden"},403);
  let issue;
  try {issue=JSON.parse(envelope.payload);}catch{return json({error:"invalid JSON"},400);}
  if (!issue || !validDate(issue.date) || ![issue.track,issue.concept,issue.title,issue.story].every(v=>typeof v==="string" && v.trim())
      || !Array.isArray(issue.rows) || !Array.isArray(issue.sources)) return json({error:"invalid edition"},422);
  const data=JSON.stringify(issue,null,2)+"\n";
  const bytes=new TextEncoder().encode(data);
  const prefix=new TextEncoder().encode("blob "+bytes.length+"\0");
  const blob=new Uint8Array(prefix.length+bytes.length);
  blob.set(prefix);blob.set(bytes,prefix.length);
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-1",blob));
  const sha=Array.from(hash,b=>b.toString(16).padStart(2,"0")).join("");
  const {date,title,track,concept}=issue;
  const metadata={date,title,track,concept,sha};
  const key=editionKey(date);
  const written=await env.BUCKET.put(key,bytes,{onlyIf:{etagDoesNotMatch:"*"},customMetadata:metadata});
  if (written) return json(metadata,201);
  const prior=await env.BUCKET.head(key);
  return prior?.customMetadata?.sha===sha ? json(metadata) : json({error:"conflicting edition",date},409);
}
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==="/internal/publish" && request.method==="POST")return publish(request,env);
  if(request.method!=="GET" && request.method!=="HEAD")return json({error:"unsupported method"},405);
  if(path==="/published/index.json"){
    const index=[];
    let cursor;
    do {
      const page=await env.BUCKET.list({prefix:"published/",include:["customMetadata"],cursor});
      for (const entry of page.objects) if(entry.customMetadata&&validDate(entry.customMetadata.date))index.push(entry.customMetadata);
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor);
    return json(index.sort((a,b)=>a.date.localeCompare(b.date)));
  }
  const match=path.match(/^\/published\/(\d{4}-\d{2}-\d{2})\.json$/);
  if(match&&validDate(match[1])){
    const edition=await env.BUCKET.get(editionKey(match[1]));
    if(edition)return new Response(edition.body,{headers:{...jsonHeaders,"Cache-Control":"public, max-age=300"}});
  }
  const name=path==="/"?"index.html":path.slice(1);
  if(!Object.hasOwn(ASSETS,name))return json({error:"not found"},404);
  const [type,encoded]=ASSETS[name];
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{"Content-Type":type,"Cache-Control":"no-cache","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'"}});
}};
