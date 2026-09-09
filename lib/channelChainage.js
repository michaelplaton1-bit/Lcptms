// LCPTMS Channel Chainage Engine v0.1
// Bridges operational berth coordinates to the ETA model.
// v0.1 intentionally uses a piecewise operational centerline based on established LCPTMS anchors.
// Exact NOAA ENC centerline geometry can replace/augment this later.

import {
  resolveBerthCoordinate,
  haversineNm
} from "./berthGeography.js";

export const CHANNEL_CHAINAGE_VERSION="0.1.0";

// Major operational anchors, ordered inbound.
// Coordinates that are not yet verified are intentionally null.
// Berth projection only occurs against segments with known endpoints.
export const CHANNEL_ANCHORS = Object.freeze([
  {id:"CC_BUOY", label:"CC Buoy", latitude:null, longitude:null},
  {id:"36_BUOY", label:"36 Buoy", latitude:null, longitude:null},
  {id:"60_BEACON", label:"60 Beacon", latitude:null, longitude:null},
  {id:"CALCASIEU_ICW", label:"Calcasieu ICW", latitude:30.0916667, longitude:-93.325},
  {id:"I210_BRIDGE", label:"I-210 Bridge", latitude:null, longitude:null},
  {id:"CITY_DOCKS_CD9_119", label:"City Docks / CD-9 / 119", latitude:30.21107, longitude:-93.256956},
  {id:"I10_BRIDGE", label:"I-10 Bridge", latitude:null, longitude:null}
]);

// Operationally supplied berth groups and how they connect to the main channel.
// These are topology rules, not transit-time claims.
export const BERTH_TOPOLOGY = Object.freeze({
  "VG-S": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "VG-N": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CLNG-S": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CLNG-N": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "P66/CR": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CS/CR": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CS/B": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CS/C": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CS/D": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "A4": {branch:"ANCHORAGE", mergeMode:"AT_BERTH"},
  "BT1-O": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "BT1-N": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "CD8": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "P66/3": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},
  "BT4/DP": {branch:"MAIN_CHANNEL", mergeMode:"AT_BERTH"},

  "ALCOA": {
    branch:"INDUSTRIAL_CANAL",
    mergeMode:"BRANCH_PENDING",
    note:"Off-channel Industrial Canal leg requires merge-point confirmation."
  },
  "CD/24": {
    branch:"INDUSTRIAL_CANAL",
    mergeMode:"BRANCH_PENDING",
    note:"Off-channel Industrial Canal leg requires merge-point confirmation."
  },
  "CII": {
    branch:"SLIP",
    mergeMode:"BRANCH_PENDING",
    note:"Slip exit/merge point requires confirmation."
  },
  "WLS": {
    branch:"SLIP",
    mergeMode:"BRANCH_PENDING",
    note:"Slip exit/merge point requires confirmation."
  },
  "WC/A": {
    branch:"COON_ISLAND_CHANNEL",
    mergeMode:"BRANCH_PENDING",
    note:"Coon Island Channel merge leg requires confirmation."
  },
  "WC/C": {
    branch:"COON_ISLAND_CHANNEL",
    mergeMode:"BRANCH_PENDING",
    note:"Coon Island Channel merge leg requires confirmation."
  },
  "CD9-11": {
    branch:"CONTRABAND_BAYOU",
    mergeMode:"BRANCH_PENDING",
    note:"Contraband Bayou exit/merge leg requires confirmation."
  },
  "CD5": {
    branch:"CITY_DOCKS",
    mergeMode:"BRANCH_PENDING",
    note:"City Dock berth sequence requires along-frontage calibration."
  },
  "CD1": {
    branch:"CITY_DOCKS",
    mergeMode:"BRANCH_PENDING",
    note:"City Dock berth sequence requires along-frontage calibration."
  }
});

function point(x){
  return x && Number.isFinite(x.latitude) && Number.isFinite(x.longitude)
    ? {latitude:x.latitude,longitude:x.longitude}
    : null;
}

