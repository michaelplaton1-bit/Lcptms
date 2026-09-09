// LCPTMS LakeCharlesSQLDataService endpoint extractor v0.5
// Authenticates server-side and extracts structured service calls from the
// authenticated Vessel Traffic page + resolved JS modules.

const BASE="https://www.lakecharlespilots.com";
const LOGIN=`${BASE}/Login?returnurl=/&popUp=true`;
const OVERVIEW=`${BASE}/Pilots/Overview`;
const TRAFFIC=`${BASE}/Vessel-Traffic`;

function setCookies(res){
  const h=res.headers;
  return typeof h.getSetCookie==="function" ? h.getSetCookie() : [h.get("set-cookie")].filter(Boolean);
}
function mergeJar(jar,values=[]){
  for(const raw of values){
    const pair=String(raw).split(";")[0];
    const i=pair.indexOf("=");
    if(i>0) jar.set(pair.slice(0,i),pair.slice(i+1));
  }
}
function cookieHeader(jar){return [...jar].map(([k,v])=>`${k}=${v}`).join("; ");}

function hiddenFields(html){
  const out={};
  for(const tag of html.match(/<input\b[^>]*>/gi)||[]){
    const type=(tag.match(/\btype=["']([^"']+)["']/i)?.[1]||"").toLowerCase();
    const name=tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    const value=tag.match(/\bvalue=["']([^"']*)["']/i)?.[1]||"";
    if(name && type==="hidden") out[name]=value;
  }
  return out;
}

async function auth(){
  const username=process.env.LCP_SCHEDULE_USERNAME;
  const password=process.env.LCP_SCHEDULE_PASSWORD;
  if(!username||!password) throw new Error("LCP schedule credentials missing");

  const jar=new Map();

  const g=await fetch(LOGIN,{redirect:"manual",cache:"no-store"});
  mergeJar(jar,setCookies(g));
  const hidden=hiddenFields(await g.text());

  if(!hidden.__VIEWSTATE || !hidden.__EVENTVALIDATION) throw new Error("ASP.NET login state missing");

  const form=new FormData();
  for(const [k,v] of Object.entries(hidden)) form.append(k,v);
  form.set("__EVENTTARGET","dnn$ctr$Login$Login_DNN$cmdLogin");
  form.set("__EVENTARGUMENT","");
  if(!form.has("__VIEWSTATEGENERATOR"))form.set("__VIEWSTATEGENERATOR","");
  if(!form.has("__VIEWSTATEENCRYPTED"))form.set("__VIEWSTATEENCRYPTED","");
  form.set("dnn$ctr$Login$Login_DNN$txtUsername",username);
  form.set("dnn$ctr$Login$Login_DNN$txtPassword",password);
  form.set("ScrollTop","");
  form.set("__dnnVariable","");

  const post=await fetch(LOGIN,{
    method:"POST",redirect:"manual",cache:"no-store",
    headers:{Cookie:cookieHeader(jar),Referer:LOGIN},
    body:form
  });
  mergeJar(jar,setCookies(post));

  if(post.status!==302 && post.status!==303) throw new Error(`Login failed ${post.status}`);

  const loc=post.headers.get("location");
  const landing=await fetch(loc?new URL(loc,BASE):OVERVIEW,{
    redirect:"follow",cache:"no-store",
    headers:{Cookie:cookieHeader(jar)}
  });
  mergeJar(jar,setCookies(landing));
  const landingHtml=await landing.text();

  if(!/LOGOUT|PILOT DOCS/i.test(landingHtml)) throw new Error("Authenticated landing not confirmed");

  return jar;
}

function unique(arr){return [...new Set(arr.filter(Boolean))];}

function scriptSources(html){
  const out=[];
  for(const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)){
    out.push(m[1]);
  }
  return unique(out);
}

function inlineScripts(html){
  const out=[];
  const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while((m=re.exec(html))){
    if(!/\bsrc=/i.test(m[1]) && m[2]) out.push(m[2]);
  }
  return out;
}

