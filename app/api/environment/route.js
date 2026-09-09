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
  const text = await r.text();

  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 300)}`);
  }
}

async function getText(url, headers = {}) {
  const r = await fetch(url, { headers, cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${text.slice(0, 300)}`);
  return text;
}

function chicagoDateTime(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);
  const o = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${o.year}${o.month}${o.day} ${o.hour}:${o.minute}`;
}

function trendFromHistory(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { label: "Unknown", deltaKtPerHour: null };
  }

  const valid = points.filter(p => Number.isFinite(p.speed));
  if (valid.length < 2) return { label: "Unknown", deltaKtPerHour: null };

  const a = valid[Math.max(0, valid.length - 6)];
  const b = valid[valid.length - 1];

  const parseLocal = (s) => new Date(String(s).replace(" ", "T")).getTime();
  const hours = Math.max((parseLocal(b.time) - parseLocal(a.time)) / 3600000, 0.01);
  const delta = (b.speed - a.speed) / hours;

  return {
    label: delta > 0.08 ? "Increasing" : delta < -0.08 ? "Decreasing" : "Steady",
    deltaKtPerHour: delta
  };
}

function lb36SetFromDirection(directionDeg) {
  if (!Number.isFinite(directionDeg)) return "UNKNOWN";

  // NOAA current direction is the direction TOWARD which the current flows.
  // Use the E/W vector component for the cross-channel operational label.
  const eastComponent = Math.sin(directionDeg * Math.PI / 180);

  if (Math.abs(eastComponent) < 0.10) return "TRANSITION";
  return eastComponent < 0 ? "WESTERLY" : "EASTERLY";
}

function cameronPhaseFromDirection(directionDeg) {
  if (!Number.isFinite(directionDeg)) return "UNKNOWN";

  // Cameron channel is predominantly N/S.
  // Northward current = FLOOD (up-river); southward = EBB (down-river).
  const northComponent = Math.cos(directionDeg * Math.PI / 180);

  if (Math.abs(northComponent) < 0.15) return "TRANSITION";
  return northComponent > 0 ? "FLOOD" : "EBB";
}

function operationalEffect(phase, vesselDirection) {
  if (!["FLOOD", "EBB"].includes(phase)) return phase;

  if (vesselDirection === "INBOUND") {
    return phase === "FLOOD" ? "FOLLOWING" : "OPPOSING";
  }
  if (vesselDirection === "OUTBOUND") {
    return phase === "FLOOD" ? "OPPOSING" : "FOLLOWING";
  }
  return "UNKNOWN";
}

async function noaaLatestCurrent(station, bin) {
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date", "latest");
  u.searchParams.set("station", station);
  u.searchParams.set("product", "currents");
  u.searchParams.set("bin", String(bin));
  u.searchParams.set("time_zone", "lst_ldt");
  u.searchParams.set("units", "english");
  u.searchParams.set("format", "json");
  u.searchParams.set("application", "LCPTMS");

  const j = await getJson(u.toString());
  if (j.error) throw new Error(j.error.message || "NOAA current error");

  const row = (j.data || []).at(-1);
  if (!row) throw new Error("No NOAA current observation");

  return {
    time: row.t,
    speed: num(row.s),
    direction: num(row.d)
  };
}

async function noaaCurrentHistory(station, bin, hours = 2) {
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("end_date", chicagoDateTime());
  u.searchParams.set("range", String(hours));
  u.searchParams.set("station", station);
  u.searchParams.set("product", "currents");
  u.searchParams.set("bin", String(bin));
  u.searchParams.set("time_zone", "lst_ldt");
  u.searchParams.set("units", "english");
  u.searchParams.set("format", "json");
  u.searchParams.set("application", "LCPTMS");

  const j = await getJson(u.toString());
  if (j.error) throw new Error(j.error.message || "NOAA history error");

  return (j.data || []).map(row => ({
    time: row.t,
    speed: num(row.s),
    direction: num(row.d)
  })).filter(x => x.speed != null);
}

function parsePredictionRow(row) {
  const major =
    num(row.Velocity_Major) ??
    num(row.velocity_major) ??
    num(row.v) ??
    num(row.velocity);

  const speed = Math.abs(
    major ??
    num(row.Speed) ??
    num(row.speed) ??
    num(row.s) ??
    0
  );

  let phase = "UNKNOWN";
  if (major != null) {
    phase = major < 0 ? "EBB" : major > 0 ? "FLOOD" : "SLACK";
  }

  return {
    time: row.Time || row.t || row.time,
    velocityMajor: major,
    speed,
    phase,
    meanFloodDir: num(row.meanFloodDir ?? row.Mean_Flood_Direction),
    meanEbbDir: num(row.meanEbbDir ?? row.Mean_Ebb_Direction)
  };
}

function extractPredictionRows(j) {
  const candidates = [
    j?.current_predictions,
    j?.predictions,
    j?.data,
    j?.currentPredictions,
    j?.current_predictions?.cp,
    j?.current_predictions?.predictions,
    j?.current_predictions?.data,
    j?.predictions?.cp,
    j?.predictions?.predictions,
    j?.predictions?.data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return {
        rows: candidate,
        shape: "array"
      };
    }

    if (candidate && typeof candidate === "object") {
      for (const [key, value] of Object.entries(candidate)) {
        if (Array.isArray(value)) {
          return {
            rows: value,
            shape: `object.${key}`
          };
        }
      }
    }
  }

  return {
    rows: [],
    shape: j && typeof j === "object" ? `unrecognized:${Object.keys(j).join(",")}` : typeof j
  };
}

async function noaaCurrentPredictions(station, bin, hours = 8) {
  const u = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("begin_date", chicagoDateTime());
  u.searchParams.set("range", String(hours));
  u.searchParams.set("station", station);
  u.searchParams.set("product", "currents_predictions");
  u.searchParams.set("bin", String(bin));
  u.searchParams.set("time_zone", "lst_ldt");
  u.searchParams.set("interval", "30");
  u.searchParams.set("units", "english");
  u.searchParams.set("format", "json");
  u.searchParams.set("vel_type", "default");
  u.searchParams.set("application", "LCPTMS");

  const j = await getJson(u.toString());
  if (j.error) throw new Error(j.error.message || "NOAA prediction error");

  const extracted = extractPredictionRows(j);

  return {
    rows: extracted.rows.map(parsePredictionRow),
    responseShape: extracted.shape,
    topLevelKeys: j && typeof j === "object" ? Object.keys(j) : []
  };
}

async function noaaPortsCurrentStates() {
  // NOAA's text PORTS screen explicitly labels real-time current as
  // (F)lood, (S)lack, or (E)bb. This is used as an authoritative
  // observed-state label when parseable, while the Data API remains
  // the source for velocity/direction.
  const html = await getText("https://tidesandcurrents.noaa.gov/ports/textscreen.shtml?port=lc");

  const flat = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&deg;?/gi, "°")
    .replace(/\s+/g, " ");

  function find(labelFragments) {
    for (const label of labelFragments) {
      const idx = flat.toLowerCase().indexOf(label.toLowerCase());
      if (idx < 0) continue;

      const chunk = flat.slice(idx, idx + 180);
      const m = chunk.match(/([0-9.]+)\s*kn\s*\(([FES])\)\s*,?\s*([0-9.]+)°/i);
      if (m) {
        return {
          speedKt: Number(m[1]),
          phaseCode: m[2].toUpperCase(),
          phase:
            m[2].toUpperCase() === "F" ? "FLOOD" :
            m[2].toUpperCase() === "E" ? "EBB" :
            "SLACK",
          direction: Number(m[3])
        };
      }
    }
    return null;
  }

  return {
    lb36: find(["LB 36 Calcasieu Ch", "LB 36 Calcasieu"]),
    cameron: find(["Cameron Fishing Pier"])
  };
}


function compass16(deg) {
  if (!Number.isFinite(deg)) return "—";
  const p=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return p[Math.round((((deg%360)+360)%360)/22.5)%16];
}

function formatLocalObservationTime(value) {
  if (!value) return "—";

  const str = String(value).trim();
  let ms;

  // ISO-8601 timestamps with explicit timezone information (Z or ±HH:MM)
  // must be parsed as absolute instants. This is how NWS timestamps arrive.
  const hasExplicitZone =
    /Z$/i.test(str) ||
    /[+-]\d{2}:\d{2}$/.test(str);

  if (hasExplicitZone) {
    ms = new Date(str).getTime();
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(str)) {
    // NOAA LST/LDT timestamps arrive without an explicit offset.
    ms = parseNoaaLocalTimeMs(str.slice(0,16));
  } else {
    ms = new Date(str).getTime();
  }

  if (!Number.isFinite(ms)) return "—";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short"
  }).formatToParts(new Date(ms));

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.hour}${p.minute} ${p.timeZoneName || "CT"}`;
}

