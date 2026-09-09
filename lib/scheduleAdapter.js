// LCPTMS Schedule Normalization Adapter v0.1
// Converts LakeCharlesPilots.com-style schedule rows into normalized movement records.

import {
  createMovement,
  MOVEMENT_DIRECTION,
  MOVEMENT_STATE
} from "./trafficModel.js";

import {
  calculateWaypointEtas
} from "./etaEngine.js";

export const SCHEDULE_ADAPTER_VERSION = "0.1.0";

const STATUS_MAP = [
  { test: /I\/B|INBOUND/i, direction: MOVEMENT_DIRECTION.INBOUND },
  { test: /O\/B|OUTBOUND/i, direction: MOVEMENT_DIRECTION.OUTBOUND },
  { test: /SHIFT/i, direction: MOVEMENT_DIRECTION.SHIFT },
  { test: /AOB|AOA|ANCHOR/i, direction: MOVEMENT_DIRECTION.ANCHORAGE }
];

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numberOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function draftFeet(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();

  // Accept forms like 40' 0", 33' 2", 27' 3"
  const m = s.match(/(\d+)\s*['′]\s*(\d+)?/);
  if (m) {
    const ft = Number(m[1]);
    const inches = Number(m[2] || 0);
    return ft + inches / 12;
  }

  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function inferDirection(row) {
  const status = [
    row.Status,
    row.status,
    row.Direction,
    row.direction,
    row.Remarks,
    row.remarks
  ].filter(Boolean).join(" ");

  for (const item of STATUS_MAP) {
    if (item.test.test(status)) return item.direction;
  }

  // If "Off Dock" exists and 36/ICWW follows, likely outbound.
  if (clean(row["Off Dock"] ?? row.offDock)) return MOVEMENT_DIRECTION.OUTBOUND;

  return null;
}

function parseScheduleToken(token, contextDate) {
  // Supports website shorthand such as:
  // 09/1130  -> current month/year, day 09, 11:30
  // 10/0045  -> day 10, 00:45
  // 09/      -> unknown clock time
  const raw = clean(token);
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const hhmm = m[2];
  const hh = Number(hhmm.slice(0,2));
  const mm = Number(hhmm.slice(2,4));

  const base = contextDate ? new Date(contextDate) : new Date();
  if (!Number.isFinite(base.getTime())) return null;

  // We store local civil time with explicit America/Chicago-equivalent offset supplied by caller later.
  // For now use a local ISO-like token that the schedule ingestion layer can normalize server-side.
  const year = base.getFullYear();
  const month = base.getMonth() + 1;

  const pad = n => String(n).padStart(2, "0");

  return `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:00`;
}

function movementState(row) {
  const status = clean(row.Status ?? row.status) || "";
  if (/MOVING|I\/B|O\/B/i.test(status)) return MOVEMENT_STATE.MOVING;
  if (/DELAY/i.test(status)) return MOVEMENT_STATE.DELAYED;
  if (/DCK\/SAIL|DOCK\/SAIL|PBT/i.test(status)) return MOVEMENT_STATE.PBT_ASSIGNED;
  return MOVEMENT_STATE.EXPECTED;
}

function parseWaypointActuals(row, contextDate) {
  const actual = {};

  const candidates = [
    ["36_BUOY", row["36"] ?? row["36B"] ?? row.b36],
    ["CALCASIEU_ICW", row["ICWW"] ?? row.ICWW ?? row.icww],
    ["OFF_DOCK", row["Off Dock"] ?? row.offDock]
  ];

  for (const [key, value] of candidates) {
    const parsed = parseScheduleToken(value, contextDate);
    if (parsed) actual[key] = parsed;
  }

  return actual;
}

function remarksFlags(text) {
  const t = String(text || "").toUpperCase();
  const flags = [];

  if (t.includes("DELAY TRAFFIC")) flags.push("DELAY_TRAFFIC");
  if (t.includes("TUG")) flags.push("TUG_RELATED");
  if (t.includes("2 PILOT")) flags.push("SECOND_PILOT");
  if (t.includes("AOB")) flags.push("ANCHORAGE_OR_BOARDING_NOTE");
  if (t.includes("IRW")) flags.push("IN_RIVER_WAIT");
  if (t.includes("HOLD")) flags.push("HOLD_NOTE");

  return flags;
}

export function normalizeScheduleRow(row, options = {}) {
  const contextDate = options.contextDate || new Date();

  const direction = inferDirection(row);

  const orderedAt = parseScheduleToken(
    row.Ordered ?? row.ordered,
    contextDate
  );

  const pbtAt = parseScheduleToken(
    row.PBT ?? row.pbt,
    contextDate
  );

  const actualWaypoints = parseWaypointActuals(row, contextDate);

  const movement = createMovement({
    vessel: {
      name: clean(row.Vessel ?? row.vessel),
      loaFt: numberOrNull(row.Length ?? row.LOA ?? row.length),
      beamFt: numberOrNull(row.Beam ?? row.beam),
      dwt: numberOrNull(row.DWT ?? row.dwt),
      draftFt: draftFeet(row.Draft ?? row.draft),
      class: clean(row.Class ?? row.class)
    },

    movement: {
      direction,
      berth: clean(row.Berth ?? row.berth),
      status: movementState(row)
    },

    schedule: {
      orderedAt,
      pbtAt,
      actualStartAt:
        parseScheduleToken(
          row["POB/Last Line"] ??
          row["POB/LAST LINE"] ??
          row.pobLastLine,
          contextDate
        ),
      lastChangedAt: clean(row["Last Change"] ?? row.lastChange)
    },

    resources: {
      pilotInitials: clean(row.LH ?? row.lh),
      tugCompany: clean(row["Tug Co."] ?? row["Tug Co"] ?? row.tugCompany)
    },

    route: {
      actualWaypoints,
      currentWaypoint:
        actualWaypoints.CALCASIEU_ICW ? "CALCASIEU_ICW" :
        actualWaypoints["36_BUOY"] ? "36_BUOY" :
        null
    },

    notes: {
      remarksRaw: clean(row.Remarks ?? row.remarks),
      machineFlags: remarksFlags(row.Remarks ?? row.remarks)
    },

    audit: {
      source: options.source || "LakeCharlesPilots.com",
      sourceRecordId: options.sourceRecordId || null,
      ingestedAt: new Date().toISOString()
    }
  });

  return movement;
}

export function normalizeScheduleRows(rows, options = {}) {
  return (rows || []).map((row, index) =>
    normalizeScheduleRow(row, {
      ...options,
      sourceRecordId:
        options.sourceRecordIdPrefix != null
          ? `${options.sourceRecordIdPrefix}-${index + 1}`
          : null
    })
  );
}

export function projectNormalizedMovement(row, options = {}) {
  const movement = normalizeScheduleRow(row, options);
  const projection = calculateWaypointEtas(
    movement,
    options.etaOptions || {}
  );

  return {
    movement,
    projection
  };
}

export function classifyScheduleBucket(row) {
  const section = String(
    row.__section ??
    row.section ??
    row.bucket ??
    ""
  ).toUpperCase();

  if (section.includes("MOVING")) return "MOVING";
  if (section.includes("EXPECTED")) return "EXPECTED";
  if (section.includes("ARRIVING") || section.includes("BAR")) return "ARRIVING_AT_BAR";
  if (section.includes("IN PORT")) return "IN_PORT";
  return "UNKNOWN";
}
