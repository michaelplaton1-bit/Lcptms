// LCPTMS ETA Engine v0.1
// Uses the normalized movement record from lib/trafficModel.js.
// Initial purpose: deterministic waypoint ETA projection.
// Historical calibration and environmental speed adjustments come later.

import {
  MOVEMENT_DIRECTION,
  currentPlanningStart,
  BASELINE_SEGMENT_MINUTES
} from "./trafficModel.js";

export const ETA_ENGINE_VERSION = "0.1.0";

export const WAYPOINT_SEQUENCE = Object.freeze([
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
]);

// Only the currently-known coarse segments are assigned durations.
// Intermediate waypoints remain in the route model so we can calibrate them later.
export const BASELINE_ROUTE_SEGMENTS = Object.freeze([
  { from: "CC_BUOY", to: "36_BUOY", minutes: BASELINE_SEGMENT_MINUTES.CC_BUOY__36_BUOY },
  { from: "36_BUOY", to: "60_BEACON", minutes: BASELINE_SEGMENT_MINUTES["36_BUOY__60_BEACON"] },
  { from: "60_BEACON", to: "CALCASIEU_ICW", minutes: BASELINE_SEGMENT_MINUTES["60_BEACON__CALCASIEU_ICW"] },
  { from: "CALCASIEU_ICW", to: "I210_BRIDGE", minutes: BASELINE_SEGMENT_MINUTES["CALCASIEU_ICW__I210_BRIDGE"] },
  { from: "I210_BRIDGE", to: "CITY_DOCKS_CD9_119", minutes: BASELINE_SEGMENT_MINUTES["I210_BRIDGE__CITY_DOCKS_CD9_119"] },
  { from: "CITY_DOCKS_CD9_119", to: "I10_BRIDGE", minutes: BASELINE_SEGMENT_MINUTES["CITY_DOCKS_CD9_119__I10_BRIDGE"] }
]);

export const DEFAULT_VESSEL_FACTORS = Object.freeze({
  Q_FLEX_LNG: 1.10,
  LNG_CARRIER: 1.06,
  SUEZMAX: 1.08,
  AFRAMAX: 1.05,
  PANAMAX: 1.02,
  BULK_CARRIER: 1.03,
  DEFAULT: 1.00
});

function asDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addMinutes(value, minutes) {
  const d = asDate(value);
  if (!d) return null;
  return new Date(d.getTime() + minutes * 60000);
}

function iso(value) {
  const d = asDate(value);
  return d ? d.toISOString() : null;
}

