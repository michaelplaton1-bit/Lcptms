export const dynamic="force-dynamic";
import { scriptDiagnostics } from "../../../lib/lcpScriptDiagnostic.js";
export async function GET(){try{return Response.json(await scriptDiagnostics(),{headers:{"Cache-Control":"no-store"}});}catch(e){return Response.json({diagnosticVersion:"0.4.0",error:e.message},{status:500,headers:{"Cache-Control":"no-store"}});}}
