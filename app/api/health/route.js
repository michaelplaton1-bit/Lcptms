export async function GET() {
  return Response.json({
    ok:true,
    app:"LCPTMS",
    host:"traffic.lcptms.com",
    time:new Date().toISOString()
  });
}