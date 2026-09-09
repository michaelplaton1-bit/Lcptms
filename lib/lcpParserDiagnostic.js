// LCPTMS Live Parser Diagnostic helper v0.2
// Authenticates to LakeCharlesPilots.com and returns safe structural diagnostics only.

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

function stripTags(html){
  return String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim();
}

function safeAttr(tag,name){
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`,"i"))?.[1] || null;
}

function collectTagDiagnostics(html, tagName, limit=12){
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) || [];
  return tags.slice(0,limit).map(tag=>({
    id:safeAttr(tag,"id"),
    class:safeAttr(tag,"class"),
    src:safeAttr(tag,"src"),
    name:safeAttr(tag,"name")
  }));
}

function firstRowsOfTables(html, maxTables=12){
  const tables=[];
  const re=/<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m,idx=0;
  while((m=re.exec(html)) && idx<maxTables){
    const tableHtml=m[0];
    const id=safeAttr(tableHtml.match(/^<table\b[^>]*>/i)?.[0]||"","id");
    const cls=safeAttr(tableHtml.match(/^<table\b[^>]*>/i)?.[0]||"","class");

    const rows=[];
    const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trm;
    while((trm=trRe.exec(m[1])) && rows.length<3){
      const cells=[];
      const tdRe=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let c;
      while((c=tdRe.exec(trm[1])) && cells.length<20){
        cells.push(stripTags(c[1]).slice(0,120));
      }
      if(cells.length) rows.push(cells);
    }
    tables.push({index:idx,id,class:cls,rows});
    idx++;
  }
  return tables;
}

function titlePresence(html){
  const u=html.toUpperCase();
  const titles=[
    "VESSELS MOVING WITHIN THE VTIS",
    "VESSELS EXPECTED TO MOVE",
    "VESSELS ARRIVING OR ANCHORED AT BAR",
    "VESSELS IN PORT",
    "LC AI CURRENT SET",
    "PILOTAGE SERVICE",
    "CHANNEL STATUS",
    "NOTES AS OF"
  ];
  return Object.fromEntries(titles.map(t=>[t,u.includes(t)]));
}

function dnnIdentifiers(html){
  const ids=[...html.matchAll(/\bid=["']([^"']*dnn[^"']*)["']/gi)].map(m=>m[1]);
  const classes=[...html.matchAll(/\bclass=["']([^"']*dnn[^"']*)["']/gi)].map(m=>m[1]);
  return {
    ids:[...new Set(ids)].slice(0,40),
    classes:[...new Set(classes)].slice(0,40)
  };
}

function urlPathsFromHtml(html){
  const out=[];
  for(const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)){
    const v=m[1];
    if(/Vessel|Traffic|Pilot|Module|Dnn|api|handler|ashx|axd/i.test(v)) out.push(v);
  }
  return [...new Set(out)].slice(0,80);
}

export async function fetchParserDiagnostics(){
  const username=process.env.LCP_SCHEDULE_USERNAME;
  const password=process.env.LCP_SCHEDULE_PASSWORD;
  if(!username||!password) throw new Error("LCP schedule credentials missing");

  const jar=new Map();

  const getLogin=await fetch(LOGIN,{
    redirect:"manual",cache:"no-store",
    headers:{"User-Agent":"LCPTMS/0.2 parser diagnostic"}
  });
  mergeJar(jar,setCookies(getLogin));
  const loginHtml=await getLogin.text();
  const hidden=hiddenFields(loginHtml);

  if(!hidden.__VIEWSTATE || !hidden.__EVENTVALIDATION){
    throw new Error("ASP.NET login state missing");
  }

  const form=new FormData();
  for(const [k,v] of Object.entries(hidden)) form.append(k,v);
  form.set("__EVENTTARGET","dnn$ctr$Login$Login_DNN$cmdLogin");
  form.set("__EVENTARGUMENT","");
  if(!form.has("__VIEWSTATEGENERATOR")) form.set("__VIEWSTATEGENERATOR","");
  if(!form.has("__VIEWSTATEENCRYPTED")) form.set("__VIEWSTATEENCRYPTED","");
  form.set("dnn$ctr$Login$Login_DNN$txtUsername",username);
  form.set("dnn$ctr$Login$Login_DNN$txtPassword",password);
  form.set("ScrollTop","");
  form.set("__dnnVariable","");

  const post=await fetch(LOGIN,{
    method:"POST",redirect:"manual",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/0.2 parser diagnostic",
      "Referer":LOGIN,
      Cookie:cookieHeader(jar)
    },
    body:form
  });
  mergeJar(jar,setCookies(post));

  const location=post.headers.get("location");
  const landing=await fetch(location?new URL(location,BASE):OVERVIEW,{
    redirect:"follow",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/0.2 parser diagnostic",
      Cookie:cookieHeader(jar)
    }
  });
  mergeJar(jar,setCookies(landing));
  const landingHtml=await landing.text();
  if(!/LOGOUT|PILOT DOCS/i.test(landingHtml)){
    throw new Error("Authenticated landing not confirmed");
  }

  const traffic=await fetch(TRAFFIC,{
    redirect:"follow",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/0.2 parser diagnostic",
      "Referer":landing.url||OVERVIEW,
      Cookie:cookieHeader(jar)
    }
  });
  const html=await traffic.text();

  const tableCount=(html.match(/<table\b/gi)||[]).length;
  const iframeCount=(html.match(/<iframe\b/gi)||[]).length;
  const formCount=(html.match(/<form\b/gi)||[]).length;

  return {
    diagnosticVersion:"0.2.0",
    trafficStatus:traffic.status,
    finalPath:new URL(traffic.url).pathname,
    htmlLength:html.length,
    tableCount,
    iframeCount,
    formCount,
    titlePresence:titlePresence(html),
    iframeTags:collectTagDiagnostics(html,"iframe",20),
    tableSamples:firstRowsOfTables(html,16),
    dnnIdentifiers:dnnIdentifiers(html),
    candidatePaths:urlPathsFromHtml(html),
    visibleTextSample:stripTags(html).slice(0,2500)
  };
}
