export const dynamic="force-dynamic";
import { calculateBoardingWindows } from "../../../lib/boardingWindowCalculator.js";

export async function GET(){
  try{
    const result=await calculateBoardingWindows();
    return Response.json(result,{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e){
    return Response.json({
      calculatorVersion:"0.1.0",
      mode:"LCPTMS_INDEPENDENT_PREDICTION_ONLY",
      error:"Boarding window calculation failed",
      detail:e?.message||"unknown error"
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
