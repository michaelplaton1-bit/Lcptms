export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
const n = x => Number(x);

async function getJson(url, headers={}) {
  const r = await fetch(url, { headers, cache:"no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

async function noaaCurrent(station, bin) {
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station",station);
  u.searchParams.set("product","currents");
  u.searchParams.set("bin",String(bin));
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j = await getJson(u.toString());
  if (j.error) throw new Error(j.error.message || "NOAA current error");
  const row = j.data?.at(-1);
  if (!row) throw new Error("No NOAA current observation");
  return { speed:n(row.s), direction:n(row.d), time:row.t, display:`${n(row.s).toFixed(2)} kt @ ${Math.round(n(row.d))}°` };
}

async function noaaWaterLevel() {
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station","8768094");
  u.searchParams.set("product","water_level");
  u.searchParams.set("datum","MLLW");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j = await getJson(u.toString());
  const row = j.data?.at(-1);
  if (!row) throw new Error("No NOAA water-level observation");
  return { value:n(row.v), time:row.t, display:`${n(row.v).toFixed(2)} ft MLLW` };
}

async function nwsObservation() {
  const j = await getJson("https://api.weather.gov/stations/KLCH/observations/latest", {
    "Accept":"application/geo+json",
    "User-Agent":"LCPTMS/0.1 operations@lcptms.com"
  });
  const p = j.properties || {};
  const ms = p.windSpeed?.value;
  const deg = p.windDirection?.value;
  const meters = p.visibility?.value;
  const kt = ms == null ? null : ms * 1.94384;
  const nm = meters == null ? null : meters / 1852;
  return {
    wind: { valueKt:kt, direction:deg, display:kt==null?"Unavailable":`${kt.toFixed(0)} kt @ ${deg==null?"—":Math.round(deg)+"°"}` },
    visibility: { valueNm:nm, display:nm==null?"Unavailable":`${nm.toFixed(1)} NM` },
    timestamp:p.timestamp
  };
}

async function nhcStatus() {
  try {
    const text = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", { cache:"no-store" }).then(async r => {
      if (!r.ok) throw new Error("NHC");
      return await r.json();
    });
    const storms = Array.isArray(text?.activeStorms) ? text.activeStorms : [];
    return { count:storms.length, storms, display:storms.length ? `${storms.length} active system${storms.length>1?"s":""}` : "No active systems" };
  } catch {
    return { count:null, storms:[], display:"Feed check required" };
  }
}

async function stormGeoStatus() {
  if (!process.env.STORMGEO_APP_KEY) return { configured:false, display:"Credentials required" };
  return { configured:true, display:"Configured — endpoint mapping next" };
}

export async function GET() {
  const result = { sources:{}, generatedAt:new Date().toISOString() };

  const tasks = await Promise.allSettled([
    noaaCurrent("lc0101",1),
    noaaCurrent("lc0201",30),
    noaaWaterLevel(),
    nwsObservation(),
    nhcStatus(),
    stormGeoStatus()
  ]);

  const [lb36,cameron,water,nws,nhc,stormgeo] = tasks;

  result.noaa = {
    lb36: lb36.status==="fulfilled" ? lb36.value : { display:"Unavailable" },
    cameron: cameron.status==="fulfilled" ? cameron.value : { display:"Unavailable" },
    waterLevel: water.status==="fulfilled" ? water.value : { display:"Unavailable" }
  };
  result.nws = nws.status==="fulfilled" ? nws.value : {
    wind:{display:"Unavailable"}, visibility:{display:"Unavailable"}
  };
  result.nhc = nhc.status==="fulfilled" ? nhc.value : { display:"Unavailable" };
  result.stormgeo = stormgeo.status==="fulfilled" ? stormgeo.value : { configured:false, display:"Unavailable" };

  result.sources.noaa = [lb36,cameron,water].some(x=>x.status==="fulfilled");
  result.sources.nws = nws.status==="fulfilled";
  result.sources.nhc = nhc.status==="fulfilled";
  result.sources.stormgeo = !!result.stormgeo.configured;

  return json(result);
}