export const dynamic="force-dynamic";

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
function sections(html){
  const t=String(html||"").toUpperCase();
  return {
    movingSectionFound:t.includes("VESSELS MOVING WITHIN THE VTIS"),
    expectedSectionFound:t.includes("VESSELS EXPECTED TO MOVE"),
    barSectionFound:t.includes("VESSELS ARRIVING OR ANCHORED AT BAR"),
    inPortSectionFound:t.includes("VESSELS IN PORT"),
    notesSectionFound:t.includes("NOTES AS OF")||t.includes(">NOTES<"),
    currentSetSectionFound:t.includes("LC AI CURRENT SET"),
    channelStatusFound:t.includes("CHANNEL STATUS"),
    pilotageServiceFound:t.includes("PILOTAGE SERVICE")
  };
}
function safePath(url){try{return new URL(url).pathname;}catch{return null;}}

export async function GET(){
  const username=process.env.LCP_SCHEDULE_USERNAME;
  const password=process.env.LCP_SCHEDULE_PASSWORD;
  const out={
    diagnosticVersion:"0.2.0",
    credentialsPresent:!!username&&!!password,
    loginGet:false,
    aspNetStateDetected:false,
    multipartLoginAttempted:false,
    loginPostStatus:null,
    redirectLocationPath:null,
    overviewAuthenticated:false,
    vesselTrafficAccessible:false,
    loginSucceeded:false,
    sections:{},
    notes:[]
  };

  if(!username||!password){
    out.notes.push("Vercel schedule credentials are missing.");
    return Response.json(out,{status:500,headers:{"Cache-Control":"no-store"}});
  }

  const jar=new Map();

  try{
    // 1) GET actual popup login and preserve initial ASP.NET/session cookies.
    const getLogin=await fetch(LOGIN,{
      redirect:"manual",cache:"no-store",
      headers:{"User-Agent":"LCPTMS/0.2 read-only schedule connector"}
    });
    mergeJar(jar,setCookies(getLogin));
    const loginHtml=await getLogin.text();
    out.loginGet=getLogin.ok;

    const hidden=hiddenFields(loginHtml);
    out.aspNetStateDetected=!!hidden.__VIEWSTATE && !!hidden.__EVENTVALIDATION;
    out.hiddenFieldNames=Object.keys(hidden); // names only; never values.

    if(!out.aspNetStateDetected){
      out.notes.push("ASP.NET VIEWSTATE/EVENTVALIDATION not detected on login GET.");
      return Response.json(out,{headers:{"Cache-Control":"no-store"}});
    }

    // 2) Reproduce browser's multipart/form-data Web Forms submission.
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

    out.multipartLoginAttempted=true;

    const post=await fetch(LOGIN,{
      method:"POST",
      redirect:"manual",
      cache:"no-store",
      headers:{
        "User-Agent":"LCPTMS/0.2 read-only schedule connector",
        "Referer":LOGIN,
        ...(jar.size?{Cookie:cookieHeader(jar)}:{})
      },
      body:form
    });

    out.loginPostStatus=post.status;
    mergeJar(jar,setCookies(post));
    const location=post.headers.get("location");
    out.redirectLocationPath=safePath(location);

    // 3) Follow the authenticated landing request using the updated cookie jar.
    const landingUrl=location ? new URL(location,BASE).toString() : OVERVIEW;
    const landing=await fetch(landingUrl,{
      redirect:"follow",cache:"no-store",
      headers:{
        "User-Agent":"LCPTMS/0.2 read-only schedule connector",
        ...(jar.size?{Cookie:cookieHeader(jar)}:{})
      }
    });
    mergeJar(jar,setCookies(landing));
    const landingHtml=await landing.text();
    const landingUpper=landingHtml.toUpperCase();
    out.overviewStatus=landing.status;
    out.overviewAuthenticated=
      landing.ok &&
      (landingUpper.includes("LOGOUT") || landingUpper.includes("PILOT DOCS"));

    // 4) Fetch Vessel Traffic with authenticated session.
    const traffic=await fetch(TRAFFIC,{
      redirect:"follow",cache:"no-store",
      headers:{
        "User-Agent":"LCPTMS/0.2 read-only schedule connector",
        "Referer":landing.url||OVERVIEW,
        ...(jar.size?{Cookie:cookieHeader(jar)}:{})
      }
    });
    const html=await traffic.text();
    out.vesselTrafficStatus=traffic.status;
    out.sections=sections(html);
    const found=Object.values(out.sections).filter(Boolean).length;
    out.vesselTrafficAccessible=traffic.ok && found>=2;
    out.loginSucceeded=out.overviewAuthenticated && out.vesselTrafficAccessible;

    out.notes.push(out.loginSucceeded
      ?"Authenticated Vessel Traffic content confirmed."
      :"Authentication sequence completed, but authenticated Vessel Traffic content was not confirmed.");

    // Deliberately do not expose cookies, credentials, hidden values, or response HTML.
    return Response.json(out,{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e){
    out.notes.push(`Connector error: ${e?.message||"unknown error"}`);
    return Response.json(out,{status:500,headers:{"Cache-Control":"no-store, max-age=0"}});
  }
}
