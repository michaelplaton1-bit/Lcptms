// LCPTMS Environmental ETA Intersection v0.1
// Matches a vessel ETA to the nearest NOAA Cameron current prediction.
// 36 Buoy cross-current remains live-only and is never forecast.

export const ENVIRONMENTAL_INTERSECTION_VERSION="0.1.0";

function ms(v){
  const d=new Date(v);
  return Number.isFinite(d.getTime())?d.getTime():null;
}

export function nearestPredictionToEta(predictions, etaIso){
  if(!Array.isArray(predictions)||!etaIso)return null;
  const target=ms(etaIso);
  if(target==null)return null;

  let best=null,bestDiff=Infinity;
  for(const p of predictions){
    const t=ms(p?.isoTime || p?.timestamp || p?.timeIso);
    if(t==null)continue;
    const diff=Math.abs(t-target);
    if(diff<bestDiff){bestDiff=diff;best=p;}
  }
  return best ? {...best,etaDifferenceMinutes:Math.round(bestDiff/60000)} : null;
}

export function cameronEffectForDirection(phase,direction){
  const p=String(phase||"").toUpperCase();
  const d=String(direction||"").toUpperCase();
  if(p==="FLOOD"){
    if(d==="INBOUND")return "FOLLOWING";
    if(d==="OUTBOUND")return "OPPOSING";
  }
  if(p==="EBB"){
    if(d==="INBOUND")return "OPPOSING";
    if(d==="OUTBOUND")return "FOLLOWING";
  }
  if(p==="SLACK")return "SLACK";
  return "UNKNOWN";
}

export function buildVesselEnvironmentalIntersection({
  movement,
  projection,
  cameronPredictions=[]
}){
  const direction=movement?.movement?.direction;
  const eta36=projection?.etas?.["36_BUOY"]?.time || null;
  const eta60=projection?.etas?.["60_BEACON"]?.time || null;
  const etaICW=projection?.etas?.["CALCASIEU_ICW"]?.time || null;

  const cameronAt36=nearestPredictionToEta(cameronPredictions,eta36);

  return {
    direction,
    eta36,
    eta60,
    etaICW,
    cameronAt36,
    cameronEffect:cameronAt36
      ? cameronEffectForDirection(cameronAt36.phase,direction)
      : null,
    note36CrossCurrent:"LIVE_ONLY_NO_PREDICTION"
  };
}
