export const dynamic="force-dynamic";
export const maxDuration=300;

import { learningCaptureAuthorized } from "../../../lib/adminAuth.js";
import { calculateBoardingWindows } from "../../../lib/boardingWindowCalculator.js";
import { parseOfficialWindows, compareWindowSets } from "../../../lib/boardingWindowValidation.js";
import { fetchOfficialCurrentSet } from "../../../lib/lcpStructuredSchedule.js";
import { learningStoreConfigured, writeOfficialWindowCapture } from "../../../lib/persistentLearningStore.js";

function comparisonSummary(comparisons){
  const rows=(comparisons||[]).flatMap(category=>(category.rows||[])
    .filter(row=>row.official)
    .map(row=>({
      categoryId:category.id,
      categoryLabel:category.label,
      posted:row.official,
      lcptmsCalculated:row.raw,
      lcptmsBiasAdjusted:row.biasAdjusted,
      signedDifferenceMinutes:row.rawErrorMinutes,
      biasAdjustedDifferenceMinutes:row.adjustedErrorMinutes,
      accuracy:row.accuracy
    })));
  const errors=rows.flatMap(row=>[
    row.accuracy?.rawAbsoluteErrorMinutes?.open,
    row.accuracy?.rawAbsoluteErrorMinutes?.close
  ]).filter(Number.isFinite);
  return {
    comparedWindows:rows.length,
    meanAbsoluteErrorMinutes:errors.length?+(errors.reduce((a,b)=>a+b,0)/errors.length).toFixed(1):null,
    maximumAbsoluteErrorMinutes:errors.length?+Math.max(...errors).toFixed(1):null,
    rows
  };
}

async function capture(request){
  if(!learningCaptureAuthorized(request))return Response.json({ok:false,error:"Unauthorized"},{status:401});
  if(!learningStoreConfigured())return Response.json({ok:false,error:"Learning storage is not configured"},{status:503});

  const capturedAt=new Date().toISOString();
  const [calculated,officialResult]=await Promise.all([
    calculateBoardingWindows(),
    fetchOfficialCurrentSet({days:14})
  ]);
  const posted=parseOfficialWindows(officialResult.data);
  const comparisons=compareWindowSets(calculated.categories,posted);
  const comparison=comparisonSummary(comparisons);
  const payload={
    schemaVersion:"0.2.0",
    capturedAt,
    source:"LakeCharlesPilots.com authenticated schedule sheet",
    sourceFetchedAt:officialResult.fetchedAt,
    sourceDiagnostics:officialResult.diagnostics,
    postedWindows:posted,
    lcptmsCalculation:{generatedAt:calculated.generatedAt||capturedAt,environmentalBias:calculated.environmentalBias||null},
    comparisons,
    comparison
  };
  const storagePath=await writeOfficialWindowCapture(payload);
  return Response.json({
    ok:true,capturedAt,postedWindowsCaptured:posted.length,
    comparedWindows:comparison.comparedWindows,
    meanAbsoluteErrorMinutes:comparison.meanAbsoluteErrorMinutes,
    maximumAbsoluteErrorMinutes:comparison.maximumAbsoluteErrorMinutes,
    storagePath,
    sourceDiagnostics:officialResult.diagnostics
  },{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request){
  try{return await capture(request);}
  catch(error){return Response.json({ok:false,error:"Official schedule-sheet capture failed",detail:error?.message||"unknown error"},{status:500});}
}

export async function GET(request){return POST(request);}
