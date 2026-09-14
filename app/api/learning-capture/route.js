export const dynamic="force-dynamic";

import { learningCaptureAuthorized } from "../../../lib/adminAuth.js";
import { writeSnapshot, recentSnapshots, writeLatestLearning, learningStoreConfigured } from "../../../lib/persistentLearningStore.js";
import { analyzeLearning } from "../../../lib/persistentLearningEngine.js";

async function get(origin,path){
  const r=await fetch(`${origin}${path}`,{cache:"no-store"});
  const j=await r.json();
  if(!r.ok)throw new Error(`${path}: ${j?.detail||j?.error||r.status}`);
  return j;
}
async function capture(request){
  if(!learningCaptureAuthorized(request))return Response.json({error:"Unauthorized"},{status:401});
  if(!learningStoreConfigured())return Response.json({error:"Vercel Blob not configured"},{status:503});

  const origin=new URL(request.url).origin;
  const capturedAt=new Date().toISOString();
  const [schedule,environment,windows,validation,winds]=await Promise.all([
    get(origin,"/api/schedule"),
    get(origin,"/api/environment"),
    get(origin,"/api/boarding-window-calculator"),
    get(origin,"/api/boarding-window-validation"),
    get(origin,"/api/wind-reports")
  ]);

  const snapshot={
    schemaVersion:"0.1.0",
    capturedAt,
    scheduleFetchedAt:schedule.fetchedAt||null,
    scheduleItems:schedule.items||[],
    notes:schedule.notes||null,
    environment,
    calculatedWindows:windows,
    windowValidation:validation,
    winds
  };
  await writeSnapshot(snapshot);
  const history=await recentSnapshots(700);
  const analysis=analyzeLearning(history);
  await writeLatestLearning(analysis);

  return Response.json({
    ok:true,capturedAt,snapshotCount:analysis.snapshotCount,
    summary:analysis.summary,
    newestActivity:analysis.recentActivity?.slice(0,5)||[]
  },{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request){try{return await capture(request);}catch(e){return Response.json({error:"Learning capture failed",detail:e?.message||"unknown error"},{status:500});}}
export async function GET(request){try{return await capture(request);}catch(e){return Response.json({error:"Learning capture failed",detail:e?.message||"unknown error"},{status:500});}}