function toLocalXY(p, origin){
  const latNm=(p.latitude-origin.latitude)*60;
  const lonNm=(p.longitude-origin.longitude)*60*Math.cos(origin.latitude*Math.PI/180);
  return {x:lonNm,y:latNm};
}

function projectPointToSegment(p,a,b){
  const origin=a;
  const P=toLocalXY(p,origin);
  const A={x:0,y:0};
  const B=toLocalXY(b,origin);
  const dx=B.x-A.x, dy=B.y-A.y;
  const len2=dx*dx+dy*dy;
  if(len2===0)return null;
  let t=((P.x-A.x)*dx+(P.y-A.y)*dy)/len2;
  t=Math.max(0,Math.min(1,t));
  const q={x:A.x+t*dx,y:A.y+t*dy};
  const lateralNm=Math.hypot(P.x-q.x,P.y-q.y);
  return {t,lateralNm};
}

export function availableMainChannelSegments(){
  const out=[];
  for(let i=0;i<CHANNEL_ANCHORS.length-1;i++){
    const a=CHANNEL_ANCHORS[i],b=CHANNEL_ANCHORS[i+1];
    if(point(a)&&point(b)){
      out.push({
        from:a.id,to:b.id,
        distanceNm:haversineNm(a,b)
      });
    }
  }
  return out;
}

export function nearestKnownAnchor(coordinate){
  if(!coordinate)return null;
  const candidates=CHANNEL_ANCHORS
    .filter(point)
    .map(a=>({...a,distanceNm:haversineNm(coordinate,a)}))
    .sort((a,b)=>a.distanceNm-b.distanceNm);
  return candidates[0]||null;
}

export function locateBerthOnCurrentModel(code){
  const resolved=resolveBerthCoordinate(code);
  if(resolved.status!=="OPERATIONAL_COORDINATE"){
    return {ok:false,reason:"BERTH_COORDINATE_UNAVAILABLE",code};
  }

  const berth=resolved.coordinate;
  const topo=BERTH_TOPOLOGY[berth.code] || {branch:"UNKNOWN",mergeMode:"UNMAPPED"};

  if(topo.mergeMode==="BRANCH_PENDING"){
    return {
      ok:false,
      reason:"BRANCH_MERGE_PENDING",
      berth,
      topology:topo,
      nearestKnownAnchor:nearestKnownAnchor(berth)
    };
  }

  const segments=[];
  for(let i=0;i<CHANNEL_ANCHORS.length-1;i++){
    const a=CHANNEL_ANCHORS[i],b=CHANNEL_ANCHORS[i+1];
    if(!point(a)||!point(b))continue;
    const projection=projectPointToSegment(berth,a,b);
    if(projection){
      segments.push({
        from:a.id,to:b.id,
        ...projection,
        segmentDistanceNm:haversineNm(a,b)
      });
    }
  }

  segments.sort((a,b)=>a.lateralNm-b.lateralNm);

  if(!segments.length){
    return {
      ok:false,
      reason:"NO_CALIBRATED_CENTERLINE_SEGMENT_NEAR_BERTH",
      berth,
      topology:topo,
      nearestKnownAnchor:nearestKnownAnchor(berth)
    };
  }

  const best=segments[0];
  return {
    ok:true,
    berth,
    topology:topo,
    segment:best,
    alongSegmentNm:best.segmentDistanceNm*best.t,
    lateralOffsetNm:best.lateralNm
  };
}

export function buildChainageReport(){
  return {
    version:CHANNEL_CHAINAGE_VERSION,
    calibratedAnchors:CHANNEL_ANCHORS.filter(point),
    pendingAnchors:CHANNEL_ANCHORS.filter(x=>!point(x)).map(x=>x.id),
    availableSegments:availableMainChannelSegments(),
    berths:Object.keys(BERTH_TOPOLOGY).map(code=>locateBerthOnCurrentModel(code))
  };
}
