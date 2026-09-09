export const dynamic = "force-dynamic";

import { projectNormalizedMovement } from "../../../lib/scheduleAdapter.js";

function hhmm(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone:"America/Chicago", hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).format(d);
}

function nextEta(projection) {
  if (!projection?.ok) return { waypoint:null, time:null };
  const modeled = Object.entries(projection.etas || {})
    .filter(([,v]) => v?.source === "MODELED_ETA" && v?.time)
    .map(([waypoint,v]) => ({ waypoint, time:v.time }))
    .sort((a,b) => new Date(a.time) - new Date(b.time));
  return modeled[0] || { waypoint:null, time:null };
}

// TEMPORARY MANUAL DEMO DATA.
// These rows prove the normalized schedule -> ETA pipeline.
// Replace this array with the authenticated read-only schedule connector once credentials arrive.
const ROWS = [
  {
    __section:"Vessels Expected To Move",
    Vessel:"MADELYN GRACE",
    Ordered:"09/0700",
    PBT:"09/1130",
    Status:"Dck/Sail",
    Length:"600",
    Beam:"106",
    DWT:"50137",
    Draft:"40' 0\"",
    Berth:"CS/B",
    "Tug Co.":"BAY",
    LH:"HMT",
    Remarks:"DELAY TRAFFIC/TUGS"
  },
  {
    __section:"Vessels Expected To Move",
    Vessel:"HAFNIA SWIFT",
    Ordered:"09/1100",
    PBT:"09/1530",
    Status:"Dck/Sail",
    Remarks:""
  },
  {
    __section:"Vessels Moving within the VTIS",
    Vessel:"MARVEL HERON",
    Status:"I/B 09/0549",
    Length:"976",
    Beam:"161",
    DWT:"92659",
    Draft:"33' 2\"",
    Berth:"CLNG-S",
    "Tug Co.":"MT",
    LH:"TSI",
    "36":"09/0740",
    Remarks:"AOB SW CC (DC-TB) ** 2 PILOTS"
  },
  {
    __section:"Vessels Moving within the VTIS",
    Vessel:"CL AGATHA CHRISTIE",
    Status:"O/B",
    "Off Dock":"09/0954",
    ICWW:"09/1110",
    Remarks:""
  }
];

export async function GET() {
  const contextDate = new Date("2026-09-09T12:00:00-05:00");

  const items = ROWS.map((row, index) => {
    const result = projectNormalizedMovement(row, {
      contextDate,
      source:"MANUAL_DEMO_2026-09-09",
      sourceRecordId:`demo-${index+1}`
    });

    const next = nextEta(result.projection);

    return {
      raw: row,
      movement: result.movement,
      projection: result.projection,
      display: {
        vessel: result.movement?.vessel?.name,
        direction: result.movement?.movement?.direction,
        status: result.movement?.movement?.status,
        draftFt: result.movement?.vessel?.draftFt,
        berth: result.movement?.movement?.berth,
        ordered: hhmm(result.movement?.schedule?.orderedAt),
        pbt: hhmm(result.movement?.schedule?.pbtAt),
        nextWaypoint: next.waypoint,
        nextEta: hhmm(next.time),
        flags: result.movement?.notes?.machineFlags || []
      }
    };
  });

  return Response.json({
    schemaVersion:"0.1.0",
    source:"MANUAL DEMO — awaiting authenticated LakeCharlesPilots.com read-only connector",
    generatedAt:new Date().toISOString(),
    count:items.length,
    items
  }, {
    headers:{ "Cache-Control":"no-store, max-age=0" }
  });
}