async function noaaWind(station="8768094") {
  const u=new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  u.searchParams.set("date","latest");
  u.searchParams.set("station",station);
  u.searchParams.set("product","wind");
  u.searchParams.set("time_zone","lst_ldt");
  u.searchParams.set("units","english");
  u.searchParams.set("format","json");
  u.searchParams.set("application","LCPTMS");
  const j=await getJson(u.toString());
  if(j.error) throw new Error(j.error.message||"NOAA wind error");
  const row=(j.data||[]).at(-1);
  if(!row) throw new Error("No NOAA wind observation");
  const speedKt=num(row.s), gustKt=num(row.g), directionDeg=num(row.d);
  const directionText=row.dr||compass16(directionDeg);
  return {
    station,stationName:"Calcasieu Pass / Cameron",
    speedKt,gustKt,directionDeg,directionText,
    observedAt:row.t,observedLocal:formatLocalObservationTime(row.t),
    display:speedKt==null?"Unavailable":
      `${directionText} ${speedKt.toFixed(0)} kt${gustKt!=null?` G${gustKt.toFixed(0)}`:""}`
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

  return {
    value: num(row.v),
    time: row.t,
    display: `${num(row.v).toFixed(2)} ft MLLW`
  };
}


function speedToKnots(value, unitCode) {
  const v = num(value);
  if (v == null) {
    return { knots: null, rawValue: value ?? null, rawUnit: unitCode ?? null, conversion: "missing" };
  }

  const u = String(unitCode || "").toLowerCase();

  if (u.includes("m_s-1") || u.includes("m/s")) {
    return {
      knots: v * 1.9438444924406,
      rawValue: v,
      rawUnit: unitCode,
      conversion: "m/s -> kt"
    };
  }

  if (u.includes("km_h-1") || u.includes("km/h")) {
    return {
      knots: v / 1.852,
      rawValue: v,
      rawUnit: unitCode,
      conversion: "km/h -> kt"
    };
  }

  if (u.includes("kt") || u.includes("knot")) {
    return {
      knots: v,
      rawValue: v,
      rawUnit: unitCode,
      conversion: "kt -> kt"
    };
  }

  if (u.includes("mi_h-1") || u.includes("mph")) {
    return {
      knots: v * 0.86897624190065,
      rawValue: v,
      rawUnit: unitCode,
      conversion: "mph -> kt"
    };
  }

  return {
    knots: null,
    rawValue: v,
    rawUnit: unitCode ?? null,
    conversion: "unsupported unit"
  };
}

async function nwsObservation() {
  const j = await getJson(
    "https://api.weather.gov/stations/KLCH/observations/latest",
    {
      Accept: "application/geo+json",
      "User-Agent": "LCPTMS/0.8.1 operations@lcptms.com"
    }
  );

  const p = j.properties || {};

  const windConv = speedToKnots(
    p.windSpeed?.value,
    p.windSpeed?.unitCode
  );

  const gustConv = speedToKnots(
    p.windGust?.value,
    p.windGust?.unitCode
  );

  const deg = p.windDirection?.value;
  const meters = p.visibility?.value;
  const nm = meters == null ? null : meters / 1852;
  const directionText = compass16(deg);

  return {
    station: "KLCH",
    stationName: "Lake Charles Regional Airport",

    wind: {
      valueKt: windConv.knots,
      gustKt: gustConv.knots,
      direction: deg,
      directionText,
      observedAt: p.timestamp,
      observedLocal: formatLocalObservationTime(p.timestamp),

      raw: {
        speedValue: windConv.rawValue,
        speedUnitCode: windConv.rawUnit,
        speedConversion: windConv.conversion,
        gustValue: gustConv.rawValue,
        gustUnitCode: gustConv.rawUnit,
        gustConversion: gustConv.conversion,
        sourceTimestampIso: p.timestamp,
        renderedAmericaChicago: formatLocalObservationTime(p.timestamp)
      },

      display:
        windConv.knots == null
          ? "Unavailable"
          : `${directionText} ${windConv.knots.toFixed(0)} kt${
              gustConv.knots != null && gustConv.knots >= 1
                ? ` G${gustConv.knots.toFixed(0)}`
                : ""
            }`
    },

    visibility: {
      valueNm: nm,
      display: nm == null ? "Unavailable" : `${nm.toFixed(1)} NM`
    },

    timestamp: p.timestamp,
    observedLocal: formatLocalObservationTime(p.timestamp)
  };
}

async function nhcStatus() {
  try {
    const j = await getJson("https://www.nhc.noaa.gov/CurrentStorms.json");
    const storms = Array.isArray(j?.activeStorms) ? j.activeStorms : [];
    return {
      count: storms.length,
      storms,
      display:
        storms.length
          ? `${storms.length} active system${storms.length > 1 ? "s" : ""}`
          : "No active systems"
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


function timezoneOffsetMsAt(utcMs, timeZone = "America/Chicago") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(utcMs));

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );

  return asUtc - utcMs;
}

function parseNoaaLocalTimeMs(value, timeZone = "America/Chicago") {
  if (!value) return NaN;

  const m = String(value).trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!m) return NaN;

  const [, y, mo, d, h, mi, s = "00"] = m;
  const naiveUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );

  let offset = timezoneOffsetMsAt(naiveUtc, timeZone);
  let utcMs = naiveUtc - offset;
  offset = timezoneOffsetMsAt(utcMs, timeZone);
  utcMs = naiveUtc - offset;

  return utcMs;
}

