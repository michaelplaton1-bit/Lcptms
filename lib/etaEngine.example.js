import {
  createMovement,
  MOVEMENT_DIRECTION
} from "./trafficModel.js";

import {
  calculateWaypointEtas,
  recalculateAfterActualWaypoint
} from "./etaEngine.js";

// Example inbound movement.
const movement = createMovement({
  vessel: {
    name: "EXAMPLE LNG",
    class: "LNG_CARRIER",
    loaFt: 950,
    beamFt: 150,
    draftFt: 38.5
  },
  movement: {
    direction: MOVEMENT_DIRECTION.INBOUND,
    destination: "Cameron LNG"
  },
  schedule: {
    orderedAt: "2026-09-09T15:00:00-05:00",
    pbtAt: "2026-09-09T15:30:00-05:00"
  },
  route: {
    currentWaypoint: "CC_BUOY"
  }
});

console.log(calculateWaypointEtas(movement));

// Later, actual 36 Buoy passage supersedes the prior projection:
console.log(
  recalculateAfterActualWaypoint(
    movement,
    "36_BUOY",
    "2026-09-09T17:42:00-05:00"
  )
);
