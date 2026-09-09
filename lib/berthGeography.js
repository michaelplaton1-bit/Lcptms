// LCPTMS Berth Geography v0.3
// Coordinates supplied directly by Lake Charles Pilots.
// Internal datum assumption: WGS-84 decimal degrees unless later corrected.

export const BERTH_GEOGRAPHY_VERSION="0.3.0";
export const BERTH_COORDINATES=Object.freeze([
  {code:'VG-S',aliases:['VG-S'],latitude:29.770058665425733,longitude:-93.34116423542316,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'VG-N',aliases:['VG-N'],latitude:29.77374,longitude:-93.340533,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CLNG-S',aliases:['CLNG-S'],latitude:30.037227,longitude:-93.33263,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CLNG-N',aliases:['CLNG-N'],latitude:30.040786,longitude:-93.33245,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'ALCOA',aliases:['ALCOA'],latitude:30.109907,longitude:-93.296018,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CD/24',aliases:['CD/24','CD24'],latitude:30.106412,longitude:-93.290214,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CII',aliases:['CII'],latitude:30.145428,longitude:-93.335113,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'WLS',aliases:['WLS'],latitude:30.145428,longitude:-93.335113,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'P66/CR',aliases:['P66/CR'],latitude:30.156965,longitude:-93.330989,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CS/CR',aliases:['CS/CR'],latitude:30.159903,longitude:-93.325694,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CS/B',aliases:['CS/B'],latitude:30.175085,longitude:-93.318908,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CS/C',aliases:['CS/C'],latitude:30.178022,longitude:-93.317826,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CS/D',aliases:['CS/D'],latitude:30.18364,longitude:-93.310718,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'A4',aliases:['A4','A4 ANCHORAGE'],latitude:30.181116,longitude:-93.307179,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'BT1-O',aliases:['BT1-O'],latitude:30.19093,longitude:-93.299603,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'BT1-N',aliases:['BT1-N','BT-1N'],latitude:30.192401,longitude:-93.297292,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'WC/A',aliases:['WC/A'],latitude:30.213791,longitude:-93.281468,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'WC/C',aliases:['WC/C'],latitude:30.223602,longitude:-93.278572,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CD9-11',aliases:['CD9-11','CD9','CD10','CD11'],latitude:30.21107,longitude:-93.256956,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CD8',aliases:['CD8'],latitude:30.211917,longitude:-93.257331,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CD5',aliases:['CD5'],latitude:30.218625,longitude:-93.257013,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'P66/3',aliases:['P66/3'],latitude:30.230837,longitude:-93.254108,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'CD1',aliases:['CD1'],latitude:30.217758,longitude:-93.250547,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"},
  {code:'BT4/DP',aliases:['BT4/DP','BT4','DP'],latitude:30.230651,longitude:-93.247155,coordinateSource:"LAKE_CHARLES_PILOTS",coordinateStatus:"OPERATIONAL_COORDINATE"}
]);

function norm(v){return String(v||"").trim().toUpperCase().replace(/\s+/g," ");}

export function resolveBerthCoordinate(code){
  const q=norm(code);
  if(!q)return {status:"NO_BERTH",code:code??null,coordinate:null};
  for(const item of BERTH_COORDINATES){
    if(item.aliases.map(norm).includes(q)){
      return {status:"OPERATIONAL_COORDINATE",code,coordinate:item};
    }
  }
  return {status:"UNMAPPED",code,coordinate:null};
}

export function haversineNm(a,b){
  if(!a||!b)return null;
  const R=3440.065;
  const rad=x=>x*Math.PI/180;
  const p1=rad(a.latitude),p2=rad(b.latitude);
  const dp=rad(b.latitude-a.latitude);
  const dl=rad(b.longitude-a.longitude);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

export function initialBearingDeg(a,b){
  if(!a||!b)return null;
  const rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
  const p1=rad(a.latitude),p2=rad(b.latitude),dl=rad(b.longitude-a.longitude);
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (deg(Math.atan2(y,x))+360)%360;
}
