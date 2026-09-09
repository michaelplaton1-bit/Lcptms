// LCPTMS ETA Engine v0.2
// Geographic transit model.
// Combines operational baseline transit times with channel chainage and berth coordinates.

import {
  MOVEMENT_DIRECTION,
  currentPlanningStart,
  BASELINE_SEGMENT_MINUTES
} from "./trafficModel.js";

import {
  CHANNEL_ANCHORS,
  CHANNEL_SEGMENTS,
  ANCHOR_CHAINAGE,
  locateBerthOnChannel,
  distanceAlongChannelNm
} from "./channelChainage.js";

export const ETA_ENGINE_VERSION="0.2.0";

// Time anchors preserve the operational transit assumptions supplied by LCP.
// Intermediate geographic anchors split those coarse blocks proportionally by chainage.
export const TIME_ANCHOR_MINUTES=Object.freeze([
  {from:"CC_BUOY",to:"36_BUOY",minutes:BASELINE_SEGMENT_MINUTES.CC_BUOY__36_BUOY},
  {from:"36_BUOY",to:"60_BEACON",minutes:BASELINE_SEGMENT_MINUTES["36_BUOY__60_BEACON"]},
  {from:"60_BEACON",to:"CALCASIEU_ICW",minutes:BASELINE_SEGMENT_MINUTES["60_BEACON__CALCASIEU_ICW"]},
  {from:"CALCASIEU_ICW",to:"I210_BRIDGE",minutes:BASELINE_SEGMENT_MINUTES["CALCASIEU_ICW__I210_BRIDGE"]},
  {from:"I210_BRIDGE",to:"CITY_DOCKS_119",minutes:BASELINE_SEGMENT_MINUTES["I210_BRIDGE__CITY_DOCKS_CD9_119"]},
  {from:"CITY_DOCKS_119",to:"I10_BRIDGE",minutes:BASELINE_SEGMENT_MINUTES["CITY_DOCKS_CD9_119__I10_BRIDGE"]}
]);

export const DEFAULT_VESSEL_FACTORS=Object.freeze({
  Q_FLEX_LNG:1.10,
  LNG_CARRIER:1.06,
  SUEZMAX:1.08,
  AFRAMAX:1.05,
  PANAMAX:1.02,
  BULK_CARRIER:1.03,
  DEFAULT:1.00
});

function normClass(v){
  return String(v||"").trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_");
}
function asDate(v){
  if(!v)return null;
  const d=v instanceof Date?v:new Date(v);
  return Number.isFinite(d.getTime())?d:null;
}
function iso(d){return d?d.toISOString():null;}
function addMinutes(d,m){return new Date(d.getTime()+m*60000);}

export function vesselTimeFactor(movement,overrides={}){
  const c=normClass(movement?.vessel?.class);
  if(overrides[c]!=null)return Number(overrides[c]);
  if(DEFAULT_VESSEL_FACTORS[c]!=null)return DEFAULT_VESSEL_FACTORS[c];

  const loa=Number(movement?.vessel?.loaFt);
  const beam=Number(movement?.vessel?.beamFt);
  const draft=Number(movement?.vessel?.draftFt);
  let f=1;
  if(Number.isFinite(loa)&&loa>=900)f+=.04;
  else if(Number.isFinite(loa)&&loa>=750)f+=.02;
  if(Number.isFinite(beam)&&beam>=150)f+=.03;
  if(Number.isFinite(draft)&&draft>=38)f+=.03;
  else if(Number.isFinite(draft)&&draft>=34)f+=.015;
  return Number(f.toFixed(3));
}

function timeBlockForChainage(chainage){
  for(const block of TIME_ANCHOR_MINUTES){
    const a=ANCHOR_CHAINAGE[block.from],b=ANCHOR_CHAINAGE[block.to];
    if(!Number.isFinite(a)||!Number.isFinite(b))continue;
    const lo=Math.min(a,b),hi=Math.max(a,b);
    if(chainage>=lo-1e-6&&chainage<=hi+1e-6){
      return {...block,fromChainage:a,toChainage:b,distanceNm:Math.abs(b-a)};
    }
  }
  return null;
}

