// LCPTMS Traffic Data Model v0.1
// Pure data/model helpers only. No UI or live website integration yet.

export const TRAFFIC_MODEL_VERSION = "0.1.0";

export const MOVEMENT_DIRECTION = Object.freeze({
  INBOUND: "INBOUND",
  OUTBOUND: "OUTBOUND",
  SHIFT: "SHIFT",
  ANCHORAGE: "ANCHORAGE"
});

export const MOVEMENT_STATE = Object.freeze({
  EXPECTED: "EXPECTED",
  NOTICE_PENDING: "NOTICE_PENDING",
  NOTICE_RECEIVED: "NOTICE_RECEIVED",
  ORDERED: "ORDERED",
  PBT_ASSIGNED: "PBT_ASSIGNED",
  READY: "READY",
  MOVING: "MOVING",
  DELAYED: "DELAYED",
  HELD_ENVIRONMENTAL: "HELD_ENVIRONMENTAL",
  HELD_TRAFFIC: "HELD_TRAFFIC",
  HELD_BERTH: "HELD_BERTH",
  HELD_TUGS: "HELD_TUGS",
  PILOT_DISCRETION: "PILOT_DISCRETION",
  COMPLETE: "COMPLETE",
  CANCELLED: "CANCELLED"
});

export const TIME_TYPE = Object.freeze({
  ORDERED: "ORDERED",
  PBT: "PBT",
  ACTUAL_START: "ACTUAL_START",
  ACTUAL_WAYPOINT: "ACTUAL_WAYPOINT",
  MODELED_ETA: "MODELED_ETA",
  REVISED_ETA: "REVISED_ETA",
  COMPLETED: "COMPLETED"
});

// "Loose info notes" are operational rules/nuances supplied during development.
// They remain traceable and overridable rather than being silently hard-coded.
export const LOOSE_INFO_NOTES = [
  {
    id: "notice-outbound-baseline",
    category: "NOTICE_REQUIREMENT",
    status: "BASELINE_OPERATIONAL_RULE",
    text: "Outbound/sailing movements typically require 2 hours notice from the vessel in port.",
    movementDirection: MOVEMENT_DIRECTION.OUTBOUND,
    noticeHours: 2,
    exceptions: [
      "pilot discretion",
      "berth/traffic conflicts",
      "tide/current window constraints",
      "tug availability",
      "special movement requirements"
    ]
  },
  {
    id: "notice-inbound-baseline",
    category: "NOTICE_REQUIREMENT",
    status: "BASELINE_OPERATIONAL_RULE",
    text: "Inbound/arrival movements typically require 4 hours notice, provided the destination berth is available and environmental/traffic constraints align.",
    movementDirection: MOVEMENT_DIRECTION.INBOUND,
    noticeHours: 4,
    exceptions: [
      "destination berth occupied",
      "tide/current window constraints",
      "traffic conflicts",
      "pilot discretion",
      "tug availability",
      "special movement requirements"
    ]
  }
];

export const BASELINE_NOTICE_HOURS = Object.freeze({
  INBOUND: 4,
  OUTBOUND: 2
});

export const DEFAULT_WAYPOINTS = [
  "CC_BUOY",
  "2B_BUOY",
  "8_BUOY",
  "18_BUOY",
  "27_28_BUOY",
  "36_BUOY",
  "60_BEACON",
  "81_82_BEACON",
  "CALCASIEU_ICW",
  "104_NEW_CUT",
  "110_CLIFTON_RIDGE",
  "A4_ANCHORAGE",
  "I210_BRIDGE",
  "CITY_DOCKS_CD9_119",
  "I10_BRIDGE"
];

// Initial rough transit assumptions provided for planning.
// Historical data should progressively replace these with empirical distributions.
export const BASELINE_SEGMENT_MINUTES = Object.freeze({
  CC_BUOY__36_BUOY: 120,
  "36_BUOY__60_BEACON": 60,
  "60_BEACON__CALCASIEU_ICW": 120,
  "CALCASIEU_ICW__I210_BRIDGE": 90,
  "I210_BRIDGE__CITY_DOCKS_CD9_119": 30,
  "CITY_DOCKS_CD9_119__I10_BRIDGE": 30
});

