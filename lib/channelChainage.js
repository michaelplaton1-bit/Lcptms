// LCPTMS Channel Chainage Engine v0.2
// Major operational waypoint coordinates supplied by Lake Charles Pilots.

import { resolveBerthCoordinate, haversineNm } from "./berthGeography.js";

export const CHANNEL_CHAINAGE_VERSION="0.2.0";
export const CHANNEL_ANCHORS=Object.freeze([
  {id:'CC_BUOY',label:'CC Buoy',latitude:29.333580000,longitude:-93.221553889,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'36_BUOY',label:'36 Buoy',latitude:29.725800000,longitude:-93.339586389,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'60_BEACON',label:'60 Beacon',latitude:29.838748889,longitude:-93.346400556,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'81_82_BEACON',label:'81/82 Beacon',latitude:30.007527778,longitude:-93.333633611,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'CALCASIEU_ICW',label:'Calcasieu ICW / Light 92',latitude:30.089422500,longitude:-93.323536111,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'104_NEW_CUT',label:'104 Beacon / New Cut',latitude:30.134830000,longitude:-93.329108333,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'110_CLIFTON_RIDGE',label:'110 Beacon / Clifton Ridge',latitude:30.161101389,longitude:-93.319067500,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'I210_BRIDGE',label:'I-210 Bridge',latitude:30.202279000,longitude:-93.281435000,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'CITY_DOCKS_119',label:'Beacon 119 / City Docks',latitude:30.212790000,longitude:-93.257247000,source:"LCP_OPERATIONAL_REFERENCE"},
  {id:'I10_BRIDGE',label:'I-10 Bridge',latitude:30.236479000,longitude:-93.246642000,source:"LCP_OPERATIONAL_REFERENCE"}
]);

function point(x){return {latitude:x.latitude,longitude:x.longitude};}

export const CHANNEL_SEGMENTS=Object.freeze(
  CHANNEL_ANCHORS.slice(0,-1).map((a,i)=>{
    const b=CHANNEL_ANCHORS[i+1];
    return {
      from:a.id,to:b.id,
      distanceNm:haversineNm(point(a),point(b))
    };
  })
);

export const TOTAL_CENTERLINE_APPROX_NM=CHANNEL_SEGMENTS.reduce((s,x)=>s+x.distanceNm,0);

export const ANCHOR_CHAINAGE=Object.freeze((()=>{
  const out={[CHANNEL_ANCHORS[0].id]:0};
  let total=0;
  for(const seg of CHANNEL_SEGMENTS){
    total+=seg.distanceNm;
    out[seg.to]=total;
  }
  return out;
})());

function toLocalXY(p,origin){
  return {
    x:(p.longitude-origin.longitude)*60*Math.cos(origin.latitude*Math.PI/180),
    y:(p.latitude-origin.latitude)*60
  };
}

function projectPointToSegment(p,a,b){
  const P=toLocalXY(p,a),B=toLocalXY(b,a);
  const len2=B.x*B.x+B.y*B.y;
  if(!len2)return null;
  let t=(P.x*B.x+P.y*B.y)/len2;
  t=Math.max(0,Math.min(1,t));
  const q={x:t*B.x,y:t*B.y};
  return {t,lateralNm:Math.hypot(P.x-q.x,P.y-q.y)};
}

export function locateCoordinateOnChannel(coordinate){
  if(!coordinate)return null;
  const candidates=[];
  for(let i=0;i<CHANNEL_ANCHORS.length-1;i++){
    const a=CHANNEL_ANCHORS[i],b=CHANNEL_ANCHORS[i+1];
    const p=projectPointToSegment(coordinate,a,b);
    if(!p)continue;
    const segDistance=CHANNEL_SEGMENTS[i].distanceNm;
    candidates.push({
      from:a.id,to:b.id,
      t:p.t,lateralNm:p.lateralNm,
      chainageNm:ANCHOR_CHAINAGE[a.id]+p.t*segDistance
    });
  }
  candidates.sort((a,b)=>a.lateralNm-b.lateralNm);
  return candidates[0]||null;
}

export function locateBerthOnChannel(code){
  const r=resolveBerthCoordinate(code);
  if(r.status!=="OPERATIONAL_COORDINATE"){
    return {ok:false,code,reason:"BERTH_COORDINATE_UNAVAILABLE"};
  }
  const loc=locateCoordinateOnChannel(r.coordinate);
  return {
    ok:!!loc,
    code,
    berth:r.coordinate,
    location:loc,
    note:"Straight-line piecewise centerline approximation; branch/off-channel route distance not yet applied."
  };
}

export function distanceAlongChannelNm(fromChainage,toChainage){
  if(!Number.isFinite(fromChainage)||!Number.isFinite(toChainage))return null;
  return Math.abs(toChainage-fromChainage);
}

export function distanceBerthToAnchorNm(code,anchorId){
  const berth=locateBerthOnChannel(code);
  const target=ANCHOR_CHAINAGE[anchorId];
  if(!berth.ok||!Number.isFinite(target))return null;
  return distanceAlongChannelNm(berth.location.chainageNm,target);
}

export function channelReport(){
  return {
    version:CHANNEL_CHAINAGE_VERSION,
    totalApproxNm:TOTAL_CENTERLINE_APPROX_NM,
    anchors:CHANNEL_ANCHORS.map(a=>({...a,chainageNm:ANCHOR_CHAINAGE[a.id]})),
    segments:CHANNEL_SEGMENTS
  };
}
