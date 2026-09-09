export const dynamic = "force-dynamic";

import { projectNormalizedMovement } from "../../../lib/scheduleAdapter.js";
import { resolveBerthRouteAnchor } from "../../../lib/berthRouteMap.js";
import {
  noticeRequirementForMovement,
  evaluateOperationalReadiness
} from "../../../lib/noticeEngine.js";

function hhmm(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone:"America/Chicago",
    hour:"2-digit",
    minute:"2-digit",
    hourCycle:"h23"
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
// Replaced by authenticated read-only LakeCharlesPilots.com source once credentials arrive.
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
  const contextDate = new Date();
  const now = new Date();

  const items = ROWS.map((row, index) => {
    // First normalize to determine berth and direction.
    let result = projectNormalizedMovement(row, {
      contextDate,
      source:"MANUAL_DEMO_2026-09-09",
      sourceRecordId:`demo-${index+1}`
    });

    const berthResolution = resolveBerthRouteAnchor(
      result.movement?.movement?.berth
    );

    // If an expected outbound has a confirmed berth anchor, run ETA projection from it.
    if (
      !result.projection?.ok &&
      berthResolution.anchor
    ) {
      result = projectNormalizedMovement(row, {
        contextDate,
        source:"MANUAL_DEMO_2026-09-09",
        sourceRecordId:`demo-${index+1}`,
        etaOptions:{
          startWaypoint:berthResolution.anchor
        }
      });
    }

    const next = nextEta(result.projection);
    const noticeRequirement = noticeRequirementForMovement(result.movement);
    const operational = evaluateOperationalReadiness(result.movement, now);

    return {
      raw: row,
      movement: result.movement,
      projection: result.projection,
      berthResolution,
      noticeRequirement,
      operational,
      display: {
        vessel: result.movement?.vessel?.name,
        direction: result.movement?.movement?.direction,
        status: result.movement?.movement?.status,
        draftFt: result.movement?.vessel?.draftFt,
        berth: result.movement?.movement?.berth,
        berthAnchor: berthResolution.anchor,
        berthMapStatus: berthResolution.status,
        ordered: hhmm(result.movement?.schedule?.orderedAt),
        pbt: hhmm(result.movement?.schedule?.pbtAt),
        noticeRequiredHours: noticeRequirement.hours,
        noticeStatus: operational.notice?.status,
        nextWaypoint: next.waypoint,
        nextEta: hhmm(next.time),
        flags: result.movement?.notes?.machineFlags || []
      }
    };
  });

  const unmappedBerths = [...new Set(
    items
      .filter(x => x.berthResolution?.status === "UNMAPPED")
      .map(x => x.movement?.movement?.berth)
      .filter(Boolean)
  )];

  return Response.json({
    schemaVersion:"0.2.0",
    source:"MANUAL DEMO — awaiting authenticated LakeCharlesPilots.com read-only connector",
    generatedAt:new Date().toISOString(),
    count:items.length,
    unmappedBerths,
    looseInfo:{
      outboundNoticeHours:2,
      inboundNoticeHours:4
    },
    items
  }, {
    headers:{ "Cache-Control":"no-store, max-age=0" }
  });
}
