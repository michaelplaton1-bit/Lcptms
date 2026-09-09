// LCPTMS Operational Learning & Findings Engine v0.2
// Produces reviewable findings; never modifies hard operating rules automatically.

export const FINDINGS_ENGINE_VERSION="0.2.0";

function median(a){
  const x=a.filter(Number.isFinite).sort((p,q)=>p-q);
  if(!x.length)return null;
  const m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
}
function mean(a){
  const x=a.filter(Number.isFinite);
  return x.length?x.reduce((s,v)=>s+v,0)/x.length:null;
}
function localEpoch(v, capturedAt){
  if(v===null||v===undefined||v==="")return null;
  const s=String(v).trim();
  const direct=new Date(s);
  if(Number.isFinite(direct.getTime()))return direct.getTime();

  const short=s.match(/^(\d{1,2})\/(\d{2})(\d{2})$/);
  if(short){
    const base=new Date(capturedAt||Date.now());
    const y=base.getUTCFullYear(), mo=base.getUTCMonth();
    // Treat supplied day/time as America/Chicago approximately by constructing
    // a noon-safe candidate and resolving offset with Intl.
    const naive=Date.UTC(y,mo,+short[1],+short[2],+short[3]);
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(naive));
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    const rendered=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
    return naive-(rendered-naive);
  }
  return null;
}
function confidence(n){
  if(n>=20)return "HIGH";
  if(n>=10)return "MODERATE";
  if(n>=5)return "DEVELOPING";
  return "EMERGING";
}
function priority(effect,n){
  const a=Math.abs(effect||0);
  if(n>=10&&a>=15)return "RECOMMENDED_CHANGE";
  if(n>=5&&a>=10)return "CANDIDATE_FINDING";
  return "OBSERVATION";
}

function currentBand(r){
  const x=r?.environmentalState?.cameronAt36;
  const speed=Number(x?.speed??x?.velocityMajor??x?.valueKt);
  const effect=r?.environmentalState?.cameronEffect||"UNKNOWN";
  if(!Number.isFinite(speed))return null;
  return `${effect}:${speed<0.4?"LOW":speed<0.8?"MODERATE":"STRONG"}`;
}

