export const dynamic="force-dynamic";
import { adminConfigured, adminKeyMatches, adminCookieHeader, clearAdminCookieHeader, isAdminRequest } from "../../../lib/adminAuth.js";

export async function GET(request){
  return Response.json({configured:adminConfigured(),authorized:isAdminRequest(request)},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request){
  try{
    const body=await request.json();
    if(!adminConfigured())return Response.json({error:"LCPTMS_ADMIN_KEY not configured"},{status:503});
    if(!adminKeyMatches(body?.key))return Response.json({error:"Invalid admin key"},{status:401});
    return Response.json({authorized:true},{headers:{"Set-Cookie":adminCookieHeader(),"Cache-Control":"no-store"}});
  }catch(e){return Response.json({error:"Admin login failed"},{status:400});}
}
export async function DELETE(){
  return Response.json({authorized:false},{headers:{"Set-Cookie":clearAdminCookieHeader(),"Cache-Control":"no-store"}});
}
