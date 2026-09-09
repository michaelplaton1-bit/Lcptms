export const dynamic="force-dynamic";

import { buildLedgerBatch, summarizeLedger } from "../../../lib/operationalLearningLedger.js";
import { saveLearningSnapshot, recentSnapshots, saveFindings, learningStoreConfigured } from "../../../lib/learningStore.js";
import { deriveFindings } from "../../../lib/learningFindings.js";

function cronAuthorized(request){
  const secret=process.env.CRON_SECRET;
  if(!secret)return true;
  return request.headers.get("authorization")===`Bearer ${secret}`;
}

export async function GET(request){
  if(!cronAuthorized(request)){
    return Response.json({error:"Unauthorized"},{status:401});
  }

  try{
    const origin=new URL(request.url).origin;
    const scheduleRes=await fetch(`${origin}/api/schedule`,{cache:"no-store"});
    const schedule=await scheduleRes.json();
    if(!scheduleRes.ok)throw new Error(schedule?.detail||schedule?.error||"schedule unavailable");

    const capturedAt=new Date().toISOString();
    const records=buildLedgerBatch(schedule.items||[],{
      scheduleSource:schedule.source,
      fetchedAt:schedule.fetchedAt,
      environmentSource:schedule.environmentConnected?"NOAA/NWS LIVE":"UNAVAILABLE"
    });

    const snapshot={
      schemaVersion:"0.2.0",
      capturedAt,
      scheduleFetchedAt:schedule.fetchedAt,
      summary:summarizeLedger(records),
      records
    };

    if(!learningStoreConfigured()){
      return Response.json({
        ok:false,
        persistent:false,
        message:"Learning snapshot generated but Vercel Blob is not configured.",
        snapshotSummary:snapshot.summary
      },{status:503});
    }

    await saveLearningSnapshot(snapshot);
    const history=await recentSnapshots({limit:96});
    const findings=deriveFindings(history);
    await saveFindings(findings);

    return Response.json({
      ok:true,
      persistent:true,
      capturedAt,
      snapshotSummary:snapshot.summary,
      findingsSummary:findings.summary,
      snapshotsAnalyzed:findings.snapshotCount
    },{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    return Response.json({error:"Learning snapshot failed",detail:e?.message||"unknown error"},{status:500});
  }
}
