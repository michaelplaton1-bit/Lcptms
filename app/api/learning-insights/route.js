export const dynamic="force-dynamic";

import { isAdminRequest } from "../../../lib/adminAuth.js";
import { readLatestLearning, recentSnapshots, learningStoreConfigured } from "../../../lib/persistentLearningStore.js";
import { analyzeLearning } from "../../../lib/persistentLearningEngine.js";

export async function GET(request){
  if(!isAdminRequest(request))return Response.json({error:"Admin authorization required"},{status:401});
  try{
    if(!learningStoreConfigured())return Response.json({
      persistent:false,message:"Vercel Blob is not configured.",summary:{},findings:[],recentActivity:[],windowAccuracy:{categories:[]}
    });
    let analysis=await readLatestLearning();
    if(!analysis)analysis=analyzeLearning(await recentSnapshots(700));
    return Response.json({persistent:true,...analysis},{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    return Response.json({error:"Private AI Insights unavailable",detail:e?.message||"unknown error"},{status:500});
  }
}
