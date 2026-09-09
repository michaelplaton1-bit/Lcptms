// LCPTMS LakeCharlesPilots.com live schedule connector v0.1
// Authenticates server-side using Vercel environment variables and parses Vessel Traffic HTML.

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
    if(i>0)jar.set(pair.slice(0,i),pair.slice(i+1));
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
    .replace(/<\/p>/gi,"\n")
    .replace(/<\/div>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\r/g,"")
    .replace(/[ \t]+/g," ")
    .replace(/\n[ \t]+/g,"\n")
    .trim();
}

function cellText(cellHtml){
  return stripTags(cellHtml).replace(/\s+/g," ").trim();
}

function tableRows(tableHtml){
  const rows=[];
  const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tm;
  while((tm=trRe.exec(tableHtml))){
    const cells=[];
    const tdRe=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while((cm=tdRe.exec(tm[1]))) cells.push(cellText(cm[1]));
    if(cells.length) rows.push(cells);
  }
  return rows;
}

function normalizeHeader(s){
  return String(s||"").trim().toUpperCase().replace(/\s+/g," ");
}

function rowsToObjects(rows){
  if(rows.length<2)return [];
  const headers=rows[0].map(normalizeHeader);
  return rows.slice(1).filter(r=>r.some(Boolean)).map(r=>{
    const o={};
    headers.forEach((h,i)=>{ o[h]=r[i]??""; });
    return o;
  });
}

function sectionBlock(html,title,nextTitles=[]){
  const idx=html.toUpperCase().indexOf(title.toUpperCase());
  if(idx<0)return null;
  let end=html.length;
  for(const next of nextTitles){
    const j=html.toUpperCase().indexOf(next.toUpperCase(),idx+title.length);
    if(j>=0 && j<end) end=j;
  }
  return html.slice(idx,end);
}

function firstTable(block){
  if(!block)return null;
  const m=block.match(/<table\b[\s\S]*?<\/table>/i);
  return m?.[0]||null;
}

function parseNamedTable(html,title,nextTitles){
  const block=sectionBlock(html,title,nextTitles);
  const table=firstTable(block);
  if(!table)return [];
  return rowsToObjects(tableRows(table));
}

function parseTextSection(html,title,nextTitles){
  const block=sectionBlock(html,title,nextTitles);
  return block ? stripTags(block) : null;
}

function findAsOf(text){
  const m=String(text||"").match(/AS OF\s+([0-9\/\-: ]+)/i);
  return m?.[1]?.trim()||null;
}

export async function fetchLiveVesselTraffic(){
  const username=process.env.LCP_SCHEDULE_USERNAME;
  const password=process.env.LCP_SCHEDULE_PASSWORD;
  if(!username||!password) throw new Error("LCP schedule credentials missing");

  const jar=new Map();

  const getLogin=await fetch(LOGIN,{
    redirect:"manual",cache:"no-store",
    headers:{"User-Agent":"LCPTMS/1.0 read-only schedule connector"}
  });
  mergeJar(jar,setCookies(getLogin));
  const loginHtml=await getLogin.text();
  const hidden=hiddenFields(loginHtml);

  if(!hidden.__VIEWSTATE || !hidden.__EVENTVALIDATION){
    throw new Error("LCP ASP.NET login state not detected");
  }

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
    headers:{
      "User-Agent":"LCPTMS/1.0 read-only schedule connector",
      "Referer":LOGIN,
      Cookie:cookieHeader(jar)
    },
    body:form
  });
  mergeJar(jar,setCookies(post));
  if(post.status!==302 && post.status!==303){
    throw new Error(`LCP login failed with status ${post.status}`);
  }

  const location=post.headers.get("location");
  const landing=await fetch(location?new URL(location,BASE):OVERVIEW,{
    redirect:"follow",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/1.0 read-only schedule connector",
      Cookie:cookieHeader(jar)
    }
  });
  mergeJar(jar,setCookies(landing));
  const landingHtml=await landing.text();
  if(!/LOGOUT|PILOT DOCS/i.test(landingHtml)) throw new Error("LCP authenticated landing not confirmed");

  const traffic=await fetch(TRAFFIC,{
    redirect:"follow",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/1.0 read-only schedule connector",
      "Referer":landing.url||OVERVIEW,
      Cookie:cookieHeader(jar)
    }
  });
  const html=await traffic.text();
  if(!traffic.ok) throw new Error(`Vessel Traffic fetch failed ${traffic.status}`);

  const titles=[
    "VESSELS MOVING WITHIN THE VTIS",
    "VESSELS EXPECTED TO MOVE",
    "NOTES",
    "VESSELS ARRIVING OR ANCHORED AT BAR",
    "VESSELS IN PORT",
    "LC AI CURRENT SET"
  ];

  const moving=parseNamedTable(html,titles[0],titles.slice(1));
  const expected=parseNamedTable(html,titles[1],titles.slice(2));
  const notes=parseTextSection(html,titles[2],titles.slice(3));
  const bar=parseNamedTable(html,titles[3],titles.slice(4));
  const inPort=parseNamedTable(html,titles[4],titles.slice(5));
  const currentSet=parseTextSection(html,titles[5],[]);

  const pilotageService=parseTextSection(html,"PILOTAGE SERVICE",["CHANNEL STATUS",titles[0]]);
  const channelStatus=parseTextSection(html,"CHANNEL STATUS",[titles[0]]);

  return {
    source:"LakeCharlesPilots.com",
    fetchedAt:new Date().toISOString(),
    asOf:{
      moving:findAsOf(stripTags(sectionBlock(html,titles[0],titles.slice(1)))),
      expected:findAsOf(stripTags(sectionBlock(html,titles[1],titles.slice(2)))),
      bar:findAsOf(stripTags(sectionBlock(html,titles[3],titles.slice(4)))),
      inPort:findAsOf(stripTags(sectionBlock(html,titles[4],titles.slice(5))))
    },
    moving,
    expected,
    bar,
    inPort,
    notes,
    currentSet,
    pilotageService,
    channelStatus,
    diagnostics:{
      movingRows:moving.length,
      expectedRows:expected.length,
      barRows:bar.length,
      inPortRows:inPort.length
    }
  };
}
