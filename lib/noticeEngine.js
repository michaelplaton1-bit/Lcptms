// LCPTMS Notice / Readiness Engine v0.1

import {
  MOVEMENT_DIRECTION,
  evaluateNoticeStatus,
  canBecomeOperationallyReady
} from "./trafficModel.js";

export const NOTICE_ENGINE_VERSION = "0.1.0";

export function noticeRequirementForMovement(movement) {
  const direction = movement?.movement?.direction;

  if (direction === MOVEMENT_DIRECTION.INBOUND) {
    return {
      hours: 4,
      basis: "LOOSE_INFO_NOTE",
      label: "4 HR INBOUND NOTICE"
    };
  }

  if (direction === MOVEMENT_DIRECTION.OUTBOUND) {
    return {
      hours: 2,
      basis: "LOOSE_INFO_NOTE",
      label: "2 HR OUTBOUND NOTICE"
    };
  }

  return {
    hours: null,
    basis: "NOT_DEFINED",
    label: "NOTICE TBD"
  };
}

export function evaluateOperationalReadiness(movement, now = new Date()) {
  const notice = evaluateNoticeStatus(movement, now);
  const readiness = canBecomeOperationallyReady(movement);

  const blockers = [...readiness.blockers];

  if (notice.status === "NOTICE_DUE_OR_LATE" || notice.status === "SHORT_NOTICE") {
    blockers.push("NOTICE");
  }

  return {
    notice,
    readiness: {
      ready: blockers.length === 0,
      blockers
    }
  };
}