function normalizeClass(vesselClass) {
  return String(vesselClass || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

export function vesselTimeFactor(movement, overrides = {}) {
  const vesselClass = normalizeClass(movement?.vessel?.class);

  if (overrides[vesselClass] != null) return Number(overrides[vesselClass]);

  if (DEFAULT_VESSEL_FACTORS[vesselClass] != null) {
    return DEFAULT_VESSEL_FACTORS[vesselClass];
  }

  // Light dimensional adjustment until historical calibration replaces this.
  const loa = Number(movement?.vessel?.loaFt);
  const beam = Number(movement?.vessel?.beamFt);
  const draft = Number(movement?.vessel?.draftFt);

  let factor = DEFAULT_VESSEL_FACTORS.DEFAULT;

  if (Number.isFinite(loa) && loa >= 900) factor += 0.04;
  else if (Number.isFinite(loa) && loa >= 750) factor += 0.02;

  if (Number.isFinite(beam) && beam >= 150) factor += 0.03;
  if (Number.isFinite(draft) && draft >= 38) factor += 0.03;
  else if (Number.isFinite(draft) && draft >= 34) factor += 0.015;

  return Number(factor.toFixed(3));
}

export function segmentMinutes(segment, movement, options = {}) {
  const vesselFactor = vesselTimeFactor(movement, options.vesselFactors || {});
  const environmentalFactor =
    Number.isFinite(Number(options.environmentalFactor))
      ? Number(options.environmentalFactor)
      : 1;

  const trafficFactor =
    Number.isFinite(Number(options.trafficFactor))
      ? Number(options.trafficFactor)
      : 1;

  const pilotAdjustmentMinutes =
    Number.isFinite(Number(options.pilotAdjustmentMinutes))
      ? Number(options.pilotAdjustmentMinutes)
      : 0;

  const raw = segment.minutes * vesselFactor * environmentalFactor * trafficFactor;
  return Math.max(0, raw + pilotAdjustmentMinutes);
}

export function directionSequence(direction) {
  if (direction === MOVEMENT_DIRECTION.OUTBOUND) {
    return [...WAYPOINT_SEQUENCE].reverse();
  }
  return [...WAYPOINT_SEQUENCE];
}

function findSegment(from, to) {
  return BASELINE_ROUTE_SEGMENTS.find(
    s => s.from === from && s.to === to
  ) || BASELINE_ROUTE_SEGMENTS.find(
    s => s.from === to && s.to === from
  ) || null;
}

function routeAnchors(direction) {
  // Coarse route anchors for v0.1.
  // Intermediate waypoint timing will be learned later.
  return direction === MOVEMENT_DIRECTION.OUTBOUND
    ? [
        "I10_BRIDGE",
        "CITY_DOCKS_CD9_119",
        "I210_BRIDGE",
        "CALCASIEU_ICW",
        "60_BEACON",
        "36_BUOY",
        "CC_BUOY"
      ]
    : [
        "CC_BUOY",
        "36_BUOY",
        "60_BEACON",
        "CALCASIEU_ICW",
        "I210_BRIDGE",
        "CITY_DOCKS_CD9_119",
        "I10_BRIDGE"
      ];
}

export function latestActualAnchor(movement) {
  const actual = movement?.route?.actualWaypoints || {};
  const direction = movement?.movement?.direction;
  const anchors = routeAnchors(direction);

  let latest = null;

  for (const waypoint of anchors) {
    const value = actual[waypoint];
    const d = asDate(value);
    if (!d) continue;

    if (!latest || d > latest.date) {
      latest = { waypoint, time: value, date: d };
    }
  }

  if (latest) {
    return {
      waypoint: latest.waypoint,
      time: latest.time,
      source: "ACTUAL_WAYPOINT"
    };
  }

  const planning = currentPlanningStart(movement);
  return {
    waypoint:
      direction === MOVEMENT_DIRECTION.OUTBOUND
        ? movement?.movement?.originWaypoint || movement?.route?.currentWaypoint || null
        : movement?.movement?.originWaypoint || movement?.route?.currentWaypoint || "CC_BUOY",
    time: planning?.time || null,
    source: planning?.type || null
  };
}

export function calculateWaypointEtas(movement, options = {}) {
  const direction = movement?.movement?.direction;
  const anchors = routeAnchors(direction);

  const start = latestActualAnchor(movement);

  if (!start.time) {
    return {
      ok: false,
      reason: "NO_START_TIME",
      start,
      etas: {},
      engineVersion: ETA_ENGINE_VERSION
    };
  }

  let startIndex = anchors.indexOf(start.waypoint);

  // If an outbound ship is starting from a berth/last-line position not yet mapped
  // to a named anchor, allow caller to provide the first known waypoint.
  if (startIndex < 0 && options.startWaypoint) {
    startIndex = anchors.indexOf(options.startWaypoint);
    start.waypoint = options.startWaypoint;
  }

  if (startIndex < 0) {
    return {
      ok: false,
      reason: "START_WAYPOINT_NOT_MAPPED",
      start,
      etas: {},
      engineVersion: ETA_ENGINE_VERSION
    };
  }

  const etas = {};
  const legs = [];
  let clock = asDate(start.time);

  etas[start.waypoint] = {
    time: iso(clock),
    source: start.source,
    confidence: "ACTUAL_OR_PLANNING_ANCHOR"
  };

  for (let i = startIndex; i < anchors.length - 1; i++) {
    const from = anchors[i];
    const to = anchors[i + 1];
    const segment = findSegment(from, to);

    if (!segment) {
      legs.push({
        from,
        to,
        status: "UNMODELED",
        minutes: null
      });
      continue;
    }

    const minutes = segmentMinutes(segment, movement, options);
    clock = addMinutes(clock, minutes);

    etas[to] = {
      time: iso(clock),
      source: "MODELED_ETA",
      confidence: options.calibrated ? "CALIBRATED" : "BASELINE",
      minutesFromPrevious: Number(minutes.toFixed(1))
    };

    legs.push({
      from,
      to,
      status: "MODELED",
      minutes: Number(minutes.toFixed(1))
    });
  }

  return {
    ok: true,
    engineVersion: ETA_ENGINE_VERSION,
    direction,
    start,
    vesselFactor: vesselTimeFactor(movement, options.vesselFactors || {}),
    environmentalFactor: options.environmentalFactor ?? 1,
    trafficFactor: options.trafficFactor ?? 1,
    etas,
    legs
  };
}

export function recalculateAfterActualWaypoint(
  movement,
  waypoint,
  actualTime,
  options = {}
) {
  const copy = structuredClone(movement);

  copy.route = copy.route || {};
  copy.route.actualWaypoints = copy.route.actualWaypoints || {};
  copy.route.actualWaypoints[waypoint] = actualTime;
  copy.route.currentWaypoint = waypoint;

  const result = calculateWaypointEtas(copy, options);

  return {
    movement: copy,
    projection: result
  };
}

export function comparePlannedVsActual(movement, waypoint) {
  const actual = asDate(movement?.route?.actualWaypoints?.[waypoint]);
  const modeled = asDate(movement?.route?.modeledEtas?.[waypoint]);

  if (!actual || !modeled) {
    return {
      waypoint,
      varianceMinutes: null,
      status: "INSUFFICIENT_DATA"
    };
  }

  const varianceMinutes = (actual - modeled) / 60000;

  return {
    waypoint,
    varianceMinutes: Number(varianceMinutes.toFixed(1)),
    status:
      varianceMinutes > 10
        ? "LATE"
        : varianceMinutes < -10
          ? "EARLY"
          : "ON_MODEL"
  };
}
