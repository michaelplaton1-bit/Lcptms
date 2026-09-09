export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}

const num = (x) => {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

function chicagoNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const o = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { api: `${o.year}${o.month}${o.day} ${o.hour}:${o.minute}` };
}

function angleDiff(a, b) {
  if (a == null || b == null) return null;
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

function nearestTidalPhase(direction, meanFloodDir, meanEbbDir) {
  if (direction == null || meanFloodDir == null || meanEbbDir == null) {
    return { phase: "UNKNOWN", confidence: null };
  }
  const f = angleDiff(direction, meanFloodDir);
  const e = angleDiff(direction, meanEbbDir);
  return {
    phase: e < f ? "EBB" : "FLOOD",
    confidence: Math.min(1, Math.abs(f - e) / 90),
    angleToFlood: f,
    angleToEbb: e
  };
}

function operationalEffect(phase, vesselDirection) {
  if (phase === "UNKNOWN" || phase === "SLACK") return phase;
  if (vesselDirection === "INBOUND") {
    return phase === "FLOOD" ? "FOLLOWING" : "OPPOSING";
  }
  if (vesselDirection === "OUTBOUND") {
    return phase === "FLOOD" ? "OPPOSING" : "FOLLOWING";
  }
  return "UNKNOWN";
}

function trendFromSeries(points) {
  const valid = points.filter(p => Number.isFinite(p.speed));
  if (valid.length < 2) return { label: "Unknown", deltaKtPerHour: null };
  const a = valid[Math.max(0, valid.length - 6)];
  const b = valid[valid.length - 1];

  const parseLocal = (s) => new Date(String(s).replace(" ", "T"));
  const hours = Math.max((parseLocal(b.time) - parseLocal(a.time)) / 3600000, 0.01);
  const delta = (b.speed - a.speed) / hours;

  return {
    label: delta > 0.08 ? "Increasing" : delta < -0.08 ? "Decreasing" : "Steady",
    deltaKtPerHour: delta
  };
}

async function noaaCurrentObservation(station, bin, rangeHours = 2) {
  const now = chicagoNowParts();
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("begin_date", now.api);
  u.searchParams.set("range", String(rangeHours));
  u.searchParams.set("station", station);
  u.searchParams.set("product", "currents");
  u.searchParams.set("bin", String(bin));
  u.searchParams.set("time_zone", "lst_ldt");
  u.searchParams.set("units", "english");
  u.searchParams.set("format", "json");
  u.searchParams.set("application", "LCPTMS");

  const j = await getJson(u.toString());
  if (j.error) throw new Error(j.error.message || "NOAA current error");

  const history = (j.data || []).map(row => ({
    time: row.t,
    speed: num(row.s),
    direction: num(row.d)
  })).filter(x => x.speed != null);

  const latest = history.at(-1);
  if (!latest) throw new Error("No NOAA current observation");
  return { latest, history };
}

async function noaaStationMetadata(station) {
  const attempts = [
    `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${station}.json?expand=currentprediction,currentpredictionoffsets`,
    `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${station}.json?expand=currentprediction`,
    `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${station}.json`
  ];

  let lastErr;
  for (const url of attempts) {
    try {
      const j = await getJson(url);
      const cp = j.currentprediction || j.currentPrediction || j.currentPredictions || j;
      const first = Array.isArray(cp) ? cp[0] : cp;
      const offsets =
        j.currentpredictionoffsets ||
        j.currentPredictionOffsets ||
        first?.currentpredictionoffsets ||
        first?.currentPredictionOffsets ||
        null;
      const off = Array.isArray(offsets) ? offsets[0] : offsets;

      return {
        id: station,
        name: first?.name || j?.name || station,
        currbin: num(first?.currbin) ?? num(first?.bin) ?? num(off?.refStationBin),
        predictionType: first?.type || null,
        depth: num(first?.depth),
        depthType: first?.depthType || null,
        meanFloodDir: num(off?.meanFloodDir) ?? num(first?.meanFloodDir),
        meanEbbDir: num(off?.meanEbbDir) ?? num(first?.meanEbbDir)
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("NOAA metadata unavailable");
}

function parsePredictionRow(row, metadata) {
  const major =
    num(row.Velocity_Major) ??
    num(row.velocity_major) ??
    num(row.v) ??
    num(row.velocity);

  const speed = Math.abs(major ?? num(row.Speed) ?? num(row.s) ?? 0);
  const phase = major == null ? "UNKNOWN" : major < 0 ? "EBB" : major > 0 ? "FLOOD" : "SLACK";

  return {
    time: row.Time || row.t || row.time,
    velocityMajor: major,
    speed,
    phase,
    direction:
      phase === "EBB" ? metadata?.meanEbbDir :
      phase === "FLOOD" ? metadata?.meanFloodDir :
      null
  };
}

async function noaaCurrentPredictions(station, bin, metadata, hours = 12) {
  const now = chicagoNowParts();
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("begin_date", now.api);
  u.searchParams.set("range", String(hours));
  u.searchParams.set("station", station);
  u.searchParams.set("product", "currents_predictions");
  if (bin != null) u.searchParams.set("bin", String(bin));
  u.searchParams.set("time_zone", "lst_ldt");
  u.searchParams.set("interval", "30");
  u.searchParams.set("units", "english");
  u.searchParams.set("format", "json");
  u.searchParams.set("vel_type", "default");
  u.searchParams.set("application", "LCPTMS");

  const j = await getJson(u.toString());
  if (j.error) throw new Error(j.error.message || "NOAA prediction error");

  const rows = j.current_predictions || j.predictions || j.data || [];
  return rows.map(row => parsePredictionRow(row, metadata));
}

function build36Operational(obs, metadata, predictions) {
  const phaseInfo = nearestTidalPhase(
    obs.latest.direction,
    metadata?.meanFloodDir,
    metadata?.meanEbbDir
  );

  const set =
    phaseInfo.phase === "EBB" ? "WESTERLY" :
    phaseInfo.phase === "FLOOD" ? "EASTERLY" :
    "UNKNOWN";

  return {
    crossCurrentKt: obs.latest.speed,
    set,
    phase: phaseInfo.phase,
    display: `${obs.latest.speed.toFixed(2)} kt ${set.toLowerCase()} set`,
    rawDirectionDeg: obs.latest.direction,
    observedAt: obs.latest.time,
    trend: trendFromSeries(obs.history),
    classification: {
      method: "Observed direction vs NOAA mean ebb/flood directions",
      ...phaseInfo
    },
    prediction: predictions.map(p => ({
      ...p,
      set:
        p.phase === "EBB" ? "WESTERLY" :
        p.phase === "FLOOD" ? "EASTERLY" :
        p.phase
    }))
  };
}

function buildCameronOperational(obs, metadata, predictions) {
  const phaseInfo = nearestTidalPhase(
    obs.latest.direction,
    metadata?.meanFloodDir,
    metadata?.meanEbbDir
  );
  const phase = phaseInfo.phase;

  return {
    actual: {
      speedKt: obs.latest.speed,
      phase,
      observedAt: obs.latest.time,
      rawDirectionDeg: obs.latest.direction,
      inboundEffect: operationalEffect(phase, "INBOUND"),
      outboundEffect: operationalEffect(phase, "OUTBOUND"),
      display: `${obs.latest.speed.toFixed(2)} kt ${phase.toLowerCase()}`
    },
    trend: trendFromSeries(obs.history),
    forecastHours: 12,
    prediction: predictions.map(p => ({
      ...p,
      inboundEffect: operationalEffect(p.phase, "INBOUND"),
      outboundEffect: operationalEffect(p.phase, "OUTBOUND")
    })),
    classification: {
      method: "Observed direction vs NOAA mean ebb/flood directions",
      ...phaseInfo
    }
  };
}

async function noaaWaterLevel() {
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date", "latest");
  u.searchParams.set("station", "8768094");
  u.searchParams.set("product", "water_level");
  u.searchParams.set("datum", "MLLW");
  u.searchParams.set("time_zone", "lst_ldt");
  u.searchParams.set("units", "english");
  u.searchParams.set("format", "json");
  u.searchParams.set("application", "LCPTMS");

  const j = await getJson(u.toString());
  const row = (j.data || []).at(-1);
  if (!row) throw new Error("No NOAA water-level observation");
  return { value: num(row.v), time: row.t, display: `${num(row.v).toFixed(2)} ft MLLW` };
}

async function nwsObservation() {
  const j = await getJson(
    "https://api.weather.gov/stations/KLCH/observations/latest",
    {
      Accept: "application/geo+json",
      "User-Agent": "LCPTMS/0.2 operations@lcptms.com"
    }
  );
  const p = j.properties || {};
  const ms = p.windSpeed?.value;
  const deg = p.windDirection?.value;
  const meters = p.visibility?.value;
  const kt = ms == null ? null : ms * 1.94384;
  const nm = meters == null ? null : meters / 1852;

  return {
    wind: {
      valueKt: kt,
      direction: deg,
      display: kt == null ? "Unavailable" : `${kt.toFixed(0)} kt @ ${deg == null ? "—" : Math.round(deg) + "°"}`
    },
    visibility: {
      valueNm: nm,
      display: nm == null ? "Unavailable" : `${nm.toFixed(1)} NM`
    },
    timestamp: p.timestamp
  };
}

async function nhcStatus() {
  try {
    const j = await getJson("https://www.nhc.noaa.gov/CurrentStorms.json");
    const storms = Array.isArray(j?.activeStorms) ? j.activeStorms : [];
    return {
      count: storms.length,
      storms,
      display: storms.length ? `${storms.length} active system${storms.length > 1 ? "s" : ""}` : "No active systems"
    };
  } catch {
    return { count: null, storms: [], display: "Feed check required" };
  }
}

async function stormGeoStatus() {
  if (!process.env.STORMGEO_APP_KEY) {
    return { configured: false, display: "Credentials required" };
  }
  return { configured: true, display: "Configured — endpoint mapping next" };
}

export async function GET() {
  const result = {
    sources: {},
    generatedAt: new Date().toISOString(),
    schemaVersion: "0.3.0"
  };

  const [meta36Res, metaCamRes] = await Promise.allSettled([
    noaaStationMetadata("lc0101"),
    noaaStationMetadata("lc0201")
  ]);

  const meta36 = meta36Res.status === "fulfilled"
    ? meta36Res.value
    : { id: "lc0101", currbin: 1, meanFloodDir: null, meanEbbDir: null };

  const metaCam = metaCamRes.status === "fulfilled"
    ? metaCamRes.value
    : { id: "lc0201", currbin: 30, meanFloodDir: null, meanEbbDir: null };

  const bin36 = meta36.currbin ?? 1;
  const binCam = metaCam.currbin ?? 30;

  const tasks = await Promise.allSettled([
    noaaCurrentObservation("lc0101", bin36, 2),
    noaaCurrentObservation("lc0201", binCam, 2),
    noaaCurrentPredictions("lc0101", bin36, meta36, 12),
    noaaCurrentPredictions("lc0201", binCam, metaCam, 12),
    noaaWaterLevel(),
    nwsObservation(),
    nhcStatus(),
    stormGeoStatus()
  ]);

  const [obs36Res, obsCamRes, pred36Res, predCamRes, waterRes, nwsRes, nhcRes, stormRes] = tasks;

  const obs36 = obs36Res.status === "fulfilled" ? obs36Res.value : null;
  const obsCam = obsCamRes.status === "fulfilled" ? obsCamRes.value : null;
  const pred36 = pred36Res.status === "fulfilled" ? pred36Res.value : [];
  const predCam = predCamRes.status === "fulfilled" ? predCamRes.value : [];

  result.noaa = {
    metadata: { lb36: meta36, cameron: metaCam },
    raw: {
      lb36: obs36?.latest || null,
      cameron: obsCam?.latest || null
    },
    operational: {
      lb36: obs36
        ? build36Operational(obs36, meta36, pred36)
        : { display: "Unavailable", prediction: [] },
      cameron: obsCam
        ? buildCameronOperational(obsCam, metaCam, predCam)
        : { actual: { display: "Unavailable" }, prediction: [] }
    },
    waterLevel: waterRes.status === "fulfilled"
      ? waterRes.value
      : { display: "Unavailable" }
  };

  // Backward compatibility with current dashboard.
  result.noaa.lb36 = obs36
    ? {
        speed: obs36.latest.speed,
        direction: obs36.latest.direction,
        time: obs36.latest.time,
        display: result.noaa.operational.lb36.display
      }
    : { display: "Unavailable" };

  result.noaa.cameron = obsCam
    ? {
        speed: obsCam.latest.speed,
        direction: obsCam.latest.direction,
        time: obsCam.latest.time,
        display: result.noaa.operational.cameron.actual.display
      }
    : { display: "Unavailable" };

  result.nws = nwsRes.status === "fulfilled"
    ? nwsRes.value
    : {
        wind: { display: "Unavailable" },
        visibility: { display: "Unavailable" }
      };

  result.nhc = nhcRes.status === "fulfilled"
    ? nhcRes.value
    : { display: "Unavailable" };

  result.stormgeo = stormRes.status === "fulfilled"
    ? stormRes.value
    : { configured: false, display: "Unavailable" };

  result.sources.noaa = !!obs36 || !!obsCam || waterRes.status === "fulfilled";
  result.sources.noaaPredictions = pred36.length > 0 || predCam.length > 0;
  result.sources.noaaMetadata = meta36Res.status === "fulfilled" || metaCamRes.status === "fulfilled";
  result.sources.nws = nwsRes.status === "fulfilled";
  result.sources.nhc = nhcRes.status === "fulfilled";
  result.sources.stormgeo = !!result.stormgeo.configured;

  return json(result);
}
