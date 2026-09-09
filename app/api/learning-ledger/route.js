export const dynamic="force-dynamic";

import { buildLedgerBatch, summarizeLedger } from "../../../lib/operationalLearningLedger.js";

export async function GET(request){
  try{
    const origin=new URL(request.url).origin;
    const scheduleRes=await fetch(`${origin}/api/schedule`,{cache:"no-store"});
    const schedule=await scheduleRes.json();

    if(!scheduleRes.ok){
      return Response.json({error:"Unable to load schedule for ledger",detail:schedule?.detail||schedule?.error},{status:500});
    }

    const records=buildLedgerBatch(schedule.items||[],{
      scheduleSource:schedule.source,
      fetchedAt:schedule.fetchedAt,
      environmentSource:schedule.environmentConnected?"NOAA/NWS LIVE":"UNAVAILABLE"
    });

    return Response.json({
      schemaVersion:"0.1.0",
      summary:summarizeLedger(records),
      records
    },{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({error:"Operational learning ledger failed",detail:e?.message||"unknown error"},{status:500});
  }
}
