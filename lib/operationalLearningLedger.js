// LCPTMS Operational Learning Ledger v0.1
// Creates structured learning records from each live schedule cycle.
// This module does NOT autonomously alter hard rules. It records observations,
// predictions, human outcomes, and heuristic context for later analysis.

export const LEARNING_LEDGER_VERSION="0.1.0";

function iso(v){
  if(!v)return null;
  const d=v instanceof Date?v:new Date(v);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
function clean(v){return v===null||v===undefined?null:String(v).trim()||null;}

export function buildLearningRecord(item, context={}){
  const m=item?.movement||{};
  const d=item?.display||{};
  const n=item?.native||{};
  const p=item?.projection||{};
  const e=item?.environmental||{};

  return {
    ledgerVersion:LEARNING_LEDGER_VERSION,
    recordedAt:new Date().toISOString(),

    identity:{
      logId:item?.logId||clean(n.LogID),
      vessel:clean(d.vessel||n.VesselName),
      callSign:clean(n.CallSign),
      imo:clean(n.IMO),
      pilotUnitNumbers:item?.pilotUnitNumbers||[],
      section:item?.section||null
    },

    scheduleState:{
      direction:d.direction||m?.movement?.direction||clean(n.Direction),
      status:clean(n.Status||d.status),
      orderedAt:iso(m?.schedule?.orderedAt)||clean(n.OrderedTime),
      pbtAt:iso(m?.schedule?.pbtAt)||clean(n.PBT),
      actualStartAt:iso(m?.schedule?.actualStartAt)||clean(n.OffDock),
      berth:clean(d.berth||n.Berth),
      sideTo:clean(n.SideTo),
      remarks:clean(n.Remarks),
      lastChange:clean(n.LastChange)
    },

    vesselState:{
      lengthFt:d.lengthFt??n.Length??null,
      beamFt:d.beamFt??n.Beam??null,
      draftFt:d.draftFt??n.Draft??null,
      dwt:d.dwt??n.DWT??null,
      tugCo:clean(n.TugCo),
      lineHandler:clean(n.LineHandler)
    },

    modelState:{
      projectionOk:p?.ok??null,
      projectionReason:p?.reason||null,
      model:p?.model||null,
      eta36:e?.eta36||null,
      eta60:e?.eta60||null,
      etaICW:e?.etaICW||null,
      vesselFactor:p?.vesselFactor??null,
      environmentalFactor:p?.environmentalFactor??null,
      trafficFactor:p?.trafficFactor??null
    },

    environmentalState:{
      cameronAt36:e?.cameronAt36||null,
      cameronEffect:e?.cameronEffect||null,
      currentWindowModel:"PENDING_38_TO_60_CORRIDOR",
      currentHeuristics:[
        "Inbound current influence becomes meaningful near Beacon 42/end of jetties.",
        "Strongest lower-channel current influence is generally Buoy 38 through Beacon 60.",
        "Cameron reach carries the highest current velocity.",
        "Outbound vessels experience upper-channel residual current; stronger lower-channel current influence becomes significant around 65/66."
      ]
    },

    outcome:{
      actual36:clean(n.C6DateTime),
      actualICWW:clean(n.ICWWDateTime),
      actualOffDock:clean(n.OffDock),
      completed:false,
      delayReason:null,
      humanDecisionNote:null
    },

    learningTags:{
      hardRule:false,
      operationalHeuristic:true,
      learnedPattern:false,
      requiresHumanReview:true
    },

    sourceContext:{
      scheduleSource:context.scheduleSource||"LakeCharlesSQLDataService LIVE",
      environmentSource:context.environmentSource||"NOAA/NWS",
      fetchedAt:context.fetchedAt||null
    }
  };
}

export function buildLedgerBatch(items,context={}){
  return (Array.isArray(items)?items:[]).map(item=>buildLearningRecord(item,context));
}

export function summarizeLedger(records){
  const arr=Array.isArray(records)?records:[];
  return {
    version:LEARNING_LEDGER_VERSION,
    recordCount:arr.length,
    movingCount:arr.filter(r=>r.identity.section==="MOVING").length,
    expectedCount:arr.filter(r=>r.identity.section==="EXPECTED").length,
    arrivingCount:arr.filter(r=>r.identity.section==="ARRIVING").length,
    inPortCount:arr.filter(r=>r.identity.section==="IN_PORT").length,
    recordsWithEnvironmentalIntersection:arr.filter(r=>r.environmentalState.cameronAt36).length
  };
}
