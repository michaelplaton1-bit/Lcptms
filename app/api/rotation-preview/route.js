export const dynamic="force-dynamic";

import { rotationSnapshot } from "../../../lib/rotationModel.js";

export async function GET(request){
  try{
    const origin=new URL(request.url).origin;
    const r=await fetch(`${origin}/api/schedule`,{cache:"no-store"});
    const schedule=await r.json();
    if(!r.ok) throw new Error(schedule?.detail||schedule?.error||"schedule unavailable");

    return Response.json({
      schemaVersion:"0.1.0",
      source:schedule.source,
      fetchedAt:schedule.fetchedAt,
      ...rotationSnapshot(schedule.items||[])
    },{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      schemaVersion:"0.1.0",
      error:"Rotation preview unavailable",
      detail:e?.message||"unknown error"
    },{status:500});
  }
}