function nearestPredictionToObservation(predictions, observedLocalTime) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    return {
      prediction: null,
      predictionTimeDifferenceMinutes: null,
      observedEpochMs: null,
      predictionEpochMs: null
    };
  }

  const observedMs = parseNoaaLocalTimeMs(observedLocalTime);
  if (!Number.isFinite(observedMs)) {
    return {
      prediction: null,
      predictionTimeDifferenceMinutes: null,
      observedEpochMs: null,
      predictionEpochMs: null
    };
  }

  let best = null;
  let bestMs = null;
  let bestDiff = Infinity;

  for (const p of predictions) {
    if (!p?.time) continue;
    const t = parseNoaaLocalTimeMs(p.time);
    if (!Number.isFinite(t)) continue;

    const diff = Math.abs(t - observedMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
      bestMs = t;
    }
  }

  return {
    prediction: best,
    predictionTimeDifferenceMinutes:
      best == null ? null : Math.round((bestMs - observedMs) / 60000),
    observedEpochMs: observedMs,
    predictionEpochMs: bestMs
  };
}

function buildDiagnostic(settledResult) {
  return settledResult.status === "fulfilled"
    ? { ok: true }
    : { ok: false, error: String(settledResult.reason?.message || settledResult.reason || "Unknown error") };
}

