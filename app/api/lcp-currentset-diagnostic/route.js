export const dynamic="force-dynamic";

export async function GET(){
  return Response.json({
    archived:true,
    mode:"LCPTMS_INDEPENDENT_PREDICTION_ONLY",
    error:"Posted boarding-window diagnostics are disabled."
  },{status:410,headers:{"Cache-Control":"no-store"}});
}
