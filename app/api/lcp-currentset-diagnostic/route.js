export const dynamic="force-dynamic";
import { isAdminRequest } from "../../../lib/adminAuth.js";
import { diagnoseOfficialCurrentSet } from "../../../lib/lcpStructuredSchedule.js";

export async function GET(request){
  if(!isAdminRequest(request))return Response.json({error:"Admin authorization required"},{status:401});
  try{
    const data=await diagnoseOfficialCurrentSet({days:14});
    return Response.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    return Response.json({error:"Current-set diagnostic failed",detail:e?.message||"unknown error"},{status:500});
  }
}
