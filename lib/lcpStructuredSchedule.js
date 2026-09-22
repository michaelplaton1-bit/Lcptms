// LCPTMS Structured Lake Charles Pilots Schedule Connector v1.0
// Uses LakeCharlesSQLDataService directly instead of scraping rendered HTML.

const BASE="https://www.lakecharlespilots.com";
const LOGIN=`${BASE}/Login?returnurl=/&popUp=true`;
const OVERVIEW=`${BASE}/Pilots/Overview`;
const API=`${BASE}/DesktopModules/LakeCharlesSQLDataService/API/Main`;

const ENDPOINTS=Object.freeze({
  moving:"GetRundownMovingWithin",
  expected:"GetRundownExpected",
  arriving:"GetArriving",
  inPort:"GetInPort",
  notes:"GetNotes",
  tideSet:"GetTideSetForDateAndDays"
});

function setCookies(res){
  const h=res.headers;
  return typeof h.getSetCookie==="function"
    ? h.getSetCookie()
    : [h.get("set-cookie")].filter(Boolean);
}
function mergeJar(jar,values=[]){
  for(const raw of values){
    const pair=String(raw).split(";")[0];
    const i=pair.indexOf("=");
    if(i>0) jar.set(pair.slice(0,i),pair.slice(i+1));
  }
}
function cookieHeader(jar){
  return [...jar].map(([k,v])=>`${k}=${v}`).join("; ");
}
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

async function authenticate(){
  const username=process.env.LCP_SCHEDULE_USERNAME;
  const password=process.env.LCP_SCHEDULE_PASSWORD;
  if(!username||!password) throw new Error("LCP schedule credentials missing");

  const jar=new Map();

  const getLogin=await fetch(LOGIN,{
    redirect:"manual",cache:"no-store",
    headers:{"User-Agent":"LCPTMS/1.0 structured schedule connector"}
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
    method:"POST",
    redirect:"manual",
    cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/1.0 structured schedule connector",
      "Referer":LOGIN,
      Cookie:cookieHeader(jar)
    },
    body:form
  });
  mergeJar(jar,setCookies(post));

  if(post.status!==302 && post.status!==303){
    throw new Error(`LCP login failed: ${post.status}`);
  }

  const location=post.headers.get("location");
  const landing=await fetch(location?new URL(location,BASE):OVERVIEW,{
    redirect:"follow",
    cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/1.0 structured schedule connector",
      Cookie:cookieHeader(jar)
    }
  });
  mergeJar(jar,setCookies(landing));
  const landingHtml=await landing.text();

  if(!/LOGOUT|PILOT DOCS/i.test(landingHtml)){
    throw new Error("Authenticated LCP landing page not confirmed");
  }

  return jar;
}

async function apiGet(jar, endpoint, params={}){
  const url=new URL(`${API}/${endpoint}`);
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined && v!==null && v!=="") url.searchParams.set(k,String(v));
  }

  const res=await fetch(url,{
    method:"GET",
    cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/1.0 structured schedule connector",
      "Accept":"application/json, text/plain, */*",
      "Referer":`${BASE}/Vessel-Traffic`,
      Cookie:cookieHeader(jar)
    }
  });

  const text=await res.text();
  let data=null;
  try{ data=JSON.parse(text); }catch{}

  return {
    ok:res.ok,
    status:res.status,
    contentType:res.headers.get("content-type"),
    data,
    rawText:data==null ? text.slice(0,5000) : null
  };
}

function unwrapArray(data){
  if(Array.isArray(data)) return data;
  if(!data || typeof data!=="object") return [];

  const candidates=[
    data.data, data.items, data.results, data.value,
    data.Data, data.Items, data.Results, data.Value,
    data.d
  ];

  for(const c of candidates){
    if(Array.isArray(c)) return c;
    if(c && typeof c==="object"){
      for(const nested of Object.values(c)){
        if(Array.isArray(nested)) return nested;
      }
    }
  }

  // Sometimes the response is an object keyed by row ids.
  const vals=Object.values(data);
  if(vals.length && vals.every(v=>v && typeof v==="object" && !Array.isArray(v))){
    return vals;
  }

  return [];
}

