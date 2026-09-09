export const dynamic="force-dynamic";

import { sqlEndpointDiagnostics } from "../../../lib/lcpSqlEndpointDiagnostic.js";

export async function GET(){
  try{
    return Response.json(await sqlEndpointDiagnostics(),{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      diagnosticVersion:"0.5.0",
      error:"SQL endpoint diagnostic failed",
      detail:e?.message||"unknown error"
    },{
      status:500,
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }
}
