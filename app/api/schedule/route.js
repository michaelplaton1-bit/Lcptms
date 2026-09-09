export const dynamic="force-dynamic";

import { fetchLiveVesselTraffic } from "../../../lib/lcpLiveSchedule.js";
import { projectNormalizedMovement } from "../../../lib/scheduleAdapter.js";
import { buildVesselEnvironmentalIntersection } from "../../../lib/environmentalIntersection.js";

function hhmm(iso){
  if(!iso)return null;
  const d=new Date(iso);
  if(!Number.isFinite(d.getTime()))return null;
  return new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d);
}

function mapLiveRow(row,section){
  const out={__section:section};

  // Preserve raw fields while mapping known site headers to scheduleAdapter inputs.
  const get=(...names)=>{
    for(const n of names){
      if(row[n]!=null && row[n]!=="")return row[n];
    }
    return "";
  };

  out.Vessel=get("VESSEL");
  out.Ordered=get("ORDERED");
  out.PBT=get("PBT");
  out.Status=get("STATUS");
  out.Length=get("LENGTH");
  out.Beam=get("BEAM");
  out.DWT=get("DWT");
  out.Draft=get("DRAFT");
  out.Berth=get("BERTH");
  out["Tug Co."]=get("TUGCO","TUG CO.","TUG CO");
  out.LH=get("LH");
  out["36"]=get("36");
  out.ICWW=get("ICWW");
  out["Off Dock"]=get("OFF DOCK");
  out.Remarks=get("REMARKS");
  out["Last Change"]=get("LAST CHANGE");
  out.Agent=get("AGENT");
  out["Last Port"]=get("LAST PORT");
  out.__raw=row;
  return out;
}

async function loadEnvironment(request){
  try{
    const origin=new URL(request.url).origin;
    const r=await fetch(`${origin}/api/environment`,{cache:"no-store"});
    return r.ok?await r.json():null;
  }catch{return null;}
}

function chicagoIso(value){
  if(!value)return null;
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if(!m)return null;
  const [,y,mo,d,h,mi]=m;
  const naive=Date.UTC(+y,+mo-1,+d,+h,+mi);
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(naive));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const offset=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-naive;
  return new Date(naive-offset).toISOString();
}

export async function GET(request){
  try{
    const [live,env]=await Promise.all([
      fetchLiveVesselTraffic(),
      loadEnvironment(request)
    ]);

    const predictions=(env?.noaa?.operational?.cameron?.prediction||[])
      .map(p=>({...p,isoTime:chicagoIso(p.time)}))
      .filter(p=>p.isoTime);

    const normalizedRows=[
      ...live.moving.map(r=>mapLiveRow(r,"Vessels Moving within the VTIS")),
      ...live.expected.map(r=>mapLiveRow(r,"Vessels Expected To Move")),
      ...live.bar.map(r=>mapLiveRow(r,"Vessels Arriving Or Anchored At Bar")),
      ...live.inPort.map(r=>mapLiveRow(r,"Vessels In Port"))
    ];

    const items=normalizedRows.map((row,index)=>{
      const result=projectNormalizedMovement(row,{
        contextDate:new Date(),
        source:"LakeCharlesPilots.com LIVE",
        sourceRecordId:`live-${index+1}`
      });

      const environmental=buildVesselEnvironmentalIntersection({
        movement:result.movement,
        projection:result.projection,
        cameronPredictions:predictions
      });

      return {
        section:row.__section,
        raw:row.__raw,
        movement:result.movement,
        projection:result.projection,
        environmental,
        display:{
          vessel:result.movement?.vessel?.name,
          direction:result.movement?.movement?.direction,
          status:result.movement?.movement?.status,
          draftFt:result.movement?.vessel?.draftFt,
          berth:result.movement?.movement?.berth,
          ordered:hhmm(result.movement?.schedule?.orderedAt),
          pbt:hhmm(result.movement?.schedule?.pbtAt),
          eta36:hhmm(environmental.eta36),
          eta60:hhmm(environmental.eta60),
          etaICW:hhmm(environmental.etaICW),
          cameronPrediction:environmental.cameronAt36?.speed!=null
            ? `${Number(environmental.cameronAt36.speed).toFixed(2)} kt ${environmental.cameronAt36.phase||""}`.trim()
            : null,
          cameronEffect:environmental.cameronEffect,
          flags:result.movement?.notes?.machineFlags||[]
        }
      };
    });

    return Response.json({
      schemaVersion:"1.0.0-live",
      source:"LakeCharlesPilots.com LIVE",
      fetchedAt:live.fetchedAt,
      environmentConnected:!!env,
      asOf:live.asOf,
      counts:{
        moving:live.moving.length,
        expected:live.expected.length,
        bar:live.bar.length,
        inPort:live.inPort.length
      },
      pilotageService:live.pilotageService,
      channelStatus:live.channelStatus,
      notes:live.notes,
      currentSetRaw:live.currentSet,
      items
    },{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e){
    return Response.json({
      error:"Live schedule connector failed",
      detail:e?.message||"unknown error",
      source:"LakeCharlesPilots.com"
    },{status:500,headers:{"Cache-Control":"no-store, max-age=0"}});
  }
}
