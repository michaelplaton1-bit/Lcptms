export const PERSISTENT_LEARNING_VERSION="0.1.0";

function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}
function avg(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null;}
function median(a){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;}
function mae(a){const x=a.filter(Number.isFinite).map(Math.abs);return avg(x);}
function confidence(n){return n>=25?"HIGH":n>=12?"MODERATE":n>=5?"DEVELOPING":"EMERGING";}
function value(item,...paths){
  for(const path of paths){
    let x=item;
    for(const k of path.split("."))x=x?.[k];
    if(x!==null&&x!==undefined&&x!=="")return x;
  }
  return null;
}
function jobId(item){
  return String(value(item,"logId","native.LogID")||"");
}
function vessel(item){return String(value(item,"display.vessel","native.VesselName")||"UNKNOWN");}
function state(item){
  return {
    logId:jobId(item),
    vessel:vessel(item),
    section:item?.section||null,
    direction:value(item,"display.direction","native.Direction"),
    berth:value(item,"display.berth","native.Berth"),
    ordered:value(item,"movement.schedule.orderedAt","native.OrderedTime"),
    pbt:value(item,"movement.schedule.pbtAt","native.PBT"),
    pilotUnits:item?.pilotUnitNumbers||[],
    draft:value(item,"display.draftFt","native.Draft"),
    length:value(item,"display.lengthFt","native.Length"),
    beam:value(item,"display.beamFt","native.Beam"),
    eta36:value(item,"display.eta36","movement.prediction.eta36"),
    eta60:value(item,"display.eta60","movement.prediction.eta60"),
    etaICW:value(item,"display.etaICW","movement.prediction.etaICW"),
    actual36:value(item,"native.36","native.At36","native.Time36"),
    actualICW:value(item,"native.ICWW","native.ICW","native.AtICW"),
    offDock:value(item,"native.OffDock","native.Off Dock","native.OffDockTime")
  };
}
function changed(a,b,key){
  const av=JSON.stringify(a?.[key]??null),bv=JSON.stringify(b?.[key]??null);
  return av!==bv;
}
function latestActivity(snaps){
  if(snaps.length<2)return [];
  const prev=snaps[snaps.length-2],cur=snaps[snaps.length-1];
  const pa=new Map((prev.scheduleItems||[]).map(x=>[jobId(x),state(x)]).filter(([k])=>k));
  const ca=new Map((cur.scheduleItems||[]).map(x=>[jobId(x),state(x)]).filter(([k])=>k));
  const out=[];
  for(const [id,c] of ca){
    const p=pa.get(id);
    if(!p){
      out.push({type:"NEW_JOB",logId:id,vessel:c.vessel,at:cur.capturedAt,detail:`${c.vessel} appeared in ${c.section||"schedule"}${c.berth?` for ${c.berth}`:""}.`});
      continue;
    }
    if(changed(p,c,"pbt"))out.push({type:"PBT_CHANGE",logId:id,vessel:c.vessel,at:cur.capturedAt,detail:`${c.vessel} PBT changed from ${p.pbt||"—"} to ${c.pbt||"—"}.`});
    if(changed(p,c,"section"))out.push({type:"SECTION_CHANGE",logId:id,vessel:c.vessel,at:cur.capturedAt,detail:`${c.vessel} moved from ${p.section||"—"} to ${c.section||"—"}.`});
    if(changed(p,c,"pilotUnits"))out.push({type:"PILOT_CHANGE",logId:id,vessel:c.vessel,at:cur.capturedAt,detail:`${c.vessel} pilot assignment changed from ${(p.pilotUnits||[]).join(", ")||"—"} to ${(c.pilotUnits||[]).join(", ")||"—"}.`});
    if(changed(p,c,"berth"))out.push({type:"BERTH_CHANGE",logId:id,vessel:c.vessel,at:cur.capturedAt,detail:`${c.vessel} berth changed from ${p.berth||"—"} to ${c.berth||"—"}.`});
  }
  for(const [id,p] of pa){
    if(!ca.has(id))out.push({type:"JOB_REMOVED",logId:id,vessel:p.vessel,at:cur.capturedAt,detail:`${p.vessel} left the current live schedule set.`});
  }
  return out.slice(-30).reverse();
}
function scheduleFindings(snaps){
  const jobs=new Map();
  for(const snap of snaps){
    for(const item of snap.scheduleItems||[]){
      const id=jobId(item); if(!id)continue;
      if(!jobs.has(id))jobs.set(id,[]);
      jobs.get(id).push({at:snap.capturedAt,...state(item)});
    }
  }
  let pbtRevisionJobs=0;
  const pbtMoves=[];
  const routeCounts=new Map();
  for(const rows of jobs.values()){
    const uniqPbt=[...new Set(rows.map(r=>String(r.pbt||"")).filter(Boolean))];
    if(uniqPbt.length>1){
      pbtRevisionJobs++;
      const times=uniqPbt.map(v=>new Date(v).getTime()).filter(Number.isFinite);
      if(times.length>1)pbtMoves.push((Math.max(...times)-Math.min(...times))/60000);
    }
    const r=rows[rows.length-1];
    const key=`${r.direction||"?"}|${r.berth||"?"}`;
    routeCounts.set(key,(routeCounts.get(key)||0)+1);
  }
  const topRoutes=[...routeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([key,count])=>{
    const [direction,berth]=key.split("|");return {direction,berth,count};
  });
  const findings=[];
  if(pbtRevisionJobs){
    findings.push({
      id:"PBT-REVISION-BEHAVIOR",type:"SCHEDULE_BEHAVIOR",
      confidence:confidence(pbtRevisionJobs),sampleSize:pbtRevisionJobs,
      title:"PBT revisions are being observed",
      detail:`${pbtRevisionJobs} unique jobs have shown more than one PBT in the stored learning history${pbtMoves.length?`; median observed PBT swing is ${median(pbtMoves).toFixed(0)} minutes`:""}.`,
      suggestion:"Treat Ordered and PBT as separate planning signals; preserve every PBT revision and learn the traffic/cargo/pilot-discretion conditions preceding each change."
    });
  }
  if(topRoutes.length){
    const r=topRoutes[0];
    findings.push({
      id:"ROUTE-PATTERN",type:"TRAFFIC_PATTERN",confidence:confidence(r.count),sampleSize:r.count,
      title:"Recurring berth/direction patterns are accumulating",
      detail:`Most frequently observed unique-job route in the current history is ${r.direction} → ${r.berth} (${r.count} jobs).`,
      suggestion:"Continue collecting unique completed jobs before promoting recurring berth setup patterns into planning logic.",
      data:{topRoutes}
    });
  }
  return {jobsObserved:jobs.size,pbtRevisionJobs,topRoutes,findings};
}
function validationRows(snaps){
  const dedupe=new Map();
  for(const s of snaps){
    for(const cat of s?.windowValidation?.comparisons||[]){
      for(const row of cat.rows||[]){
        if(!row.official)continue;
        const key=`${cat.id}|${row.official.open}|${row.official.close}`;
        dedupe.set(key,{categoryId:cat.id,label:cat.label,capturedAt:s.capturedAt,...row});
      }
    }
  }
  return [...dedupe.values()];
}
function windowLearning(snaps){
  const rows=validationRows(snaps);
  const groups=new Map();
  for(const r of rows){
    if(!groups.has(r.categoryId))groups.set(r.categoryId,[]);
    groups.get(r.categoryId).push(r);
  }
  const categories=[];
  const findings=[];
  for(const [id,rs] of groups){
    const rawOpen=rs.map(r=>n(r.rawErrorMinutes?.open));
    const rawClose=rs.map(r=>n(r.rawErrorMinutes?.close));
    const adjOpen=rs.map(r=>n(r.adjustedErrorMinutes?.open));
    const adjClose=rs.map(r=>n(r.adjustedErrorMinutes?.close));
    const rawMae=mae([...rawOpen,...rawClose]);
    const adjMae=mae([...adjOpen,...adjClose]);
    const improvement=(rawMae!==null&&adjMae!==null)?rawMae-adjMae:null;
    const latest=rs.sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt)).at(-1);
    const item={
      id,label:latest?.label||id,sampleSize:rs.length,
      confidence:confidence(rs.length),
      rawMAEminutes:rawMae!==null?+rawMae.toFixed(1):null,
      adjustedMAEminutes:adjMae!==null?+adjMae.toFixed(1):null,
      adjustmentImprovementMinutes:improvement!==null?+improvement.toFixed(1):null,
      latest:{
        official:latest?.official||null,raw:latest?.raw||null,biasAdjusted:latest?.biasAdjusted||null,
        rawErrorMinutes:latest?.rawErrorMinutes||null,adjustedErrorMinutes:latest?.adjustedErrorMinutes||null,
        capturedAt:latest?.capturedAt||null
      }
    };
    categories.push(item);
    if(rs.length>=2){
      const better=improvement!==null&&improvement>0.5;
      findings.push({
        id:`WINDOW-${id}`,type:"WINDOW_ACCURACY",confidence:item.confidence,sampleSize:rs.length,
        title:`${item.label}: ${better?"bias correction is improving accuracy":"window accuracy under review"}`,
        detail:`Across ${rs.length} official windows, raw mean absolute error is ${item.rawMAEminutes??"—"} min and bias-adjusted error is ${item.adjustedMAEminutes??"—"} min${improvement!==null?` (${improvement>=0?improvement.toFixed(1)+" min better":Math.abs(improvement).toFixed(1)+" min worse"})`:""}.`,
        suggestion:better
          ?"Keep collecting cycles; the live actual-vs-predicted current correction is showing measurable improvement."
          :"Do not strengthen the bias correction yet. Continue comparing actual current/tide residuals against official OPEN/CLOSE times.",
        data:item
      });
    }
  }
  return {officialWindowsCompared:rows.length,categories,findings};
}
export function analyzeLearning(snapshots){
  const snaps=(snapshots||[]).filter(Boolean);
  const sched=scheduleFindings(snaps);
  const windows=windowLearning(snaps);
  const activity=latestActivity(snaps);
  const findings=[...windows.findings,...sched.findings];
  return {
    engineVersion:PERSISTENT_LEARNING_VERSION,
    generatedAt:new Date().toISOString(),
    snapshotCount:snaps.length,
    firstSnapshotAt:snaps[0]?.capturedAt||null,
    lastSnapshotAt:snaps.at(-1)?.capturedAt||null,
    summary:{
      uniqueJobsObserved:sched.jobsObserved,
      pbtRevisionJobs:sched.pbtRevisionJobs,
      officialWindowsCompared:windows.officialWindowsCompared,
      findings:findings.length
    },
    recentActivity:activity,
    windowAccuracy:windows,
    trafficPatterns:{topRoutes:sched.topRoutes},
    findings
  };
}
