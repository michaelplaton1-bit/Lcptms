export const dynamic="force-dynamic";

import { learningCaptureAuthorized } from "../../../lib/adminAuth.js";
import { writeSnapshot, recentSnapshots, writeLatestLearning, learningStoreConfigured } from "../../../lib/persistentLearningStore.js";
import { analyzeLearning } from "../../../lib/persistentLearningEngine.js";

async function stageFetch(origin,path,name,stages,authorization){
  const started=Date.now();
  try{
    const r=await fetch(`${origin}${path}`,{
      cache:"no-store",
      headers:authorization?{Authorization:authorization}:{}
    });
    const text=await r.text();
    let body=null;
    try{body=JSON.parse(text);}catch{body={raw:text.slice(0,1000)}}
    stages.push({
      name,
      ok:r.ok,
      status:r.status,
      ms:Date.now()-started,
      detail:r.ok?null:(body?.detail||body?.error||body?.raw||`HTTP ${r.status}`)
    });
    if(!r.ok)throw new Error(`${name} failed: ${body?.detail||body?.error||r.status}`);
    return body;
  }catch(e){
    if(!stages.find(s=>s.name===name)){
      stages.push({name,ok:false,status:null,ms:Date.now()-started,detail:e?.message||"unknown error"});
    }
    throw e;
  }
}

async function capture(request){
  const stages=[];

  stages.push({
    name:"authorization",
    ok:learningCaptureAuthorized(request),
    status:null,
    ms:0,
    detail:null
  });
  if(!stages[0].ok){
    return Response.json({
      ok:false,
      error:"Unauthorized",
      diagnosticVersion:"0.2.0",
      stages
    },{status:401,headers:{"Cache-Control":"no-store"}});
  }

  const blobConfigured=learningStoreConfigured();
  stages.push({
    name:"blob_configuration",
    ok:blobConfigured,
    status:null,
    ms:0,
    detail:blobConfigured?null:"BLOB_READ_WRITE_TOKEN is not configured"
  });
  if(!blobConfigured){
    return Response.json({
      ok:false,
      error:"Vercel Blob not configured",
      diagnosticVersion:"0.2.0",
      stages
    },{status:503,headers:{"Cache-Control":"no-store"}});
  }

  const origin=new URL(request.url).origin;
  const authorization=request.headers.get("authorization");
  const capturedAt=new Date().toISOString();

  let schedule,environment,windows,validation,winds;
  try{
    schedule=await stageFetch(origin,"/api/schedule","schedule",stages,authorization);
    environment=await stageFetch(origin,"/api/environment","environment",stages,authorization);
    windows=await stageFetch(origin,"/api/boarding-window-calculator","boarding_window_calculator",stages,authorization);
    validation=await stageFetch(origin,"/api/boarding-window-validation","boarding_window_validation",stages,authorization);
    winds=await stageFetch(origin,"/api/wind-reports","wind_reports",stages,authorization);
  }catch(e){
    return Response.json({
      ok:false,
      error:"Learning capture source stage failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }

  const snapshot={
    schemaVersion:"0.2.0",
    capturedAt,
    scheduleFetchedAt:schedule.fetchedAt||null,
    scheduleItems:schedule.items||[],
    notes:schedule.notes||null,
    environment,
    calculatedWindows:windows,
    windowValidation:validation,
    winds
  };

  try{
    const started=Date.now();
    await writeSnapshot(snapshot);
    stages.push({name:"blob_write_snapshot",ok:true,status:null,ms:Date.now()-started,detail:null});
  }catch(e){
    stages.push({name:"blob_write_snapshot",ok:false,status:null,ms:0,detail:e?.message||"unknown error"});
    return Response.json({
      ok:false,
      error:"Snapshot Blob write failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }

  let history;
  try{
    const started=Date.now();
    history=await recentSnapshots(700);
    stages.push({name:"blob_read_history",ok:true,status:null,ms:Date.now()-started,detail:`${history.length} snapshots loaded`});
  }catch(e){
    stages.push({name:"blob_read_history",ok:false,status:null,ms:0,detail:e?.message||"unknown error"});
    return Response.json({
      ok:false,
      error:"Learning history read failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }

  let analysis;
  try{
    const started=Date.now();
    analysis=analyzeLearning(history);
    stages.push({name:"learning_analysis",ok:true,status:null,ms:Date.now()-started,detail:null});
  }catch(e){
    stages.push({name:"learning_analysis",ok:false,status:null,ms:0,detail:e?.message||"unknown error"});
    return Response.json({
      ok:false,
      error:"Learning analysis failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }

  try{
    const started=Date.now();
    await writeLatestLearning(analysis);
    stages.push({name:"blob_write_analysis",ok:true,status:null,ms:Date.now()-started,detail:null});
  }catch(e){
    stages.push({name:"blob_write_analysis",ok:false,status:null,ms:0,detail:e?.message||"unknown error"});
    return Response.json({
      ok:false,
      error:"Learning analysis Blob write failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }

  return Response.json({
    ok:true,
    diagnosticVersion:"0.2.0",
    capturedAt,
    snapshotCount:analysis.snapshotCount,
    summary:analysis.summary,
    newestActivity:analysis.recentActivity?.slice(0,5)||[],
    stages
  },{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request){
  try{return await capture(request);}
  catch(e){
    return Response.json({
      ok:false,
      error:"Learning capture failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages:[{name:"unhandled_exception",ok:false,detail:e?.stack||e?.message||"unknown error"}]
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}

export async function GET(request){
  try{return await capture(request);}
  catch(e){
    return Response.json({
      ok:false,
      error:"Learning capture failed",
      detail:e?.message||"unknown error",
      diagnosticVersion:"0.2.0",
      stages:[{name:"unhandled_exception",ok:false,detail:e?.stack||e?.message||"unknown error"}]
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
