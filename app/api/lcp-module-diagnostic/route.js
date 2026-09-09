export const dynamic="force-dynamic";

import { moduleDiagnostics } from "../../../lib/lcpModuleDiagnostic.js";

export async function GET(){
  try{
    const result=await moduleDiagnostics();
    return Response.json(result,{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      diagnosticVersion:"0.3.0",
      error:"Module diagnostic failed",
      detail:e?.message||"unknown error"
    },{
      status:500,
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }
}