export function baselineMinutesBetweenChainages(a,b){
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  if(a===b)return 0;

  const lo=Math.min(a,b),hi=Math.max(a,b);
  let total=0;

  for(const block of TIME_ANCHOR_MINUTES){
    const x=ANCHOR_CHAINAGE[block.from],y=ANCHOR_CHAINAGE[block.to];
    if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    const blo=Math.min(x,y),bhi=Math.max(x,y);
    const overlap=Math.max(0,Math.min(hi,bhi)-Math.max(lo,blo));
    const dist=Math.abs(y-x);
    if(overlap>0&&dist>0)total+=block.minutes*(overlap/dist);
  }
  return total;
}

function adjustedMinutes(base,movement,options={}){
  const vf=vesselTimeFactor(movement,options.vesselFactors||{});
  const ef=Number.isFinite(Number(options.environmentalFactor))?Number(options.environmentalFactor):1;
  const tf=Number.isFinite(Number(options.trafficFactor))?Number(options.trafficFactor):1;
  return base*vf*ef*tf;
}

function latestActualWaypoint(movement){
  const actual=movement?.route?.actualWaypoints||{};
  let best=null;
  for(const [id,time] of Object.entries(actual)){
    if(!Number.isFinite(ANCHOR_CHAINAGE[id]))continue;
    const d=asDate(time);
    if(!d)continue;
    if(!best||d>best.date)best={waypoint:id,time,date:d,chainageNm:ANCHOR_CHAINAGE[id]};
  }
  return best;
}

export function determineGeographicStart(movement){
  const actual=latestActualWaypoint(movement);
  if(actual){
    return {
      source:"ACTUAL_WAYPOINT",
      time:actual.time,
      chainageNm:actual.chainageNm,
      waypoint:actual.waypoint
    };
  }

  const planning=currentPlanningStart(movement);
  if(!planning?.time)return {ok:false,reason:"NO_START_TIME"};

  const berthCode=movement?.movement?.berth;
  if(berthCode){
    const berth=locateBerthOnChannel(berthCode);
    if(berth?.ok){
      return {
        ok:true,
        source:planning.type,
        time:planning.time,
        chainageNm:berth.location.chainageNm,
        berth:berthCode,
        lateralOffsetNm:berth.location.lateralOffsetNm,
        segment:{
          from:berth.location.from,
          to:berth.location.to
        }
      };
    }
  }

  if(movement?.route?.currentWaypoint &&
     Number.isFinite(ANCHOR_CHAINAGE[movement.route.currentWaypoint])){
    return {
      ok:true,
      source:planning.type,
      time:planning.time,
      chainageNm:ANCHOR_CHAINAGE[movement.route.currentWaypoint],
      waypoint:movement.route.currentWaypoint
    };
  }

  if(movement?.movement?.direction===MOVEMENT_DIRECTION.INBOUND){
    return {
      ok:true,
      source:planning.type,
      time:planning.time,
      chainageNm:ANCHOR_CHAINAGE.CC_BUOY,
      waypoint:"CC_BUOY"
    };
  }

  return {ok:false,reason:"GEOGRAPHIC_START_UNRESOLVED",time:planning.time};
}

