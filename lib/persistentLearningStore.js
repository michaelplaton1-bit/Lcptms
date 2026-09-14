import { put, list } from "@vercel/blob";

const ROOT="lcptms-learning-v1";

export function learningStoreConfigured(){
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
function token(){return process.env.BLOB_READ_WRITE_TOKEN;}
function safeStamp(v){
  return new Date(v||Date.now()).toISOString().replace(/[:.]/g,"-");
}
async function fetchPrivate(url){
  const r=await fetch(url,{cache:"no-store",headers:{Authorization:`Bearer ${token()}`}});
  if(!r.ok)throw new Error(`Blob read failed ${r.status}`);
  return r.json();
}
export async function writeSnapshot(snapshot){
  if(!learningStoreConfigured())throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  const d=new Date(snapshot.capturedAt||Date.now());
  const yyyy=d.getUTCFullYear(),mm=String(d.getUTCMonth()+1).padStart(2,"0"),dd=String(d.getUTCDate()).padStart(2,"0");
  // 15-minute bucket dedupes retries while preserving schedule changes over time.
  const bucket=Math.floor(d.getUTCMinutes()/15)*15;
  const bucketDate=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),bucket));
  const path=`${ROOT}/snapshots/${yyyy}/${mm}/${dd}/${safeStamp(bucketDate)}.json`;
  const b=await put(path,JSON.stringify(snapshot),{
    access:"private",addRandomSuffix:false,allowOverwrite:true,
    contentType:"application/json",token:token()
  });
  return b;
}
export async function recentSnapshots(limit=700){
  if(!learningStoreConfigured())return [];
  const result=await list({prefix:`${ROOT}/snapshots/`,limit:Math.min(limit,1000),token:token()});
  const blobs=(result.blobs||[]).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).slice(0,limit);
  const out=[];
  for(const b of blobs){
    try{out.push(await fetchPrivate(b.url));}catch{}
  }
  return out.sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt));
}
export async function writeLatestLearning(payload){
  if(!learningStoreConfigured())throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  await put(`${ROOT}/analysis/latest.json`,JSON.stringify(payload),{
    access:"private",addRandomSuffix:false,allowOverwrite:true,
    contentType:"application/json",token:token()
  });
  await put(`${ROOT}/analysis/history/${safeStamp(payload.generatedAt)}.json`,JSON.stringify(payload),{
    access:"private",addRandomSuffix:false,
    contentType:"application/json",token:token()
  });
}
export async function readLatestLearning(){
  if(!learningStoreConfigured())return null;
  const result=await list({prefix:`${ROOT}/analysis/latest.json`,limit:5,token:token()});
  const b=(result.blobs||[])[0];
  if(!b)return null;
  try{return await fetchPrivate(b.url);}catch{return null;}
}
