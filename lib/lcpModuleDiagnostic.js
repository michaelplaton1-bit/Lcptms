// LCPTMS module endpoint diagnostic v0.3
// Authenticates to LakeCharlesPilots.com and inspects known schedule JS modules
// for AJAX/fetch endpoint references. Returns safe structural findings only.

const BASE="https://www.lakecharlespilots.com";
const LOGIN=`${BASE}/Login?returnurl=/&popUp=true`;
const OVERVIEW=`${BASE}/Pilots/Overview`;

const MODULES=[
  "/DesktopModules/LCMovingWithin/js/UpdaterGridData.js?v=01.01.20.00",
  "/DesktopModules/LCExpected/js/UpdaterGridData.js?v=01.02.17.00",
  "/DesktopModules/LCInPort/js/UpdaterGridData.js?v=01.01.12.00",
  "/DesktopModules/LCArriving/js/UpdaterGridData.js"
];

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

async function authenticatedJar(){
  const username=process.env.LCP_SCHEDULE_USERNAME;
  const password=process.env.LCP_SCHEDULE_PASSWORD;
  if(!username||!password) throw new Error("LCP schedule credentials missing");

  const jar=new Map();

  const getLogin=await fetch(LOGIN,{
    redirect:"manual",cache:"no-store",
    headers:{"User-Agent":"LCPTMS/0.3 module diagnostic"}
  });
  mergeJar(jar,setCookies(getLogin));
  const loginHtml=await getLogin.text();
  const hidden=hiddenFields(loginHtml);
  if(!hidden.__VIEWSTATE || !hidden.__EVENTVALIDATION) throw new Error("ASP.NET state missing");

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
      "User-Agent":"LCPTMS/0.3 module diagnostic",
      "Referer":LOGIN,
      Cookie:cookieHeader(jar)
    },
    body:form
  });
  mergeJar(jar,setCookies(post));
  if(post.status!==302 && post.status!==303) throw new Error(`Login failed ${post.status}`);

  const loc=post.headers.get("location");
  const landing=await fetch(loc?new URL(loc,BASE):OVERVIEW,{
    redirect:"follow",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/0.3 module diagnostic",
      Cookie:cookieHeader(jar)
    }
  });
  mergeJar(jar,setCookies(landing));
  const landingHtml=await landing.text();
  if(!/LOGOUT|PILOT DOCS/i.test(landingHtml)) throw new Error("Authenticated landing not confirmed");

  return jar;
}

function unique(arr){return [...new Set(arr.filter(Boolean))];}

function analyzeJs(text){
  const urls=[];
  const ajaxCalls=[];
  const snippets=[];

  for(const m of text.matchAll(/["'`](\/[^"'`]+(?:API|api|Get|Update|Grid|Vessel|Traffic|Moving|Expected|InPort|Arriv)[^"'`]*)["'`]/g)){
    urls.push(m[1]);
  }

  for(const m of text.matchAll(/https?:\/\/[^"'`\s)]+/g)){
    urls.push(m[0]);
  }

  for(const m of text.matchAll(/\burl\s*:\s*["'`]([^"'`]+)["'`]/gi)){
    urls.push(m[1]);
    ajaxCalls.push({kind:"url-property",value:m[1]});
  }

  for(const m of text.matchAll(/\b(?:fetch|\$\.getJSON|\$\.get|\$\.post)\s*\(\s*["'`]([^"'`]+)["'`]/gi)){
    urls.push(m[1]);
    ajaxCalls.push({kind:"call",value:m[1]});
  }

  // Safe snippets around ajax/service-related keywords; no cookies/credentials exist in static JS.
  const keys=["ajax","serviceRoot","serviceFramework","url:","fetch(","getJSON","headers:","moduleId","tabId"];
  for(const key of keys){
    let idx=text.toLowerCase().indexOf(key.toLowerCase());
    if(idx>=0){
      snippets.push(text.slice(Math.max(0,idx-180),Math.min(text.length,idx+420)));
    }
  }

  return {
    length:text.length,
    candidateUrls:unique(urls).slice(0,80),
    ajaxCalls:ajaxCalls.slice(0,40),
    snippets:snippets.slice(0,12)
  };
}

export async function moduleDiagnostics(){
  const jar=await authenticatedJar();
  const results=[];

  for(const path of MODULES){
    try{
      const res=await fetch(new URL(path,BASE),{
        redirect:"follow",cache:"no-store",
        headers:{
          "User-Agent":"LCPTMS/0.3 module diagnostic",
          "Referer":`${BASE}/Vessel-Traffic`,
          Cookie:cookieHeader(jar)
        }
      });
      const text=await res.text();
      results.push({
        path,
        status:res.status,
        contentType:res.headers.get("content-type"),
        ...analyzeJs(text)
      });
    }catch(e){
      results.push({path,status:null,error:e?.message||"unknown"});
    }
  }

  return {
    diagnosticVersion:"0.3.0",
    modules:results
  };
}
