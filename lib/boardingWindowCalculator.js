// LCPTMS Boarding Window Calculator v0.1
// Independent NOAA-based calculation with live actual-vs-predicted bias tracking.
// This is VALIDATION MODE until matched against the official LCP current set.

import { BOARDING_WINDOW_RULES } from "./boardingWindowRules.js";

const HOUR=3600000, MIN=60000;

function n(v){
  const x=Number(v);
  return Number.isFinite(x)?x:null;
}
function isoLocal(s){
  if(!s)return null;
  // NOAA lst_ldt strings are local Lake Charles time. Resolve as America/Chicago.
  const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if(!m){
    const d=new Date(s);
    return Number.isFinite(d.getTime())?d.toISOString():null;
  }
  const [,y,mo,d,h,mi]=m;
  const naive=Date.UTC(+y,+mo-1,+d,+h,+mi);
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(naive));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const rendered=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  return new Date(naive-(rendered-naive)).toISOString();
}
function localStamp(offsetMinutes=0){
  const d=new Date(Date.now()+offsetMinutes*MIN);
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{
    timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(d).map(x=>[x.type,x.value]));
  return `${p.year}${p.month}${p.day} ${p.hour}:${p.minute}`;
}
async function getJson(url){
  const r=await fetch(url,{cache:"no-store"});
  const text=await r.text();
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}: ${text.slice(0,240)}`);
  const j=JSON.parse(text);
  if(j?.error)throw new Error(j.error.message||"NOAA error");
  return j;
}
function currentRows(j){
  const candidates=[j?.current_predictions,j?.predictions,j?.data,j?.currentPredictions];
  for(const c of candidates){
    if(Array.isArray(c))return c;
    if(c&&typeof c==="object"){
      for(const v of Object.values(c))if(Array.isArray(v))return v;
    }
  }
  return [];
}
function signedVelocity(row){
  const major=n(row.Velocity_Major)??n(row.velocity_major)??n(row.v)??n(row.velocity);
  if(major!==null)return major;
  const speed=n(row.Speed)??n(row.speed)??n(row.s);
  const phase=String(row.phase||row.type||"").toUpperCase();
  if(speed===null)return null;
  if(phase.includes("EBB"))return -Math.abs(speed);
  if(phase.includes("FLOOD"))return Math.abs(speed);
  return speed;
}
async function fetchCurrentPredictions(hours=168){
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("begin_date",localStamp());
  u.searchParams.set("range",String(hours));
  u.searchParams.set("station","lc0201");
  u.searchParams.set("product","currents_predictions");
  u.searchParams.set("bin","20");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("interval","30");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("vel_type","default");
  u.searchParams.set("application","LCPTMS");
  const j=await getJson(u);
  return currentRows(j).map(row=>({
    isoTime:isoLocal(row.Time||row.t||row.time),
    velocityKt:signedVelocity(row)
  })).filter(x=>x.isoTime&&Number.isFinite(x.velocityKt)).sort((a,b)=>new Date(a.isoTime)-new Date(b.isoTime));
}
async function fetchCurrentActual(){
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station","lc0201");
  u.searchParams.set("product","currents");
  u.searchParams.set("bin","30");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j=await getJson(u);
  const row=(j.data||[]).at(-1);
  if(!row)return null;
  const speed=n(row.s), dir=n(row.d);
  // Approximate signed longitudinal component: north = flood, south = ebb.
  const signed=(speed!==null&&dir!==null)?speed*Math.cos(dir*Math.PI/180):null;
  return {isoTime:isoLocal(row.t),speedKt:speed,directionDeg:dir,velocityKt:signed};
}
async function fetchTideActual(){
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station","8768094");
  u.searchParams.set("product","water_level");
  u.searchParams.set("datum","MLLW");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j=await getJson(u);
  const row=(j.data||[]).at(-1);
  return row?{isoTime:isoLocal(row.t),heightFt:n(row.v)}:null;
}
async function fetchTidePredictions(hours=168){
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("begin_date",localStamp());
  u.searchParams.set("range",String(hours));
  u.searchParams.set("station","8768094");
  u.searchParams.set("product","predictions");
  u.searchParams.set("datum","MLLW");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("interval","h");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j=await getJson(u);
  return (j.predictions||j.data||[]).map(r=>({isoTime:isoLocal(r.t),heightFt:n(r.v)})).filter(x=>x.isoTime&&Number.isFinite(x.heightFt));
}
function nearest(points,iso,key){
  if(!iso||!points.length)return null;
  const t=new Date(iso).getTime();
  let best=null,dist=Infinity;
  for(const p of points){
    const d=Math.abs(new Date(p.isoTime).getTime()-t);
    if(d<dist){dist=d;best=p;}
  }
  return best&&dist<=90*MIN?best:null;
}
function interpCross(a,b,target){
  const va=a.velocityKt-target, vb=b.velocityKt-target;
  if(va===0)return new Date(a.isoTime).getTime();
  if(vb===0)return new Date(b.isoTime).getTime();
  if(va*vb>0)return null;
  const ta=new Date(a.isoTime).getTime(),tb=new Date(b.isoTime).getTime();
  const f=(target-a.velocityKt)/(b.velocityKt-a.velocityKt);
  return ta+f*(tb-ta);
}
function crossings(points,target,mode){
  const out=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    const t=interpCross(a,b,target);
    if(t===null)continue;
    const rising=b.velocityKt>a.velocityKt;
    if(mode==="rising"&&!rising)continue;
    if(mode==="falling"&&rising)continue;
    out.push(t);
  }
  return out;
}
function zeroCross(points,from,to){
  const out=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(from==="EBB"&&to==="FLOOD"&&a.velocityKt<0&&b.velocityKt>=0){
      const t=interpCross(a,b,0); if(t!==null)out.push(t);
    }
    if(from==="FLOOD"&&to==="EBB"&&a.velocityKt>0&&b.velocityKt<=0){
      const t=interpCross(a,b,0); if(t!==null)out.push(t);
    }
  }
  return out;
}
function pairWindows(opens,closes){
  const o=[...opens].sort((a,b)=>a-b),c=[...closes].sort((a,b)=>a-b),out=[];
  let j=0;
  for(const open of o){
    while(j<c.length&&c[j]<=open)j++;
    if(j<c.length){
      out.push({open:new Date(open).toISOString(),close:new Date(c[j]).toISOString()});
      j++;
    }
  }
  return out;
}
function rawWindows(points,ruleId){
  if(!points.length)return [];
  if(ruleId==="INBOUND_DEEP_DRAFT"){
    const opens=zeroCross(points,"EBB","FLOOD").map(t=>t-2*HOUR);
    const closes=crossings(points,-1.0,"falling").map(t=>t-3.5*HOUR);
    return pairWindows(opens,closes);
  }
  if(ruleId==="CLNG_OUTBOUND_LE_38"){
    const opens=crossings(points,1.5,"falling").map(t=>t-2.5*HOUR);
    const closes=crossings(points,1.5,"rising").map(t=>t-3.5*HOUR);
    return pairWindows(opens,closes);
  }
  if(ruleId==="CLNG_OUTBOUND_GT_38"){
    const opens=crossings(points,1.0,"falling").map(t=>t-2.5*HOUR);
    const closes=crossings(points,1.0,"rising").map(t=>t-3.5*HOUR);
    return pairWindows(opens,closes);
  }
  if(ruleId==="VG_INBOUND"){
    const ebbOpen=crossings(points,-1.5,"rising").map(t=>t-3*HOUR);   // |ebb| decreasing
    const floodOpen=crossings(points,1.5,"falling").map(t=>t-2*HOUR); // flood decreasing
    const ebbClose=crossings(points,-1.5,"falling").map(t=>t-3*HOUR); // ebb increasing magnitude
    const floodClose=crossings(points,1.5,"rising").map(t=>t-3*HOUR);
    return pairWindows([...ebbOpen,...floodOpen],[...ebbClose,...floodClose]);
  }
  if(ruleId==="VG_OUTBOUND"){
    const opens=[
      ...crossings(points,-1.5,"rising"),
      ...crossings(points,1.5,"falling")
    ].map(t=>t-30*MIN);
    const closes=[
      ...crossings(points,-1.5,"falling"),
      ...crossings(points,1.5,"rising")
    ].map(t=>t-90*MIN);
    return pairWindows(opens,closes);
  }
  return [];
}
function adjustedCurve(points,currentResidual){
  if(!Number.isFinite(currentResidual))return points;
  const now=Date.now(), decay=6*HOUR;
  return points.map(p=>{
    const dt=Math.max(0,new Date(p.isoTime).getTime()-now);
    const weight=Math.max(0,1-dt/decay);
    return {...p,velocityKt:p.velocityKt+currentResidual*weight};
  });
}
function trimFuture(windows,hours=168){
  const now=Date.now()-30*MIN,max=Date.now()+hours*HOUR;
  return windows.filter(w=>new Date(w.close).getTime()>=now&&new Date(w.open).getTime()<=max).slice(0,20);
}

export async function calculateBoardingWindows(){
  const [predRes,curRes,tideActRes,tidePredRes]=await Promise.allSettled([
    fetchCurrentPredictions(168),fetchCurrentActual(),fetchTideActual(),fetchTidePredictions(168)
  ]);
  if(predRes.status!=="fulfilled")throw predRes.reason;

  const prediction=predRes.value;
  const currentActual=curRes.status==="fulfilled"?curRes.value:null;
  const tideActual=tideActRes.status==="fulfilled"?tideActRes.value:null;
  const tidePrediction=tidePredRes.status==="fulfilled"?tidePredRes.value:[];

  const predictedAtActual=nearest(prediction,currentActual?.isoTime,"velocityKt");
  const currentResidualKt=(currentActual&&predictedAtActual)
    ? currentActual.velocityKt-predictedAtActual.velocityKt:null;

  const tidePredAtActual=nearest(tidePrediction,tideActual?.isoTime,"heightFt");
  const tideResidualFt=(tideActual&&tidePredAtActual)
    ? tideActual.heightFt-tidePredAtActual.heightFt:null;

  const adjusted=adjustedCurve(prediction,currentResidualKt);

  const categories=BOARDING_WINDOW_RULES.map(rule=>({
    id:rule.id,
    label:rule.label,
    raw:trimFuture(rawWindows(prediction,rule.id)),
    biasAdjusted:trimFuture(rawWindows(adjusted,rule.id))
  }));

  return {
    calculatorVersion:"0.1.0",
    mode:"VALIDATION",
    generatedAt:new Date().toISOString(),
    source:{
      currentPrediction:"NOAA CO-OPS lc0201 bin 20",
      currentActual:"NOAA CO-OPS lc0201 bin 30",
      tidePrediction:"NOAA CO-OPS 8768094 predictions MLLW",
      tideActual:"NOAA CO-OPS 8768094 water_level MLLW"
    },
    environmentalBias:{
      current:{
        actual:currentActual,
        predictedAtActual,
        residualKt:Number.isFinite(currentResidualKt)?currentResidualKt:null,
        adjustment:"Residual decays linearly to zero over 6 hours in the bias-adjusted curve."
      },
      tide:{
        actual:tideActual,
        predictedAtActual:tidePredAtActual,
        residualFt:Number.isFinite(tideResidualFt)?tideResidualFt:null,
        adjustment:"Tracked as a learning/calibration signal. Not yet applied to OPEN/CLOSE until exact tide-height criteria are validated."
      }
    },
    categories
  };
}
