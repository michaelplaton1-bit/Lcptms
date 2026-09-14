export const dynamic="force-dynamic";

function parseBearer(header){
  const h=String(header||"");
  const m=h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function GET(request){
  const configured=!!process.env.LCPTMS_LEARNING_SECRET;
  const authHeader=request.headers.get("authorization");
  const bearer=parseBearer(authHeader);
  const matches=configured && bearer===process.env.LCPTMS_LEARNING_SECRET;

  return Response.json({
    diagnosticVersion:"0.1.0",
    configured,
    authorizationHeaderPresent:!!authHeader,
    bearerTokenPresent:!!bearer,
    tokenMatches:!!matches,
    vercelEnv:process.env.VERCEL_ENV||null,
    vercelUrl:process.env.VERCEL_URL||null,
    note:"No secret value is returned by this diagnostic."
  },{
    headers:{"Cache-Control":"no-store"}
  });
}
