export const dynamic="force-dynamic";

import { calculateBoardingWindows } from "../../../lib/boardingWindowCalculator.js";
import { fetchOfficialCurrentSet } from "../../../lib/lcpStructuredSchedule.js";
import { parseOfficialWindows, compareWindowSets } from "../../../lib/boardingWindowValidation.js";

export async function GET(){
  try{
    const [calc,officialResult]=await Promise.all([
      calculateBoardingWindows(),
      fetchOfficialCurrentSet({days:14})
    ]);
    const official=parseOfficialWindows(officialResult.data);
    const comparisons=compareWindowSets(calc.categories,official);

    return Response.json({
      schemaVersion:"0.1.0",
      generatedAt:new Date().toISOString(),
      officialFetchedAt:officialResult.fetchedAt,
      officialDiagnostics:officialResult.diagnostics,
      officialParsedCount:official.length,
      official,
      environmentalBias:calc.environmentalBias,
      comparisons
    },{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e){
    return Response.json({
      schemaVersion:"0.1.0",
      error:"Boarding-window validation failed",
      detail:e?.message||"unknown error"
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