function serviceCallsFromText(text, source){
  const calls=[];

  // Exact LakeCharlesSQLDataService paths.
  for(const m of text.matchAll(/["'`](\/DesktopModules\/LakeCharlesSQLDataService\/API\/Main\/[^"'`\s?]+)([^"'`]*)["'`]/gi)){
    calls.push({
      source,
      endpoint:m[1],
      suffix:m[2]||"",
      absolute:new URL(m[1],BASE).toString()
    });
  }

  // More permissive extraction in case URL is concatenated.
  for(const m of text.matchAll(/LakeCharlesSQLDataService\/API\/Main\/([A-Za-z0-9_]+)/g)){
    const ep=`/DesktopModules/LakeCharlesSQLDataService/API/Main/${m[1]}`;
    calls.push({source,endpoint:ep,suffix:null,absolute:new URL(ep,BASE).toString()});
  }

  return calls;
}

function ajaxBlocks(text, source){
  const blocks=[];
  const re=/\$\.ajax\s*\(\s*\{([\s\S]*?)\}\s*\)/gi;
  let m;
  while((m=re.exec(text))){
    const body=m[1];
    if(!/LakeCharlesSQLDataService/i.test(body)) continue;
    const url=body.match(/\burl\s*:\s*["'`]([^"'`]+)["'`]/i)?.[1]||null;
    const type=body.match(/\btype\s*:\s*["'`]([^"'`]+)["'`]/i)?.[1]||null;
    const data=body.match(/\bdata\s*:\s*(\{[\s\S]*?\}|[^,\n}]+)/i)?.[1]||null;
    blocks.push({
      source,
      url,
      type,
      dataExpression:data ? data.replace(/\s+/g," ").slice(0,800) : null,
      snippet:body.replace(/\s+/g," ").slice(0,1400)
    });
  }
  return blocks;
}

function endpointNames(calls){
  return unique(calls.map(c=>c.endpoint.split("/").pop()));
}

export async function sqlEndpointDiagnostics(){
  const jar=await auth();

  const traffic=await fetch(TRAFFIC,{
    cache:"no-store",
    headers:{Cookie:cookieHeader(jar),Referer:OVERVIEW}
  });
  const html=await traffic.text();

  const allCalls=[];
  const allAjax=[];

  for(const [i,text] of inlineScripts(html).entries()){
    allCalls.push(...serviceCallsFromText(text,`inline:${i}`));
    allAjax.push(...ajaxBlocks(text,`inline:${i}`));
  }

  const srcs=scriptSources(html)
    .filter(s=>/DesktopModules\/(?:LCMovingWithin|LCExpected|LCInPort|LCArriving)/i.test(s));

  const modules=[];
  for(const src of srcs){
    const resolved=new URL(src,traffic.url).toString();
    try{
      const r=await fetch(resolved,{
        cache:"no-store",
        headers:{Cookie:cookieHeader(jar),Referer:traffic.url}
      });
      const text=await r.text();
      const calls=serviceCallsFromText(text,src);
      const ajax=ajaxBlocks(text,src);
      allCalls.push(...calls);
      allAjax.push(...ajax);
      modules.push({
        src,
        resolved,
        status:r.status,
        length:text.length,
        endpoints:endpointNames(calls),
        ajax
      });
    }catch(e){
      modules.push({src,resolved,error:e?.message||"unknown"});
    }
  }

  const dedupedCalls=[];
  const seen=new Set();
  for(const c of allCalls){
    const key=`${c.source}|${c.endpoint}|${c.suffix||""}`;
    if(seen.has(key))continue;
    seen.add(key);
    dedupedCalls.push(c);
  }

  return {
    diagnosticVersion:"0.5.0",
    trafficStatus:traffic.status,
    discoveredEndpointNames:endpointNames(dedupedCalls),
    serviceCalls:dedupedCalls.slice(0,120),
    ajaxBlocks:allAjax.slice(0,80),
    modules
  };
}
