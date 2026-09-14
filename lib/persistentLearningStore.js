import { put, list, get } from "@vercel/blob";

const ROOT="lcptms-learning-v1";

export function learningStoreConfigured(){
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
function token(){return process.env.BLOB_READ_WRITE_TOKEN;}
function safeStamp(v){
  return new Date(v||Date.now()).toISOString().replace(/[:.]/g,"-");
}
async function readPrivate(pathname){
  const result=await get(pathname,{access:"private",token:token()});
  if(!result||result.statusCode!==200)throw new Error(`Blob read failed for ${pathname}`);
  const text=await new Response(result.stream).text();
  return JSON.parse(text);
}
export async function writeSnapshot(snapshot){
  if(!learningStoreConfigured())throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  const d=new Date(snapshot.capturedAt||Date.now());
  const yyyy=d.getUTCFullYear(),mm=String(d.getUTCMonth()+1).padStart(2,"0"),dd=String(d.getUTCDate()).padStart(2,"0");
  const bucket=Math.floor(d.getUTCMinutes()/15)*15;
  const bucketDate=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),bucket));
  const path=`${ROOT}/snapshots/${yyyy}/${mm}/${dd}/${safeStamp(bucketDate)}.json`;
  return put(path,JSON.stringify(snapshot),{
    access:"private",
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType:"application/json",
    token:token()
  });
}
export async function recentSnapshots(limit=700){
  if(!learningStoreConfigured())return [];
  const result=await list({
    prefix:`${ROOT}/snapshots/`,
    limit:Math.min(limit,1000),
    token:token()
  });
  const blobs=(result.blobs||[])
    .sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt))
    .slice(0,limit);

  const out=[];
  for(const b of blobs){
    try{out.push(await readPrivate(b.pathname));}catch{}
  }
  return out.sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt));
}
export async function writeLatestLearning(payload){
  if(!learningStoreConfigured())throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  await put(`${ROOT}/analysis/latest.json`,JSON.stringify(payload),{
    access:"private",
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType:"application/json",
    token:token()
  });
  await put(`${ROOT}/analysis/history/${safeStamp(payload.generatedAt)}.json`,JSON.stringify(payload),{
    access:"private",
    addRandomSuffix:false,
    contentType:"application/json",
    token:token()
  });
}
export async function readLatestLearning(){
  if(!learningStoreConfigured())return null;
  try{return await readPrivate(`${ROOT}/analysis/latest.json`);}
  catch{return null;}
}
