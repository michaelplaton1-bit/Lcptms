const BASE="https://www.lakecharlespilots.com";
const LOGIN=`${BASE}/Login?returnurl=/&popUp=true`;
const OVERVIEW=`${BASE}/Pilots/Overview`;
const TRAFFIC=`${BASE}/Vessel-Traffic`;

function sc(r){const h=r.headers;return typeof h.getSetCookie==="function"?h.getSetCookie():[h.get("set-cookie")].filter(Boolean);}
function merge(j,a=[]){for(const x of a){const p=String(x).split(";")[0],i=p.indexOf("=");if(i>0)j.set(p.slice(0,i),p.slice(i+1));}}
function ch(j){return [...j].map(([k,v])=>`${k}=${v}`).join("; ");}
function hidden(html){const o={};for(const tag of html.match(/<input\b[^>]*>/gi)||[]){const t=(tag.match(/\btype=["']([^"']+)["']/i)?.[1]||"").toLowerCase(),n=tag.match(/\bname=["']([^"']+)["']/i)?.[1],v=tag.match(/\bvalue=["']([^"']*)["']/i)?.[1]||"";if(n&&t==="hidden")o[n]=v;}return o;}

async function auth(){
 const u=process.env.LCP_SCHEDULE_USERNAME,p=process.env.LCP_SCHEDULE_PASSWORD;if(!u||!p)throw new Error("credentials missing");
 const j=new Map(),g=await fetch(LOGIN,{redirect:"manual",cache:"no-store"});merge(j,sc(g));const h=hidden(await g.text());
 const f=new FormData();for(const [k,v] of Object.entries(h))f.append(k,v);
 f.set("__EVENTTARGET","dnn$ctr$Login$Login_DNN$cmdLogin");f.set("__EVENTARGUMENT","");
 if(!f.has("__VIEWSTATEGENERATOR"))f.set("__VIEWSTATEGENERATOR","");if(!f.has("__VIEWSTATEENCRYPTED"))f.set("__VIEWSTATEENCRYPTED","");
 f.set("dnn$ctr$Login$Login_DNN$txtUsername",u);f.set("dnn$ctr$Login$Login_DNN$txtPassword",p);f.set("ScrollTop","");f.set("__dnnVariable","");
 const post=await fetch(LOGIN,{method:"POST",redirect:"manual",cache:"no-store",headers:{Cookie:ch(j),Referer:LOGIN},body:f});merge(j,sc(post));
 const loc=post.headers.get("location");const land=await fetch(loc?new URL(loc,BASE):OVERVIEW,{redirect:"follow",cache:"no-store",headers:{Cookie:ch(j)}});merge(j,sc(land));
 return j;
}
function safeSnippet(s){return s.replace(/\s+/g," ").slice(0,1800);}
export async function scriptDiagnostics(){
 const jar=await auth();
 const r=await fetch(TRAFFIC,{cache:"no-store",headers:{Cookie:ch(jar),Referer:OVERVIEW}});
 const html=await r.text(), scripts=[];
 const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;let m,i=0;
 while((m=re.exec(html))){
   const attrs=m[1],body=m[2]||"",src=attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1]||null;
   const relevant=/LCMovingWithin|LCExpected|LCInPort|LCArriving|UpdaterGridData|serviceRoot|serviceFramework|DesktopModules|ajax|moduleId|tabId/i.test((src||"")+" "+body);
   if(relevant)scripts.push({index:i,src,resolvedSrc:src?new URL(src,r.url).toString():null,inlineSnippet:src?null:safeSnippet(body)});
   i++;
 }
 const resolved=[];
 for(const s of scripts.filter(x=>x.resolvedSrc).slice(0,20)){
   try{
    const x=await fetch(s.resolvedSrc,{cache:"no-store",headers:{Cookie:ch(jar),Referer:r.url}});
    const text=await x.text();
    resolved.push({src:s.src,resolvedSrc:s.resolvedSrc,status:x.status,contentType:x.headers.get("content-type"),length:text.length,
      snippet:/ajax|serviceRoot|serviceFramework|url\s*:|fetch\(|getJSON|moduleId|tabId/i.test(text)?safeSnippet(text):null});
   }catch(e){resolved.push({src:s.src,error:e.message});}
 }
 return {diagnosticVersion:"0.4.0",trafficStatus:r.status,scriptCount:i,relevantScripts:scripts,resolvedScripts:resolved};
}
