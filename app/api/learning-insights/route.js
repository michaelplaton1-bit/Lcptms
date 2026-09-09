export const dynamic="force-dynamic";

import { buildLedgerBatch, summarizeLedger } from "../../../lib/operationalLearningLedger.js";
import { HISTORICAL_SUMMARY } from "../../../lib/historicalCalibration.js";

function finding(id,type,status,confidence,title,detail,suggestion,meta={}){
  return {id,type,status,confidence,title,detail,suggestion,...meta};
}

export async function GET(request){
  try{
    const origin=new URL(request.url).origin;
    const scheduleRes=await fetch(`${origin}/api/schedule`,{cache:"no-store"});
    const schedule=await scheduleRes.json();
    if(!scheduleRes.ok) throw new Error(schedule?.detail||schedule?.error||"schedule unavailable");

    const records=buildLedgerBatch(schedule.items||[],{
      scheduleSource:schedule.source,
      fetchedAt:schedule.fetchedAt,
      environmentSource:schedule.environmentConnected?"NOAA/NWS LIVE":"UNAVAILABLE"
    });

    const findings=[];

    // Historical calibration findings already derived from the movement spreadsheet.
    const sched=HISTORICAL_SUMMARY?.schedule_variance;
    if(sched?.n>=10){
      findings.push(finding(
        "hist-schedule-variance",
        "HISTORICAL_CALIBRATION",
        "ESTABLISHED_OBSERVATION",
        "MODERATE",
        "Scheduled job times commonly shift before actual movement",
        `Historical sample median JOB TIME → POB/LAST LINE variance is ${sched.median_min} minutes across ${sched.n} usable movements.`,
        "Keep PBT as the primary planning time when available; continue comparing future actual starts against PBT rather than Ordered."
      ));
    }

    const inbound=HISTORICAL_SUMMARY?.actual_start_to_36_inbound;
    if(inbound?.n>=10){
      findings.push(finding(
        "hist-inbound-36",
        "ETA_CALIBRATION",
        "ESTABLISHED_OBSERVATION",
        "MODERATE",
        "Inbound start-to-36 baseline is measurable",
        `Historical inbound actual start → 36 median is ${inbound.median_min} minutes across ${inbound.n} usable movements.`,
        "Use this as a calibration reference only; do not replace berth/geographic ETA logic with a universal constant."
      ));
    }

    // Current operational observations.
    const moving=records.filter(r=>r.identity.section==="MOVING");
    const expected=records.filter(r=>r.identity.section==="EXPECTED");
    const envLinked=records.filter(r=>r.environmentalState?.cameronAt36);

    if(moving.length){
      findings.push(finding(
        "current-moving",
        "CURRENT_TRAFFIC_STATE",
        "OBSERVATION",
        "LIVE",
        `${moving.length} vessel${moving.length===1?"":"s"} currently moving within the VTIS`,
        "These are the only movements treated as UNDERWAY in LCPTMS.",
        "Keep underway status tied strictly to the LCP MOVING section."
      ));
    }

    if(envLinked.length){
      findings.push(finding(
        "current-env-intersections",
        "ENVIRONMENTAL_INTERSECTION",
        "OBSERVATION",
        "LIVE",
        `${envLinked.length} live movement${envLinked.length===1?"":"s"} currently have a Cameron-current ETA intersection`,
        "The system is matching vessel ETA timing to Cameron harmonic-current predictions while keeping 36 Buoy cross-current live-only.",
        "Continue learning the 38→60 current corridor before introducing automatic ETA corrections."
      ));
    }

    const opposing=records.filter(r=>r.environmentalState?.cameronEffect==="OPPOSING");
    if(opposing.length){
      findings.push(finding(
        "current-opposing",
        "ENVIRONMENTAL_STATE",
        "OBSERVATION",
        "LIVE",
        `${opposing.length} movement${opposing.length===1?"":"s"} currently intersect opposing Cameron current`,
        opposing.map(r=>r.identity.vessel).filter(Boolean).slice(0,6).join(", "),
        "Treat this as context only. Do not modify transit timing until repeated completed movements support a correction."
      ));
    }

    // Human-supplied operational heuristics.
    const heuristics=[
      {
        title:"Lower-channel current corridor",
        detail:"Strongest longitudinal current influence is generally Buoy 38 through Beacon 60, with the Cameron reach carrying the greatest velocity."
      },
      {
        title:"Inbound current onset",
        detail:"Inbound vessels do not meaningfully feel the lower-channel current until approximately Beacon 42 / end of the jetties."
      },
      {
        title:"Outbound current transition",
        detail:"Outbound vessels experience upper-channel residual current, but the stronger lower-channel current influence becomes significant around Beacons 65/66."
      },
      {
        title:"Notice baseline",
        detail:"Typical notice baseline is 2 hours outbound and 4 hours inbound, subject to berth, traffic, tide/current, tug, and pilot-discretion constraints."
      }
    ];

    return Response.json({
      schemaVersion:"1.4.0-ai-insights-only",
      generatedAt:new Date().toISOString(),
      persistent:false,
      note:"Insights are generated from the current live ledger plus existing historical calibration. No off-site storage or overnight persistence is enabled in this build.",
      summary:{
        liveRecords:records.length,
        moving:moving.length,
        expected:expected.length,
        environmentalIntersections:envLinked.length,
        findings:findings.length
      },
      ledgerSummary:summarizeLedger(records),
      findings,
      heuristics
    },{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      schemaVersion:"1.4.0-ai-insights-only",
      error:"AI Insights unavailable",
      detail:e?.message||"unknown error"
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