export function deriveFindings(snapshots){
  const snaps=(Array.isArray(snapshots)?snapshots:[]).filter(Boolean);
  const records=snaps.flatMap(s=>(s.records||[]).map(r=>({...r,__capturedAt:s.capturedAt})));
  const findings=[];

  // One record per LogID per snapshot, then pair earliest modeled ETA with later actual.
  const byLog=new Map();
  for(const r of records){
    const id=r?.identity?.logId;
    if(!id)continue;
    if(!byLog.has(id))byLog.set(id,[]);
    byLog.get(id).push(r);
  }

  const eta36Errors=[];
  const eta36ByBerthDir=new Map();
  const eta36ByCurrent=new Map();

  for(const [logId,rows] of byLog){
    rows.sort((a,b)=>new Date(a.__capturedAt)-new Date(b.__capturedAt));
    const modeled=rows.find(r=>r?.modelState?.eta36);
    const actualRow=[...rows].reverse().find(r=>r?.outcome?.actual36);
    if(!modeled||!actualRow)continue;

    const pred=localEpoch(modeled.modelState.eta36,modeled.__capturedAt);
    const act=localEpoch(actualRow.outcome.actual36,actualRow.__capturedAt);
    if(!Number.isFinite(pred)||!Number.isFinite(act))continue;

    const err=(act-pred)/60000;
    if(Math.abs(err)>240)continue;
    eta36Errors.push(err);

    const berth=modeled?.scheduleState?.berth||"UNKNOWN";
    const dir=modeled?.scheduleState?.direction||"UNKNOWN";
    const key=`${dir}|${berth}`;
    if(!eta36ByBerthDir.has(key))eta36ByBerthDir.set(key,[]);
    eta36ByBerthDir.get(key).push(err);

    const cb=currentBand(modeled);
    if(cb){
      if(!eta36ByCurrent.has(cb))eta36ByCurrent.set(cb,[]);
      eta36ByCurrent.get(cb).push(err);
    }
  }

  for(const [key,errs] of eta36ByBerthDir){
    if(errs.length<3)continue;
    const med=median(errs), avg=mean(errs), [direction,berth]=key.split("|");
    findings.push({
      findingId:`ETA36-${direction}-${berth}`.replace(/[^A-Z0-9_-]/gi,"_"),
      type:"ETA_CALIBRATION",
      status:priority(med,errs.length),
      confidence:confidence(errs.length),
      sampleSize:errs.length,
      scope:{direction,berth,waypoint:"36_BUOY"},
      observedEffect:{
        medianErrorMinutes:+med.toFixed(1),
        meanErrorMinutes:+avg.toFixed(1),
        interpretation:med>0?"MODEL_EARLY":"MODEL_LATE"
      },
      suggestion:Math.abs(med)>=10
        ? `Review ${direction} ${berth} -> 36 ETA baseline; observed median error is ${Math.abs(med).toFixed(0)} min ${med>0?"late versus model":"early versus model"}.`
        : "Keep learning; current ETA error is within the provisional review band.",
      automaticChangeAllowed:false
    });
  }

  // Schedule revisions: same LogID with different PBT values over snapshots.
  const pbtChanges=[];
  for(const [logId,rows] of byLog){
    const vals=[];
    for(const r of rows){
      const t=localEpoch(r?.scheduleState?.pbtAt,r.__capturedAt);
      if(Number.isFinite(t))vals.push(t);
    }
    const uniq=[...new Set(vals)];
    if(uniq.length>=2){
      pbtChanges.push((Math.max(...uniq)-Math.min(...uniq))/60000);
    }
  }
  if(pbtChanges.length>=3){
    const med=median(pbtChanges);
    findings.push({
      findingId:"PBT-REVISION-PATTERN",
      type:"SCHEDULE_BEHAVIOR",
      status:"OBSERVATION",
      confidence:confidence(pbtChanges.length),
      sampleSize:pbtChanges.length,
      observedEffect:{medianRevisionMinutes:+med.toFixed(1)},
      suggestion:"Continue tracking how often PBT moves and which traffic/environmental states precede revisions.",
      automaticChangeAllowed:false
    });
  }

  // Current regime correlation (only after multiple completed samples).
  for(const [band,errs] of eta36ByCurrent){
    if(errs.length<5)continue;
    const med=median(errs);
    findings.push({
      findingId:`CURRENT-${band}`.replace(/[^A-Z0-9_-]/gi,"_"),
      type:"ENVIRONMENTAL_CORRELATION",
      status:priority(med,errs.length),
      confidence:confidence(errs.length),
      sampleSize:errs.length,
      scope:{currentBand:band,waypoint:"36_BUOY"},
      observedEffect:{medianEtaErrorMinutes:+med.toFixed(1)},
      suggestion:Math.abs(med)>=10
        ? `Review whether the ETA engine needs a location-dependent current correction for ${band}.`
        : "Current regime does not yet show a material ETA bias.",
      automaticChangeAllowed:false
    });
  }


  const observationWindowStart=snaps.length ? snaps[0]?.capturedAt || null : null;
  const observationWindowEnd=snaps.length ? snaps[snaps.length-1]?.capturedAt || null : null;

  for(const f of findings){
    f.firstObservedAt=observationWindowStart;
    f.lastObservedAt=observationWindowEnd;
    f.generatedAt=new Date().toISOString();
  }

  findings.sort((a,b)=>{
    const rank={RECOMMENDED_CHANGE:0,CANDIDATE_FINDING:1,OBSERVATION:2};
    return (rank[a.status]??9)-(rank[b.status]??9) || b.sampleSize-a.sampleSize;
  });

  return {
    engineVersion:FINDINGS_ENGINE_VERSION,
    generatedAt:new Date().toISOString(),
    snapshotCount:snaps.length,
    completedEta36Comparisons:eta36Errors.length,
    summary:{
      recommendedChanges:findings.filter(x=>x.status==="RECOMMENDED_CHANGE").length,
      candidateFindings:findings.filter(x=>x.status==="CANDIDATE_FINDING").length,
      observations:findings.filter(x=>x.status==="OBSERVATION").length
    },
    findings
  };
}
