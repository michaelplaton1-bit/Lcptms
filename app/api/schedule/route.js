export const dynamic="force-dynamic";

import { fetchStructuredSchedule } from "../../../lib/lcpStructuredSchedule.js";

function nativePreview(arr){
  return Array.isArray(arr) ? arr.slice(0,3) : [];
}

export async function GET(){
  try{
    const live=await fetchStructuredSchedule();

    return Response.json({
      schemaVersion:"1.1.0-structured",
      source:live.source,
      fetchedAt:live.fetchedAt,
      counts:{
        moving:live.arrays.moving.length,
        expected:live.arrays.expected.length,
        arriving:live.arrays.arriving.length,
        inPort:live.arrays.inPort.length
      },
      diagnostics:live.diagnostics,

      // During first verification, expose only a small native preview.
      // Once field names are confirmed, this route will normalize every row
      // through scheduleAdapter + ETA + environmentalIntersection.
      preview:{
        moving:nativePreview(live.arrays.moving),
        expected:nativePreview(live.arrays.expected),
        arriving:nativePreview(live.arrays.arriving),
        inPort:nativePreview(live.arrays.inPort)
      }
    },{
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }catch(e){
    return Response.json({
      schemaVersion:"1.1.0-structured",
      error:"Structured LCP schedule connector failed",
      detail:e?.message||"unknown error"
    },{
      status:500,
      headers:{"Cache-Control":"no-store, max-age=0"}
    });
  }
}
