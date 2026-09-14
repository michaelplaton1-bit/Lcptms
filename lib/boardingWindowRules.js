// LCPTMS Boarding Window Rules v0.1
// Human-supplied operational parameters. These are not autonomous go/no-go decisions.
// Third-party official OPEN/CLOSE sets remain authoritative until LCPTMS calculation is validated.

export const BOARDING_WINDOW_RULES_VERSION="0.1.0";

export const BOARDING_WINDOW_RULES = [
  {
    id:"INBOUND_DEEP_DRAFT",
    label:"Inbound Deep Draft",
    direction:"INBOUND",
    applies:"Inbound vessels ≥750 ft LOA and >36 ft draft. Commonly P66/CR or CS/CR; may include deep-draft bulkers to BT1-O / BT1-N.",
    source:"Jim Mays / COE parameters",
    currentStation:"Calcasieu Pass",
    openRule:"OPEN 2 hr before slack-before-flood at Calcasieu Pass.",
    closeRule:"CLOSE 3.5 hr before ebb current becomes >1.0 kt.",
    thresholds:{ebbKt:1.0,openLeadHours:2,closeLeadHours:3.5}
  },
  {
    id:"CLNG_OUTBOUND_LE_38",
    label:"Outbound Cameron LNG ≤38′",
    direction:"OUTBOUND",
    applies:"Outbound Cameron LNG vessels at draft up to and including 38 ft.",
    source:"CLNG parameters",
    currentStation:"Calcasieu Pass",
    openRule:"OPEN 2.5 hr before flood current is ≤1.5 kt.",
    closeRule:"CLOSE 3.5 hr before flood current becomes >1.5 kt.",
    thresholds:{floodKt:1.5,openLeadHours:2.5,closeLeadHours:3.5}
  },
  {
    id:"CLNG_OUTBOUND_GT_38",
    label:"Outbound Cameron LNG >38′",
    direction:"OUTBOUND",
    applies:"Outbound Cameron LNG vessels above 38 ft draft.",
    source:"CLNG parameters",
    currentStation:"Calcasieu Pass",
    openRule:"OPEN 2.5 hr before flood current is ≤1.0 kt.",
    closeRule:"CLOSE 3.5 hr before flood current becomes >1.0 kt.",
    thresholds:{floodKt:1.0,openLeadHours:2.5,closeLeadHours:3.5}
  },
  {
    id:"VG_INBOUND",
    label:"Inbound Venture Global LNG",
    direction:"INBOUND",
    applies:"Inbound Venture Global LNG vessels (typically light draft ~30–32 ft).",
    source:"VG parameters",
    currentStation:"Calcasieu Pass",
    openRule:"EBB: OPEN 3 hr before ebb reaches 1.5 kt and decreasing. FLOOD: OPEN 2 hr before flood reaches 1.5 kt and decreasing.",
    closeRule:"EBB/FLOOD: CLOSE 3 hr before current reaches 1.5 kt and increasing.",
    thresholds:{currentKt:1.5,ebbOpenLeadHours:3,floodOpenLeadHours:2,closeLeadHours:3}
  },
  {
    id:"VG_OUTBOUND",
    label:"Outbound Venture Global LNG",
    direction:"OUTBOUND",
    applies:"Outbound Venture Global LNG vessels (typically loaded ~37–38 ft).",
    source:"VG parameters",
    currentStation:"Calcasieu Pass",
    openRule:"OPEN 30 min before ebb or flood reaches 1.5 kt and decreasing.",
    closeRule:"CLOSE 90 min before ebb or flood reaches 1.5 kt and increasing.",
    thresholds:{currentKt:1.5,openLeadMinutes:30,closeLeadMinutes:90}
  }
];

function num(v){
  if(v===null||v===undefined||v==="")return null;
  const m=String(v).match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function upper(v){return String(v||"").trim().toUpperCase();}
function direction(item){
  const v=upper(item?.display?.direction||item?.native?.Direction);
  if(v.includes("IN"))return "INBOUND";
  if(v.includes("OUT"))return "OUTBOUND";
  return v;
}
function berth(item){return upper(item?.display?.berth||item?.native?.Berth);}
function lengthFt(item){return num(item?.native?.Length??item?.display?.lengthFt);}
function draftFt(item){return num(item?.native?.Draft??item?.display?.draftFt);}

export function classifyBoardingWindow(item){
  const dir=direction(item), b=berth(item), loa=lengthFt(item), draft=draftFt(item);

  if(dir==="INBOUND" && loa!==null && loa>=750 && draft!==null && draft>36){
    return "INBOUND_DEEP_DRAFT";
  }

  if(b.startsWith("CLNG") && dir==="OUTBOUND" && draft!==null){
    return draft<=38 ? "CLNG_OUTBOUND_LE_38" : "CLNG_OUTBOUND_GT_38";
  }

  if((b.startsWith("VG-")||b==="VG") && dir==="INBOUND") return "VG_INBOUND";
  if((b.startsWith("VG-")||b==="VG") && dir==="OUTBOUND") return "VG_OUTBOUND";

  return null;
}

export function buildBoardingWindowState(items=[]){
  const applied=(Array.isArray(items)?items:[]).map(item=>{
    const ruleId=classifyBoardingWindow(item);
    if(!ruleId)return null;
    const rule=BOARDING_WINDOW_RULES.find(r=>r.id===ruleId);
    return {
      logId:item?.logId||null,
      vessel:item?.display?.vessel||item?.native?.VesselName||null,
      berth:item?.display?.berth||item?.native?.Berth||null,
      direction:direction(item),
      draftFt:draftFt(item),
      lengthFt:lengthFt(item),
      ruleId,
      ruleLabel:rule?.label||ruleId,
      section:item?.section||null,
      underway:item?.section==="MOVING"
    };
  }).filter(Boolean);

  return {
    rulesVersion:BOARDING_WINDOW_RULES_VERSION,
    authority:"PARAMETER MODEL — THIRD-PARTY OFFICIAL OPEN/CLOSE SET REMAINS AUTHORITATIVE",
    calculationStatus:"PARAMETERS_LOADED_CALCULATION_PENDING_VALIDATION",
    rules:BOARDING_WINDOW_RULES,
    applied
  };
}
