export const dynamic="force-dynamic";

import { calculateBoardingWindows } from "../../../lib/boardingWindowCalculator.js";

export async function GET(){
  try{
    const calc=await calculateBoardingWindows();

    return Response.json({
      schemaVersion:"0.2.0",
      generatedAt:new Date().toISOString(),
      mode:"LCPTMS_INDEPENDENT_PREDICTION_ONLY",
      environmentalBias:calc.environmentalBias,
      categories:calc.categories,
      comparisons:[]
    },{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e){
    return Response.json({
      schemaVersion:"0.1.0",
      error:"Independent boarding-window calculation failed",
      detail:e?.message||"unknown error"
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
