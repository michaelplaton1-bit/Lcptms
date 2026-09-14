export const dynamic="force-dynamic";

function compass(deg){
  if(!Number.isFinite(deg))return null;
  const pts=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return pts[Math.round((((deg%360)+360)%360)/22.5)%16];
}
async function json(url,headers={}){
  const r=await fetch(url,{cache:"no-store",headers});
  const t=await r.text();
  if(!r.ok)throw new Error(`${r.status} ${t.slice(0,150)}`);
  return JSON.parse(t);
}
function ktFromMs(v){return Number.isFinite(v)?v*1.943844:null;}

async function noaaCalcasieuPass(){
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station","8768094");
  u.searchParams.set("product","wind");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j=await json(u);
  const row=(j.data||[]).at(-1);
  if(!row)return null;
  const speed=Number(row.s),gust=Number(row.g),dir=Number(row.d);
  return {
    source:"NOAA PORTS",
    station:"Calcasieu Pass / 8768094",
    observedLocal:row.t||null,
    directionDeg:Number.isFinite(dir)?dir:null,
    direction:row.dr||compass(dir),
    speedKt:Number.isFinite(speed)?speed:null,
    gustKt:Number.isFinite(gust)?gust:null
  };
}
async function nwsKlch(){
  const j=await json("https://api.weather.gov/stations/KLCH/observations/latest",{
    "User-Agent":"LCPTMS operations dashboard contact Lake Charles Pilots",
    "Accept":"application/geo+json"
  });
  const p=j.properties||{};
  const deg=Number(p.windDirection?.value);
  const speed=ktFromMs(Number(p.windSpeed?.value));
  const gust=ktFromMs(Number(p.windGust?.value));
  return {
    source:"NWS",
    station:"Lake Charles Regional Airport / KLCH",
    observed:p.timestamp||null,
    directionDeg:Number.isFinite(deg)?deg:null,
    direction:compass(deg),
    speedKt:Number.isFinite(speed)?speed:null,
    gustKt:Number.isFinite(gust)?gust:null
  };
}
export async function GET(){
  const [a,b]=await Promise.allSettled([noaaCalcasieuPass(),nwsKlch()]);
  return Response.json({
    schemaVersion:"0.1.0",
    generatedAt:new Date().toISOString(),
    calcasieuPass:a.status==="fulfilled"?a.value:null,
    lakeCharlesRegional:b.status==="fulfilled"?b.value:null,
    errors:{
      calcasieuPass:a.status==="rejected"?a.reason?.message:null,
      lakeCharlesRegional:b.status==="rejected"?b.reason?.message:null
    }
  },{headers:{"Cache-Control":"no-store, max-age=0"}});
}
