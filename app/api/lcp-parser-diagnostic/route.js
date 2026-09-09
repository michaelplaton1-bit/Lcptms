export const dynamic="force-dynamic";

import { fetchParserDiagnostics } from "../../../lib/lcpParserDiagnostic.js";

export async function GET(){
  try{
    const result=await fetchParserDiagnostics();
    return Response.json(result,{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      diagnosticVersion:"0.2.0",
      error:"Parser diagnostic failed",
      detail:e?.message||"unknown error"
    },{
      status:500,
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }
}
