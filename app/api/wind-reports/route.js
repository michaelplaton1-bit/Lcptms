export const dynamic="force-dynamic";

function compass(deg){
  if(!Number.isFinite(deg))return null;
  const pts=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return pts[Math.round((((deg%360)+360)%360)/22.5)%16];
}
async function json(url,headers={}){
  const r=await fetch(url,{cache:"no-store",headers});
  const t=await r.text();
  let j=null; try{j=JSON.parse(t)}catch{}
  if(!r.ok)throw new Error(`${r.status} ${t.slice(0,220)}`);
  return j;
}
function ktFromMs(v){return Number.isFinite(v)?v*1.943844:null;}
function number(v){
  const x=Number(v); return Number.isFinite(x)?x:null;
}
async function noaaStationWind(station,name){
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station",station);
  u.searchParams.set("product","wind");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j=await json(u);
  if(j?.error)throw new Error(j.error.message||JSON.stringify(j.error));
  const row=(j?.data||[]).at(-1);
  if(!row)throw new Error("No NOAA wind observation returned");
  const speed=number(row.s),gust=number(row.g),dir=number(row.d);
  if(speed===null)throw new Error("NOAA wind speed missing");
  return {
    source:"NOAA CO-OPS / PORTS",
    station:`${name} / ${station}`,
    stationId:station,
    observedLocal:row.t||null,
    directionDeg:dir,
    direction:row.dr||compass(dir),
    speedKt:speed,
    gustKt:gust,
    fallback:station!=="8768094"
  };
}
async function noaaPortsWind(){
  const candidates=[
    ["8768094","Calcasieu Pass"],
    ["8767961","Bulk Terminal"],
    ["8767816","Lake Charles"]
  ];
  const attempts=[];
  for(const [station,name] of candidates){
    try{
      const data=await noaaStationWind(station,name);
      return {data,attempts:[...attempts,{station,name,ok:true}]};
    }catch(e){
      attempts.push({station,name,ok:false,error:e?.message||"unknown"});
    }
  }
  return {data:null,attempts};
}
async function nwsKlch(){
  const j=await json("https://api.weather.gov/stations/KLCH/observations/latest",{
    "User-Agent":"LCPTMS/1.0 (Lake Charles Pilots operational dashboard)",
    "Accept":"application/geo+json"
  });
  const p=j?.properties||{};
  const deg=number(p.windDirection?.value);
  const speed=ktFromMs(number(p.windSpeed?.value));
  const gust=ktFromMs(number(p.windGust?.value));
  if(speed===null)throw new Error("KLCH wind speed missing");
  return {
    source:"NWS",
    station:"Lake Charles Regional Airport / KLCH",
    observed:p.timestamp||null,
    directionDeg:deg,
    direction:compass(deg),
    speedKt:speed,
    gustKt:gust
  };
}
export async function GET(){
  const [noaaResult,nwsResult]=await Promise.allSettled([noaaPortsWind(),nwsKlch()]);
  const noaa=noaaResult.status==="fulfilled"?noaaResult.value:{data:null,attempts:[],error:noaaResult.reason?.message};
  return Response.json({
    schemaVersion:"0.2.0",
    generatedAt:new Date().toISOString(),
    calcasieuPass:noaa.data,
    lakeCharlesRegional:nwsResult.status==="fulfilled"?nwsResult.value:null,
    diagnostics:{
      noaaAttempts:noaa.attempts||[],
      nwsError:nwsResult.status==="rejected"?nwsResult.reason?.message:null
    },
    errors:{
      calcasieuPass:noaa.data?null:(noaa.error||"No NOAA PORTS wind station returned a current observation"),
      lakeCharlesRegional:nwsResult.status==="rejected"?nwsResult.reason?.message:null
    }
  },{headers:{"Cache-Control":"no-store, max-age=0"}});
}
