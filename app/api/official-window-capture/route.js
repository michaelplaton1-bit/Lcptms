export const dynamic="force-dynamic";

function archived(){
  return Response.json({
    ok:false,
    archived:true,
    mode:"LCPTMS_INDEPENDENT_PREDICTION_ONLY",
    error:"Posted boarding-window capture is disabled."
  },{status:410,headers:{"Cache-Control":"no-store"}});
}

export async function POST(){return archived();}
export async function GET(){return archived();}