export async function GET() {
  const result = {
    schemaVersion: "0.8.3",
    generatedAt: new Date().toISOString(),
    sources: {},
    diagnostics: {}
  };

  const tasks = await Promise.allSettled([
    noaaLatestCurrent("lc0101", 1),      // 0
    noaaLatestCurrent("lc0201", 30),     // 1
    noaaCurrentHistory("lc0101", 1, 2),  // 2
    noaaCurrentHistory("lc0201", 30, 2), // 3
    noaaCurrentPredictions("lc0201", 20, 8), // 4 - Cameron prediction bin
    noaaPortsCurrentStates(),            // 5
    noaaWind("8768094"),                 // 6
    noaaWaterLevel(),                    // 7
    nwsObservation(),                    // 8
    nhcStatus(),                         // 9
    stormGeoStatus()                     // 10
  ]);

  const [
    lb36ObsRes, camObsRes,
    lb36HistRes, camHistRes,
    camPredRes,
    portsStateRes,
    noaaWindRes,
    waterRes, nwsRes, nhcRes, stormRes
  ] = tasks;

  const lb36Obs = lb36ObsRes.status === "fulfilled" ? lb36ObsRes.value : null;
  const camObs = camObsRes.status === "fulfilled" ? camObsRes.value : null;
  const lb36Hist = lb36HistRes.status === "fulfilled" ? lb36HistRes.value : [];
  const camHist = camHistRes.status === "fulfilled" ? camHistRes.value : [];
  const camPredPayload = camPredRes.status === "fulfilled" ? camPredRes.value : { rows: [], responseShape: "error", topLevelKeys: [] };
  const camPred = Array.isArray(camPredPayload.rows) ? camPredPayload.rows : [];
  const portsState = portsStateRes.status === "fulfilled" ? portsStateRes.value : {};

  const lb36ObservedPhase = portsState?.lb36?.phase || null;
  const camObservedPhase = portsState?.cameron?.phase || null;

  // 36 Buoy operational convention:
  // EBB on the NOAA cross-current meter = WESTERLY set.
  // FLOOD = EASTERLY set.
  const lb36FallbackSet = lb36Obs ? lb36SetFromDirection(lb36Obs.direction) : "UNKNOWN";
  const lb36Set =
    lb36ObservedPhase === "EBB" ? "WESTERLY" :
    lb36ObservedPhase === "FLOOD" ? "EASTERLY" :
    lb36ObservedPhase === "SLACK" ? "SLACK" :
    lb36FallbackSet;

  // Cameron operational convention:
  // NOAA FLOOD/EBB label is preferred. Direction-based classification is fallback.
  const camPhase =
    camObservedPhase ||
    (camObs ? cameronPhaseFromDirection(camObs.direction) : "UNKNOWN");

  result.noaa = {
    raw: {
      lb36: lb36Obs,
      cameron: camObs
    },

    operational: {
      lb36: lb36Obs ? {
        crossCurrentKt: lb36Obs.speed,
        set: lb36Set,
        phase: lb36ObservedPhase || "DERIVED",
        observedAt: lb36Obs.time,
        observedLocal: formatLocalObservationTime(lb36Obs.time),
        rawDirectionDeg: lb36Obs.direction,
        display:
          lb36Set === "SLACK"
            ? `${lb36Obs.speed.toFixed(2)} kt slack`
            : `${lb36Obs.speed.toFixed(2)} kt ${lb36Set.toLowerCase()} set`,
        trend: trendFromHistory(lb36Hist),
        forecastAvailable: false,
        forecastNote: "LB36 cross current is live observation only",
        observedStateSource:
          lb36ObservedPhase ? "NOAA PORTS Flood/Ebb/Slack label" : "Direction-vector fallback"
      } : {
        display: "Unavailable",
        forecastAvailable: false,
        forecastNote: "LB36 cross current is live observation only"
      },

      cameron: camObs ? (() => {
        const prediction = camPred.map(p => ({
          ...p,
          inboundEffect: operationalEffect(p.phase, "INBOUND"),
          outboundEffect: operationalEffect(p.phase, "OUTBOUND")
        }));

        const alignedPrediction = nearestPredictionToObservation(
          prediction,
          camObs.time
        );

        const predictedNow = alignedPrediction.prediction;
        const deviationKt =
          predictedNow && Number.isFinite(predictedNow.speed)
            ? camObs.speed - predictedNow.speed
            : null;

        return {
          actual: {
            speedKt: camObs.speed,
            phase: camPhase,
            observedAt: camObs.time,
            observedLocal: formatLocalObservationTime(camObs.time),
            rawDirectionDeg: camObs.direction,
            inboundEffect: operationalEffect(camPhase, "INBOUND"),
            outboundEffect: operationalEffect(camPhase, "OUTBOUND"),
            display: `${camObs.speed.toFixed(2)} kt ${String(camPhase).toLowerCase()}`
          },
          predictedNow,
          comparedToObservedAt: camObs.time,
          predictionTimeDifferenceMinutes:
            alignedPrediction.predictionTimeDifferenceMinutes,
          deviationKt,
          deviationDisplay:
            deviationKt == null
              ? "Unavailable"
              : `${deviationKt >= 0 ? "+" : ""}${deviationKt.toFixed(2)} kt actual vs prediction`,
          alignmentDisplay:
            predictedNow == null
              ? "Unavailable"
              : `Observed ${camObs.time}; prediction ${predictedNow.time}; delta ${alignedPrediction.predictionTimeDifferenceMinutes} min`,
          trend: trendFromHistory(camHist),
          forecastHours: 8,
          predictionResponseShape: camPredPayload.responseShape,
          predictionResponseTopLevelKeys: camPredPayload.topLevelKeys,
          forecastModel: {
            observationStation: "lc0201",
            observationBin: 30,
            predictionStation: "lc0201",
            predictionBin: 20,
            primaryPlanningHorizonHours: 6,
            extendedPlanningHorizonHours: 8
          },
          observedStateSource:
            camObservedPhase ? "NOAA PORTS Flood/Ebb/Slack label" : "Direction-vector fallback",
          prediction
        };
      })() : {
        actual: { display: "Unavailable" },
        predictedNow: null,
        deviationKt: null,
        deviationDisplay: "Unavailable",
        forecastHours: 8,
        prediction: []
      }
    },

    portsState: portsState || {},

    wind:
      noaaWindRes.status === "fulfilled"
        ? noaaWindRes.value
        : { display:"Unavailable", observedLocal:"—" },

    waterLevel:
      waterRes.status === "fulfilled"
        ? waterRes.value
        : { display: "Unavailable" }
  };

  // Backward-compatible fields for existing dashboard.
  result.noaa.lb36 = lb36Obs ? {
    speed: lb36Obs.speed,
    direction: lb36Obs.direction,
    time: lb36Obs.time,
    display: result.noaa.operational.lb36.display
  } : { display: "Unavailable" };

  result.noaa.cameron = camObs ? {
    speed: camObs.speed,
    direction: camObs.direction,
    time: camObs.time,
    display: result.noaa.operational.cameron.actual.display
  } : { display: "Unavailable" };

  if (result.noaa.waterLevel?.time) {
    result.noaa.waterLevel.observedLocal=formatLocalObservationTime(result.noaa.waterLevel.time);
  }

  result.nws =
    nwsRes.status === "fulfilled"
      ? nwsRes.value
      : {
          wind: { display: "Unavailable" },
          visibility: { display: "Unavailable" }
        };

  result.nhc =
    nhcRes.status === "fulfilled"
      ? nhcRes.value
      : { display: "Unavailable" };

  result.stormgeo =
    stormRes.status === "fulfilled"
      ? stormRes.value
      : { configured: false, display: "Unavailable" };

  result.diagnostics = {
    noaa: {
      lb36Observation: buildDiagnostic(lb36ObsRes),
      cameronObservation: buildDiagnostic(camObsRes),
      lb36History: buildDiagnostic(lb36HistRes),
      cameronHistory: buildDiagnostic(camHistRes),
      lb36Prediction: {
        ok: null,
        supported: false,
        note: "LB36 cross current is live observation only; no prediction requested"
      },
      cameronPrediction:
        camPredRes.status === "fulfilled"
          ? {
              ok: true,
              responseShape: camPredPayload.responseShape,
              topLevelKeys: camPredPayload.topLevelKeys,
              points: camPred.length
            }
          : buildDiagnostic(camPredRes),
      portsFloodEbbState: buildDiagnostic(portsStateRes),
      windCalcasieuPass: buildDiagnostic(noaaWindRes),
      waterLevel: buildDiagnostic(waterRes)
    },
    nws: buildDiagnostic(nwsRes),
    nhc: buildDiagnostic(nhcRes),
    stormgeo: buildDiagnostic(stormRes)
  };

  result.sources = {
    noaa: !!lb36Obs || !!camObs || waterRes.status === "fulfilled",
    noaaPredictions: camPred.length > 0,
    noaaPortsState: !!portsState?.lb36 || !!portsState?.cameron,
    noaaWind: noaaWindRes.status === "fulfilled",
    nws: nwsRes.status === "fulfilled",
    nhc: nhcRes.status === "fulfilled",
    stormgeo: !!result.stormgeo.configured
  };

  return json(result);
}