export function calculateGeographicEtas(movement,options={}){
  const direction=movement?.movement?.direction;
  if(direction!==MOVEMENT_DIRECTION.INBOUND&&direction!==MOVEMENT_DIRECTION.OUTBOUND){
    return {ok:false,reason:"DIRECTION_UNRESOLVED",engineVersion:ETA_ENGINE_VERSION};
  }

  const start=determineGeographicStart(movement);
  if(start.ok===false){
    return {ok:false,reason:start.reason,start,engineVersion:ETA_ENGINE_VERSION};
  }

  const startTime=asDate(start.time);
  if(!startTime){
    return {ok:false,reason:"INVALID_START_TIME",start,engineVersion:ETA_ENGINE_VERSION};
  }

  const targets=CHANNEL_ANCHORS
    .map(a=>({id:a.id,chainageNm:ANCHOR_CHAINAGE[a.id]}))
    .filter(x=>Number.isFinite(x.chainageNm))
    .filter(x=>direction===MOVEMENT_DIRECTION.INBOUND
      ? x.chainageNm>=start.chainageNm-1e-6
      : x.chainageNm<=start.chainageNm+1e-6)
    .sort((a,b)=>direction===MOVEMENT_DIRECTION.INBOUND
      ? a.chainageNm-b.chainageNm
      : b.chainageNm-a.chainageNm);

  const etas={};
  const legs=[];
  let priorChainage=start.chainageNm;
  let clock=startTime;

  for(const target of targets){
    const base=baselineMinutesBetweenChainages(priorChainage,target.chainageNm);
    if(base==null)continue;
    const minutes=adjustedMinutes(base,movement,options);
    clock=addMinutes(clock,minutes);

    etas[target.id]={
      time:iso(clock),
      source:Math.abs(target.chainageNm-start.chainageNm)<1e-6
        ? start.source
        : "GEOGRAPHIC_MODELED_ETA",
      chainageNm:Number(target.chainageNm.toFixed(3)),
      minutesFromPrevious:Number(minutes.toFixed(1)),
      baselineMinutes:Number(base.toFixed(1))
    };

    if(Math.abs(target.chainageNm-priorChainage)>1e-6){
      legs.push({
        to:target.id,
        fromChainageNm:Number(priorChainage.toFixed(3)),
        toChainageNm:Number(target.chainageNm.toFixed(3)),
        distanceNm:Number(distanceAlongChannelNm(priorChainage,target.chainageNm).toFixed(3)),
        baselineMinutes:Number(base.toFixed(1)),
        adjustedMinutes:Number(minutes.toFixed(1))
      });
    }
    priorChainage=target.chainageNm;
  }

  return {
    ok:true,
    engineVersion:ETA_ENGINE_VERSION,
    model:"GEOGRAPHIC_CHAINAGE_BASELINE",
    direction,
    start,
    vesselFactor:vesselTimeFactor(movement,options.vesselFactors||{}),
    environmentalFactor:options.environmentalFactor??1,
    trafficFactor:options.trafficFactor??1,
    etas,
    legs,
    warnings:[
      "Piecewise centerline geometry is an operational approximation.",
      "Off-channel branch distances are not yet included.",
      "Baseline times remain LCP planning assumptions until historical calibration."
    ]
  };
}

// Compatibility alias for scheduleAdapter.js and existing callers.
export function calculateWaypointEtas(movement,options={}){
  return calculateGeographicEtas(movement,options);
}

export function recalculateAfterActualWaypoint(movement,waypoint,actualTime,options={}){
  const copy=structuredClone(movement);
  copy.route=copy.route||{};
  copy.route.actualWaypoints=copy.route.actualWaypoints||{};
  copy.route.actualWaypoints[waypoint]=actualTime;
  copy.route.currentWaypoint=waypoint;
  return {movement:copy,projection:calculateGeographicEtas(copy,options)};
}

export function comparePlannedVsActual(movement,waypoint){
  const actual=asDate(movement?.route?.actualWaypoints?.[waypoint]);
  const modeled=asDate(movement?.route?.modeledEtas?.[waypoint]);
  if(!actual||!modeled)return {waypoint,varianceMinutes:null,status:"INSUFFICIENT_DATA"};
  const v=(actual-modeled)/60000;
  return {
    waypoint,
    varianceMinutes:Number(v.toFixed(1)),
    status:v>10?"LATE":v<-10?"EARLY":"ON_MODEL"
  };
}