export function createMovement(input = {}) {
  return {
    id: input.id ?? null,

    vessel: {
      name: input.vessel?.name ?? null,
      imo: input.vessel?.imo ?? null,
      class: input.vessel?.class ?? null,
      loaFt: input.vessel?.loaFt ?? null,
      beamFt: input.vessel?.beamFt ?? null,
      dwt: input.vessel?.dwt ?? null,
      draftFt: input.vessel?.draftFt ?? null
    },

    movement: {
      direction: input.movement?.direction ?? null,
      origin: input.movement?.origin ?? null,
      destination: input.movement?.destination ?? null,
      berth: input.movement?.berth ?? null,
      status: input.movement?.status ?? MOVEMENT_STATE.EXPECTED
    },

    schedule: {
      orderedAt: input.schedule?.orderedAt ?? null,
      pbtAt: input.schedule?.pbtAt ?? null,
      actualStartAt: input.schedule?.actualStartAt ?? null,
      noticeReceivedAt: input.schedule?.noticeReceivedAt ?? null,
      noticeRequiredHours:
        input.schedule?.noticeRequiredHours ??
        noticeHoursForDirection(input.movement?.direction),
      lastChangedAt: input.schedule?.lastChangedAt ?? null
    },

    resources: {
      pilotInitials: input.resources?.pilotInitials ?? null,
      secondPilotRequired: input.resources?.secondPilotRequired ?? null,
      tugCompany: input.resources?.tugCompany ?? null,
      tugRequirement: input.resources?.tugRequirement ?? null
    },

    route: {
      currentWaypoint: input.route?.currentWaypoint ?? null,
      actualWaypoints: input.route?.actualWaypoints ?? {},
      modeledEtas: input.route?.modeledEtas ?? {},
      completedWaypoints: input.route?.completedWaypoints ?? []
    },

    constraints: {
      berthAvailable: input.constraints?.berthAvailable ?? null,
      deepDraftWindowRequired: input.constraints?.deepDraftWindowRequired ?? null,
      deepDraftWindowSatisfied: input.constraints?.deepDraftWindowSatisfied ?? null,
      environmental: input.constraints?.environmental ?? [],
      traffic: input.constraints?.traffic ?? [],
      standardsOfCare: input.constraints?.standardsOfCare ?? [],
      pilotDiscretion: input.constraints?.pilotDiscretion ?? null
    },

    notes: {
      remarksRaw: input.notes?.remarksRaw ?? null,
      machineFlags: input.notes?.machineFlags ?? [],
      looseInfoApplied: input.notes?.looseInfoApplied ?? []
    },

    audit: {
      source: input.audit?.source ?? null,
      sourceRecordId: input.audit?.sourceRecordId ?? null,
      ingestedAt: input.audit?.ingestedAt ?? null
    }
  };
}

export function noticeHoursForDirection(direction) {
  if (direction === MOVEMENT_DIRECTION.INBOUND) return BASELINE_NOTICE_HOURS.INBOUND;
  if (direction === MOVEMENT_DIRECTION.OUTBOUND) return BASELINE_NOTICE_HOURS.OUTBOUND;
  return null;
}

export function currentPlanningStart(movement) {
  // Planning hierarchy:
  // moving vessel -> latest actual waypoint/actual start
  // expected vessel -> PBT
  // fallback -> ordered time
  const m = movement || {};

  const actualTimes = Object.entries(m.route?.actualWaypoints || {})
    .filter(([, value]) => !!value)
    .map(([waypoint, time]) => ({ waypoint, time }));

  if (actualTimes.length) {
    actualTimes.sort((a, b) => new Date(a.time) - new Date(b.time));
    const latest = actualTimes[actualTimes.length - 1];
    return { type: TIME_TYPE.ACTUAL_WAYPOINT, time: latest.time, waypoint: latest.waypoint };
  }

  if (m.schedule?.actualStartAt) {
    return { type: TIME_TYPE.ACTUAL_START, time: m.schedule.actualStartAt };
  }

  if (m.schedule?.pbtAt) {
    return { type: TIME_TYPE.PBT, time: m.schedule.pbtAt };
  }

  if (m.schedule?.orderedAt) {
    return { type: TIME_TYPE.ORDERED, time: m.schedule.orderedAt };
  }

  return { type: null, time: null };
}

export function evaluateNoticeStatus(movement, now = new Date()) {
  const requiredHours = movement?.schedule?.noticeRequiredHours;
  const noticeAt = movement?.schedule?.noticeReceivedAt;
  const plannedStart = movement?.schedule?.pbtAt || movement?.schedule?.orderedAt;

  if (requiredHours == null || !plannedStart) {
    return { status: "UNKNOWN", requiredHours, leadHours: null };
  }

  if (!noticeAt) {
    const hoursUntilStart = (new Date(plannedStart) - now) / 3600000;
    return {
      status: hoursUntilStart <= requiredHours ? "NOTICE_DUE_OR_LATE" : "NOTICE_PENDING",
      requiredHours,
      leadHours: null,
      hoursUntilStart
    };
  }

  const leadHours = (new Date(plannedStart) - new Date(noticeAt)) / 3600000;
  return {
    status: leadHours >= requiredHours ? "SATISFIED" : "SHORT_NOTICE",
    requiredHours,
    leadHours
  };
}

export function canBecomeOperationallyReady(movement) {
  const blockers = [];

  if (movement?.constraints?.berthAvailable === false) blockers.push("BERTH_OCCUPIED");
  if (movement?.constraints?.deepDraftWindowRequired === true &&
      movement?.constraints?.deepDraftWindowSatisfied === false) {
    blockers.push("DEEP_DRAFT_WINDOW");
  }

  for (const item of movement?.constraints?.environmental || []) {
    if (item?.blocking === true) blockers.push(item.code || "ENVIRONMENTAL");
  }

  for (const item of movement?.constraints?.traffic || []) {
    if (item?.blocking === true) blockers.push(item.code || "TRAFFIC");
  }

  if (movement?.constraints?.pilotDiscretion?.decision === "HOLD") {
    blockers.push("PILOT_DISCRETION");
  }

  return {
    ready: blockers.length === 0,
    blockers
  };
}
