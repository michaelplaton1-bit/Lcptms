// LCPTMS Berth / Route Map v0.1
// Conservative initial mapping. Unknown berths stay unmapped until confirmed operationally.

export const BERTH_ROUTE_MAP_VERSION = "0.1.0";

export const ROUTE_ANCHORS = Object.freeze({
  CC_BUOY: "CC_BUOY",
  B36: "36_BUOY",
  B60: "60_BEACON",
  ICW: "CALCASIEU_ICW",
  I210: "I210_BRIDGE",
  CITY_DOCKS: "CITY_DOCKS_CD9_119",
  I10: "I10_BRIDGE"
});

// Only anchors explicitly known from the current LCPTMS waypoint model are mapped here.
// Terminal/berth positions that have not yet been operationally confirmed are intentionally omitted.
export const BERTH_ROUTE_MAP = Object.freeze({
  "CITY DOCKS": {
    anchor: ROUTE_ANCHORS.CITY_DOCKS,
    confidence: "CONFIRMED_BY_WAYPOINT_MODEL",
    aliases: ["CITY DOCKS", "CD-9", "CD9", "BEACON 119", "119"]
  },
  "PORT OF LAKE CHARLES CITY DOCKS": {
    anchor: ROUTE_ANCHORS.CITY_DOCKS,
    confidence: "CONFIRMED_BY_WAYPOINT_MODEL",
    aliases: ["PORT OF LAKE CHARLES CITY DOCKS"]
  }
});

function norm(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function resolveBerthRouteAnchor(berth) {
  const raw = norm(berth);
  if (!raw) {
    return {
      berth: berth ?? null,
      anchor: null,
      matchedBy: null,
      confidence: null,
      status: "NO_BERTH"
    };
  }

  for (const [name, entry] of Object.entries(BERTH_ROUTE_MAP)) {
    const aliases = [name, ...(entry.aliases || [])].map(norm);
    if (aliases.includes(raw)) {
      return {
        berth,
        anchor: entry.anchor,
        matchedBy: name,
        confidence: entry.confidence,
        status: "MAPPED"
      };
    }
  }

  return {
    berth,
    anchor: null,
    matchedBy: null,
    confidence: null,
    status: "UNMAPPED"
  };
}

export function listUnmappedBerths(rows = []) {
  const seen = new Map();

  for (const row of rows) {
    const berth = row?.movement?.berth ?? row?.Berth ?? row?.berth;
    if (!berth) continue;

    const resolved = resolveBerthRouteAnchor(berth);
    if (resolved.status !== "UNMAPPED") continue;

    const key = norm(berth);
    seen.set(key, {
      berth,
      occurrences: (seen.get(key)?.occurrences || 0) + 1
    });
  }

  return [...seen.values()].sort((a,b) => b.occurrences - a.occurrences);
}
