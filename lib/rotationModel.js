// LCPTMS Rotation Model Scaffold v0.1
// Starts modeling pilot rotation without inventing rotation rules.
// Current purpose: identify which pilot units are assigned and which are underway.
// Actual ordering/advancement rules remain PENDING HUMAN DEFINITION.

export const ROTATION_MODEL_VERSION="0.1.0";

function unique(values){
  return [...new Set(values.filter(Boolean).map(v=>String(v).trim()).filter(Boolean))];
}

export function rotationSnapshot(items=[]){
  const live=Array.isArray(items)?items:[];

  const assignments=live
    .filter(x=>(x?.pilotUnitNumbers||[]).length)
    .map(x=>({
      logId:x.logId||null,
      vessel:x?.display?.vessel||x?.native?.VesselName||null,
      section:x.section||null,
      underway:x.section==="MOVING",
      pilotUnits:unique(x.pilotUnitNumbers||[]),
      direction:x?.display?.direction||x?.native?.Direction||null,
      berth:x?.display?.berth||x?.native?.Berth||null,
      ordered:x?.movement?.schedule?.orderedAt||x?.native?.OrderedTime||null,
      pbt:x?.movement?.schedule?.pbtAt||x?.native?.PBT||null
    }));

  const assignedUnits=unique(assignments.flatMap(x=>x.pilotUnits));
  const underwayUnits=unique(assignments.filter(x=>x.underway).flatMap(x=>x.pilotUnits));
  const expectedUnits=unique(assignments.filter(x=>!x.underway).flatMap(x=>x.pilotUnits));

  return {
    modelVersion:ROTATION_MODEL_VERSION,
    status:"ROTATION_RULES_PENDING",
    note:"Assignment state is live; rotation order/advancement is intentionally not inferred yet.",
    assignedUnits,
    underwayUnits,
    expectedUnits,
    assignments
  };
}
