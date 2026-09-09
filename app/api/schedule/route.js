export const dynamic="force-dynamic";
import { projectNormalizedMovement } from "../../../lib/scheduleAdapter.js";
import { buildVesselEnvironmentalIntersection } from "../../../lib/environmentalIntersection.js";

function hhmm(iso){if(!iso)return null;const d=new Date(iso);if(!Number.isFinite(d.getTime()))return null;return new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d);}
function chicagoIso(value){
  if(!value)return null;
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); if(!m)return null;
  const [,y,mo,d,h,mi]=m; const naive=Date.UTC(+y,+mo-1,+d,+h,+mi);
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(naive));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const offset=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-naive;
  return new Date(naive-offset).toISOString();
}
async function environment(request){try{const o=new URL(request.url).origin,r=await fetch(`${o}/api/environment`,{cache:"no-store"});return r.ok?await r.json():null;}catch{return null;}}
const ROWS=[
{Vessel:"MADELYN GRACE",Ordered:"09/0700",PBT:"09/1130",Status:"O/B Dck/Sail",Length:"600",Beam:"106",DWT:"50137",Draft:"40' 0\"",Berth:"CS/B","Tug Co.":"BAY",LH:"HMT",Remarks:"DELAY TRAFFIC/TUGS"},
{Vessel:"HAFNIA SWIFT",Ordered:"09/1100",PBT:"09/1530",Status:"O/B Dck/Sail",Remarks:""},
{Vessel:"MARVEL HERON",Status:"I/B 09/0549",Length:"976",Beam:"161",DWT:"92659",Draft:"33' 2\"",Berth:"CLNG-S","Tug Co.":"MT",LH:"TSI","36":"09/0740",Remarks:"AOB SW CC (DC-TB) ** 2 PILOTS"},
{Vessel:"CL AGATHA CHRISTIE",Status:"O/B","Off Dock":"09/0954",ICWW:"09/1110",Remarks:""}
];
export async function GET(request){
 const env=await environment(request);
 const predictions=(env?.noaa?.operational?.cameron?.prediction||[]).map(p=>({...p,isoTime:chicagoIso(p.time)})).filter(p=>p.isoTime);
 const items=ROWS.map((row,i)=>{
   const r=projectNormalizedMovement(row,{contextDate:new Date(),source:"MANUAL_DEMO",sourceRecordId:`demo-${i+1}`});
   const x=buildVesselEnvironmentalIntersection({movement:r.movement,projection:r.projection,cameronPredictions:predictions});
   return {movement:r.movement,projection:r.projection,environmental:x,display:{
    vessel:r.movement?.vessel?.name,direction:r.movement?.movement?.direction,draftFt:r.movement?.vessel?.draftFt,berth:r.movement?.movement?.berth,pbt:hhmm(r.movement?.schedule?.pbtAt),
    eta36:hhmm(x.eta36),eta60:hhmm(x.eta60),etaICW:hhmm(x.etaICW),
    cameronPrediction:x.cameronAt36?.speed!=null?`${Number(x.cameronAt36.speed).toFixed(2)} kt ${x.cameronAt36.phase||""}`.trim():null,
    cameronEffect:x.cameronEffect,flags:r.movement?.notes?.machineFlags||[]
   }};
 });
 return Response.json({schemaVersion:"0.3.0",source:"MANUAL DEMO — live connector pending",environmentConnected:!!env,cameronPredictionPoints:predictions.length,items},{headers:{"Cache-Control":"no-store"}});
}