function shape(data){
  const arr=unwrapArray(data);
  return {
    topLevelType:Array.isArray(data)?"array":data===null?"null":typeof data,
    count:arr.length,
    firstRecordKeys:arr[0] && typeof arr[0]==="object"
      ? Object.keys(arr[0]).slice(0,80)
      : []
  };
}

function officialWindowScore(data){
  let score=0;
  const stack=[data];
  while(stack.length){
    const value=stack.pop();
    if(Array.isArray(value)){stack.push(...value);continue;}
    if(!value||typeof value!=="object")continue;
    const keys=Object.keys(value).map(k=>k.toUpperCase());
    const hasOpen=keys.some(k=>["OPEN","OPENTIME","WINDOWOPEN","START","STARTTIME","FROM","BEGIN","BEGINTIME","OPENING"].includes(k));
    const hasClose=keys.some(k=>["CLOSE","CLOSETIME","WINDOWCLOSE","END","ENDTIME","TO","STOP","CLOSING"].includes(k));
    const text=JSON.stringify(value).toUpperCase();
    if(hasOpen&&hasClose)score+=10;
    if(/INBOUND|OUTBOUND/.test(text))score+=2;
    if(/VENTURE|CAMERON|CLNG|DEEP/.test(text))score+=2;
    stack.push(...Object.values(value).filter(v=>v&&typeof v==="object"));
  }
  return score;
}

export async function fetchStructuredSchedule(options={}){
  const jar=await authenticate();

  const [moving,expected,arriving,inPort]=await Promise.all([
    apiGet(jar,ENDPOINTS.moving),
    apiGet(jar,ENDPOINTS.expected),
    apiGet(jar,ENDPOINTS.arriving),
    apiGet(jar,ENDPOINTS.inPort)
  ]);

  // Notes endpoint is known to accept query values, but exact filters vary.
  // Keep these optional until the main vessel feeds are verified.
  let notes=null;
  if(options.includeNotes){
    notes=await apiGet(jar,ENDPOINTS.notes,{
      MyFilter:options.notesFilter || "PILOT",
      type:options.notesType || "NOTES"
    });
  }

  return {
    source:"LakeCharlesSQLDataService",
    fetchedAt:new Date().toISOString(),
    native:{
      moving:moving.data,
      expected:expected.data,
      arriving:arriving.data,
      inPort:inPort.data,
      notes:notes?.data ?? null
    },
    arrays:{
      moving:unwrapArray(moving.data),
      expected:unwrapArray(expected.data),
      arriving:unwrapArray(arriving.data),
      inPort:unwrapArray(inPort.data)
    },
    diagnostics:{
      moving:{status:moving.status,contentType:moving.contentType,...shape(moving.data)},
      expected:{status:expected.status,contentType:expected.contentType,...shape(expected.data)},
      arriving:{status:arriving.status,contentType:arriving.contentType,...shape(arriving.data)},
      inPort:{status:inPort.status,contentType:inPort.contentType,...shape(inPort.data)},
      notes:notes ? {status:notes.status,contentType:notes.contentType,...shape(notes.data)} : null
    }
  };
}

export async function fetchRundownDetail(logid){
  if(!logid) throw new Error("logid required");
  const jar=await authenticate();
  return apiGet(jar,"RundownDetailForLogID",{logid});
}

export async function fetchVesselHistory(vesselId){
  if(!vesselId) throw new Error("vesselId required");
  const jar=await authenticate();
  return apiGet(jar,"GetVesselHistory",{vesselId});
}

export async function fetchVesselNotes(vesselId){
  if(!vesselId) throw new Error("vesselId required");
  const jar=await authenticate();
  return apiGet(jar,"GetVesselNotes",{vesselId});
}


// v1.2: familiar schedule note blocks.
export async function fetchNotesBundle(){
  const jar=await authenticate();
  const [pilotage,channel,notes]=await Promise.all([
    apiGet(jar,ENDPOINTS.notes,{type:"PILOT"}),
    apiGet(jar,ENDPOINTS.notes,{type:"CHANNEL"}),
    apiGet(jar,ENDPOINTS.notes,{type:"NOTES"})
  ]);
  return {
    pilotage:pilotage.data,
    channel:channel.data,
    notes:notes.data
  };
}


