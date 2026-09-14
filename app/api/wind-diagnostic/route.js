export const dynamic="force-dynamic";
import { isAdminRequest } from "../../../lib/adminAuth.js";

export async function GET(request){
  if(!isAdminRequest(request))return Response.json({error:"Admin authorization required"},{status:401});
  const origin=new URL(request.url).origin;
  const r=await fetch(`${origin}/api/wind-reports`,{cache:"no-store"});
  const j=await r.json();
  return Response.json(j,{status:r.status,headers:{"Cache-Control":"no-store"}});
}
