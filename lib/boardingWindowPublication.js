import { put, get } from "@vercel/blob";
import { calculateBoardingWindows } from "./boardingWindowCalculator.js";

const PATH="lcptms-learning-v1/publication/boarding-windows.json";

function token(){return process.env.BLOB_READ_WRITE_TOKEN;}
function chicagoParts(date=new Date()){
  return Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(date).map(x=>[x.type,x.value]));
}
function periodId(date=new Date()){
  const p=chicagoParts(date);
  const half=Number(p.hour)<12?"00":"12";
  return `${p.year}-${p.month}-${p.day}T${half}:00-America/Chicago`;
}
function nextBoundary(date=new Date()){
  const p=chicagoParts(date);
  const targetHour=Number(p.hour)<12?12:24;
  // Build from current local components then resolve through timezone formatter offset.
  const day=new Date(Date.UTC(+p.year,+p.month-1,+p.day,targetHour,0));
  return day.toISOString();
}
function roundQuarter(iso){
  const t=new Date(iso).getTime();
  if(!Number.isFinite(t))return iso;
  const q=15*60*1000;
  return new Date(Math.round(t/q)*q).toISOString();
}
function publishableCategories(calc){
  return (calc?.categories||[]).map(cat=>({
    id:cat.id,label:cat.label,
    windows:(cat.biasAdjusted?.length?cat.biasAdjusted:cat.raw||[]).map(w=>({
      open:roundQuarter(w.open),
      close:roundQuarter(w.close)
    }))
  }));
}
async function readExisting(){
  if(!token())return null;
  try{
    const r=await get(PATH,{access:"private",token:token()});
    if(!r||r.statusCode!==200)return null;
    return JSON.parse(await new Response(r.stream).text());
  }catch{return null;}
}
export async function getPublishedBoardingWindows(){
  const currentPeriod=periodId();
  const existing=await readExisting();
  if(existing?.periodId===currentPeriod)return existing;

  const calc=await calculateBoardingWindows();
  const published={
    publicationVersion:"0.1.0",
    periodId:currentPeriod,
    publishedAt:new Date().toISOString(),
    expiresAt:nextBoundary(),
    displayResolutionMinutes:15,
    sourceMode:"LCPTMS_BIAS_ADJUSTED_IF_AVAILABLE",
    categories:publishableCategories(calc),
    environmentalBiasAtPublication:calc.environmentalBias
  };

  if(token()){
    await put(PATH,JSON.stringify(published),{
      access:"private",addRandomSuffix:false,allowOverwrite:true,
      contentType:"application/json",token:token()
    });
  }
  return published;
}
