import crypto from "crypto";
import { put, list, get } from "@vercel/blob";

const ROOT="lcptms-learning-v1";

export function learningStoreConfigured(){
  return !!process.env.BLOB_READ_WRITE_TOKEN && !!encryptionSecret();
}
function token(){return process.env.BLOB_READ_WRITE_TOKEN;}
function encryptionSecret(){
  return process.env.LCPTMS_LEARNING_ENCRYPTION_KEY ||
    process.env.LCPTMS_LEARNING_SECRET ||
    process.env.LCPTMS_ADMIN_KEY;
}
function safeStamp(v){
  return new Date(v||Date.now()).toISOString().replace(/[:.]/g,"-");
}
function encryptedJson(value){
  const key=crypto.createHash("sha256").update(encryptionSecret()).digest();
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return JSON.stringify({
    version:1,
    algorithm:"aes-256-gcm",
    iv:iv.toString("base64"),
    tag:cipher.getAuthTag().toString("base64"),
    data:ciphertext.toString("base64")
  });
}
function decryptedJson(text){
  const envelope=JSON.parse(text);
  if(envelope?.version!==1 || envelope?.algorithm!=="aes-256-gcm"){
    throw new Error("Unsupported learning snapshot format");
  }
  const key=crypto.createHash("sha256").update(encryptionSecret()).digest();
  const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(envelope.iv,"base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
  const plaintext=Buffer.concat([
    decipher.update(Buffer.from(envelope.data,"base64")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext);
}
async function readStored(pathname){
  const result=await get(pathname,{access:"private",token:token()});
  if(!result||result.statusCode!==200)throw new Error(`Blob read failed for ${pathname}`);
  const text=await new Response(result.stream).text();
  try{return decryptedJson(text);}
  catch{return JSON.parse(text);}
}
async function writeEncrypted(path,value,{allowOverwrite=false}={}){
  return put(path,encryptedJson(value),{
    access:"private",
    addRandomSuffix:false,
    allowOverwrite,
    contentType:"application/json",
    token:token()
  });
}
export async function writeSnapshot(snapshot){
  if(!learningStoreConfigured())throw new Error("Learning storage or encryption secret is not configured");
  const d=new Date(snapshot.capturedAt||Date.now());
  const yyyy=d.getUTCFullYear(),mm=String(d.getUTCMonth()+1).padStart(2,"0"),dd=String(d.getUTCDate()).padStart(2,"0");
  const bucket=Math.floor(d.getUTCMinutes()/15)*15;
  const bucketDate=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),bucket));
  const path=`${ROOT}/snapshots/${yyyy}/${mm}/${dd}/${safeStamp(bucketDate)}.json`;
  return writeEncrypted(path,snapshot,{allowOverwrite:true});
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
    try{out.push(await readStored(b.pathname));}catch{}
  }
  return out.sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt));
}
export async function writeLatestLearning(payload){
  if(!learningStoreConfigured())throw new Error("Learning storage or encryption secret is not configured");
  await writeEncrypted(`${ROOT}/analysis/latest.json`,payload,{allowOverwrite:true});
  await writeEncrypted(`${ROOT}/analysis/history/${safeStamp(payload.generatedAt)}.json`,payload);
}
export async function readLatestLearning(){
  if(!learningStoreConfigured())return null;
  const result=await list({prefix:`${ROOT}/analysis/latest.json`,limit:1,token:token()});
  const blob=(result.blobs||[])[0];
  if(!blob)return null;
  try{return await readStored(blob.pathname);}
  catch{return null;}
}
