export const dynamic="force-dynamic";
import { getPublishedBoardingWindows } from "../../../lib/boardingWindowPublication.js";

export async function GET(){
  try{
    const data=await getPublishedBoardingWindows();
    return Response.json(data,{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(e){
    return Response.json({error:"Published boarding windows unavailable",detail:e?.message||"unknown error"},{status:500});
  }
}