function localDateParts(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(date).map(x=>[x.type,x.value]));
  return {
    iso:`${parts.year}-${parts.month}-${parts.day}`,
    us:`${parts.month}/${parts.day}/${parts.year}`,
    compact:`${parts.year}${parts.month}${parts.day}`
  };
}
function currentSetCandidates(days=14){
  const d=localDateParts();
  return [
    {name:"start_us_days",params:{start:d.us,days}},
    {name:"start_iso_days",params:{start:d.iso,days}},
    {name:"date_us_days",params:{date:d.us,days}},
    {name:"date_iso_days",params:{date:d.iso,days}},
    {name:"startDate_us_days",params:{startDate:d.us,days}},
    {name:"Start_us_Days",params:{Start:d.us,Days:days}},
    {name:"start_compact_days",params:{start:d.compact,days}},
    {name:"start_utc_days",params:{start:new Date().toUTCString(),days}},
    {name:"no_params",params:{}}
  ];
}
async function authenticatedTrafficHtml(jar){
  const res=await fetch(`${BASE}/Vessel-Traffic`,{
    redirect:"follow",cache:"no-store",
    headers:{
      "User-Agent":"LCPTMS/1.0 current-set diagnostic",
      Cookie:cookieHeader(jar)
    }
  });
  return res.text();
}
function snippetsAround(html,needle){
  const out=[];
  const upper=String(html||"").toUpperCase(),n=needle.toUpperCase();
  let pos=0;
  while((pos=upper.indexOf(n,pos))>=0 && out.length<12){
    out.push(String(html).slice(Math.max(0,pos-400),Math.min(html.length,pos+900)));
    pos+=n.length;
  }
  return out;
}

export async function diagnoseOfficialCurrentSet({days=14}={}){
  const jar=await authenticate();
  const attempts=[];
  for(const c of currentSetCandidates(days)){
    const result=await apiGet(jar,ENDPOINTS.tideSet,c.params);
    attempts.push({
      name:c.name,
      params:c.params,
      status:result.status,
      contentType:result.contentType,
      shape:shape(result.data),
      sample:result.data && typeof result.data==="object"
        ? JSON.stringify(result.data).slice(0,1200)
        : result.rawText
    });
  }
  let htmlSnippets=[];
  try{
    const html=await authenticatedTrafficHtml(jar);
    htmlSnippets=snippetsAround(html,"GetTideSetForDateAndDays");
  }catch{}
  return {
    diagnosticVersion:"0.2.0",
    fetchedAt:new Date().toISOString(),
    attempts,
    htmlSnippets
  };
}

export async function fetchOfficialCurrentSet({days=14}={}){
  const jar=await authenticate();
  let best=null;
  const attempts=[];
  for(const c of currentSetCandidates(days)){
    const result=await apiGet(jar,ENDPOINTS.tideSet,c.params);
    const s=shape(result.data);
    const windowScore=officialWindowScore(result.data);
    attempts.push({name:c.name,params:c.params,status:result.status,windowScore,...s});
    if(result.ok && s.count>0 && (!best||windowScore>best.windowScore)){
      best={candidate:c,result,s,windowScore};
    }
  }
  // Preserve existing behavior if no candidate is populated, but expose diagnostics.
  if(!best){
    const fallback=await apiGet(jar,ENDPOINTS.tideSet,{start:localDateParts().us,days});
    return {
      fetchedAt:new Date().toISOString(),
      data:fallback.data,
      diagnostics:{
        status:fallback.status,
        contentType:fallback.contentType,
        ...shape(fallback.data),
        selectedCandidate:null,
        attempts
      }
    };
  }
  return {
    fetchedAt:new Date().toISOString(),
    data:best.result.data,
    diagnostics:{
      status:best.result.status,
      contentType:best.result.contentType,
      ...best.s,
      selectedCandidate:best.candidate.name,
      selectedParams:best.candidate.params,
      selectedWindowScore:best.windowScore,
      attempts
    }
  };
}
