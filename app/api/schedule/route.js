export const dynamic="force-dynamic";

import { fetchStructuredSchedule } from "../../../lib/lcpStructuredSchedule.js";
import { mapNativeLcpSection } from "../../../lib/lcpNativeMapper.js";
import { projectNormalizedMovement } from "../../../lib/scheduleAdapter.js";
import { buildVesselEnvironmentalIntersection } from "../../../lib/environmentalIntersection.js";

function hhmm(iso){
  if(!iso) return null;
  const d=new Date(iso);
  if(!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",
    hour:"2-digit",
    minute:"2-digit",
    hourCycle:"h23"
  }).format(d);
}

function chicagoIso(value){
  if(!value) return null;

  const direct=new Date(value);
  if(/^\d{4}-\d{2}-\d{2}T/.test(String(value)) && Number.isFinite(direct.getTime())){
    return direct.toISOString();
  }

  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if(!m) return null;

  const [,y,mo,d,h,mi]=m;
  const naive=Date.UTC(+y,+mo-1,+d,+h,+mi);

  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date(naive));

  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const rendered=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  const offset=rendered-naive;

  return new Date(naive-offset).toISOString();
}

async function loadEnvironment(request){
  try{
    const origin=new URL(request.url).origin;
    const r=await fetch(`${origin}/api/environment`,{cache:"no-store"});
    return r.ok ? await r.json() : null;
  }catch{
    return null;
  }
}

function normalizedCameronPredictions(env){
  const source=env?.noaa?.operational?.cameron?.prediction || [];
  return source.map(p=>({
    ...p,
    isoTime:p.isoTime || chicagoIso(p.time)
  })).filter(p=>p.isoTime);
}

function buildItem(row, section, index, predictions){
  const result=projectNormalizedMovement(row,{
    contextDate:new Date(),
    source:"LakeCharlesSQLDataService LIVE",
    sourceRecordId:row.__sourceRecordId || `${section}-${index+1}`
  });

  const environmental=buildVesselEnvironmentalIntersection({
    movement:result.movement,
    projection:result.projection,
    cameronPredictions:predictions
  });

  return {
    section,
    logId:row.LogID || null,
    pilotUnitNumber:row.PilotUnitNumber || null,
    pilotUnitNumbers:row.PilotUnitNumbers || [],
    native:row.__raw,
    movement:result.movement,
    projection:result.projection,
    environmental,
    display:{
      vessel:result.movement?.vessel?.name || row.Vessel || null,
      direction:result.movement?.movement?.direction || row.Direction || null,
      status:result.movement?.movement?.status || row.Status || null,
      lengthFt:result.movement?.vessel?.loaFt ?? null,
      beamFt:result.movement?.vessel?.beamFt ?? null,
      draftFt:result.movement?.vessel?.draftFt ?? null,
      dwt:result.movement?.vessel?.dwt ?? null,
      berth:result.movement?.movement?.berth || row.Berth || null,
      ordered:hhmm(result.movement?.schedule?.orderedAt),
      pbt:hhmm(result.movement?.schedule?.pbtAt),
      actualStart:hhmm(result.movement?.schedule?.actualStartAt),
      eta36:hhmm(environmental.eta36),
      eta60:hhmm(environmental.eta60),
      etaICW:hhmm(environmental.etaICW),
      cameronPrediction:environmental.cameronAt36?.speed!=null
        ? `${Number(environmental.cameronAt36.speed).toFixed(2)} kt ${environmental.cameronAt36.phase||""}`.trim()
        : null,
      cameronEffect:environmental.cameronEffect,
      pilotUnitNumber:row.PilotUnitNumber || null,
      pilotUnitNumbers:row.PilotUnitNumbers || [],
      agent:row.Agent || null,
      lineHandler:row.LH || null,
      remarks:row.Remarks || null,
      lastChange:row["Last Change"] || null,
      flags:result.movement?.notes?.machineFlags || []
    }
  };
}

export async function GET(request){
  try{
    const [live,env]=await Promise.all([
      fetchStructuredSchedule(),
      loadEnvironment(request)
    ]);

    const predictions=normalizedCameronPredictions(env);

    const sections={
      moving:mapNativeLcpSection(live.arrays.moving,"MOVING"),
      expected:mapNativeLcpSection(live.arrays.expected,"EXPECTED"),
      arriving:mapNativeLcpSection(live.arrays.arriving,"ARRIVING"),
      inPort:mapNativeLcpSection(live.arrays.inPort,"IN_PORT")
    };

    const items=[
      ...sections.moving.map((r,i)=>buildItem(r,"MOVING",i,predictions)),
      ...sections.expected.map((r,i)=>buildItem(r,"EXPECTED",i,predictions)),
      ...sections.arriving.map((r,i)=>buildItem(r,"ARRIVING",i,predictions)),
      ...sections.inPort.map((r,i)=>buildItem(r,"IN_PORT",i,predictions))
    ];

    return Response.json({
      schemaVersion:"1.1.1-operational",
      source:"LakeCharlesSQLDataService LIVE",
      fetchedAt:live.fetchedAt,
      environmentConnected:!!env,
      cameronPredictionPoints:predictions.length,
      counts:{
        moving:sections.moving.length,
        expected:sections.expected.length,
        arriving:sections.arriving.length,
        inPort:sections.inPort.length,
        total:items.length
      },
      diagnostics:live.diagnostics,
      items
    },{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      schemaVersion:"1.1.1-operational",
      error:"Live operational schedule pipeline failed",
      detail:e?.message || "unknown error"
    },{
      status:500,
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }
}
