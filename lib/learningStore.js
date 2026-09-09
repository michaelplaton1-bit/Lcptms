// LCPTMS persistent learning store v0.2
// Uses Vercel Blob so learning survives deployments and overnight cron runs.

import { put, list } from "@vercel/blob";

const PREFIX="lcptms-learning";

export function learningStoreConfigured(){
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function safeStamp(date=new Date()){
  return date.toISOString().replace(/[:.]/g,"-");
}

export async function saveLearningSnapshot(payload){
  if(!learningStoreConfigured()) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  const d=new Date(payload?.capturedAt||Date.now());
  const yyyy=d.getUTCFullYear(), mm=String(d.getUTCMonth()+1).padStart(2,"0"), dd=String(d.getUTCDate()).padStart(2,"0");
  const pathname=`${PREFIX}/snapshots/${yyyy}/${mm}/${dd}/${safeStamp(d)}.json`;
  const blob=await put(pathname,JSON.stringify(payload),{
    access:"private",
    addRandomSuffix:false,
    contentType:"application/json",
    token:process.env.BLOB_READ_WRITE_TOKEN
  });
  return {pathname,url:blob.url};
}

export async function saveFindings(payload){
  if(!learningStoreConfigured()) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  const stamp=safeStamp(new Date(payload?.generatedAt||Date.now()));
  const history=await put(`${PREFIX}/findings/history/${stamp}.json`,JSON.stringify(payload),{
    access:"private",addRandomSuffix:false,contentType:"application/json",token:process.env.BLOB_READ_WRITE_TOKEN
  });
  const latest=await put(`${PREFIX}/findings/latest.json`,JSON.stringify(payload),{
    access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"application/json",token:process.env.BLOB_READ_WRITE_TOKEN
  });
  return {latest:latest.url,history:history.url};
}

async function fetchPrivate(url){
  const r=await fetch(url,{
    cache:"no-store",
    headers:{Authorization:`Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`}
  });
  if(!r.ok)throw new Error(`Blob read failed ${r.status}`);
  return r.json();
}

export async function recentSnapshots({limit=72}={}){
  if(!learningStoreConfigured()) return [];
  const result=await list({
    prefix:`${PREFIX}/snapshots/`,
    limit:Math.min(Math.max(limit,1),1000),
    token:process.env.BLOB_READ_WRITE_TOKEN
  });
  const blobs=(result.blobs||[]).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).slice(0,limit);
  const out=[];
  for(const b of blobs){
    try{out.push(await fetchPrivate(b.url));}catch{}
  }
  return out.sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt));
}

export async function latestFindings(){
  if(!learningStoreConfigured()) return null;
  const result=await list({
    prefix:`${PREFIX}/findings/latest.json`,
    limit:5,
    token:process.env.BLOB_READ_WRITE_TOKEN
  });
  const b=(result.blobs||[])[0];
  if(!b)return null;
  try{return await fetchPrivate(b.url);}catch{return null;}
}
