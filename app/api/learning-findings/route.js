export const dynamic="force-dynamic";

import { latestFindings, recentSnapshots, learningStoreConfigured } from "../../../lib/learningStore.js";
import { deriveFindings } from "../../../lib/learningFindings.js";

const WINDOW_HOURS=12;

function filterToRecent(findings){
  if(!findings)return findings;
  const cutoff=Date.now()-WINDOW_HOURS*60*60*1000;
  const list=(findings.findings||[]).filter(f=>{
    const t=new Date(f.lastObservedAt||f.generatedAt||findings.generatedAt||0).getTime();
    return Number.isFinite(t) && t>=cutoff;
  });

  return {
    ...findings,
    windowHours:WINDOW_HOURS,
    findings:list,
    summary:{
      recommendedChanges:list.filter(x=>x.status==="RECOMMENDED_CHANGE").length,
      candidateFindings:list.filter(x=>x.status==="CANDIDATE_FINDING").length,
      observations:list.filter(x=>x.status==="OBSERVATION").length
    }
  };
}

export async function GET(){
  try{
    if(!learningStoreConfigured()){
      return Response.json({
        schemaVersion:"0.2.1",
        persistent:false,
        windowHours:WINDOW_HOURS,
        summary:{recommendedChanges:0,candidateFindings:0,observations:0},
        findings:[],
        message:"Vercel Blob is not configured yet."
      });
    }

    let findings=await latestFindings();
    if(!findings){
      findings=deriveFindings(await recentSnapshots({limit:96}));
    }

    return Response.json({
      schemaVersion:"0.2.1",
      persistent:true,
      ...filterToRecent(findings)
    },{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    return Response.json({error:"Learning findings unavailable",detail:e?.message||"unknown error"},{status:500});
  }
}
