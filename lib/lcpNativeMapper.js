// LCPTMS Native LCP Record Mapper v1.1.1
// Maps LakeCharlesSQLDataService native JSON records into the existing LCPTMS scheduleAdapter shape.
// Loose info rule: native "Key" = assigned pilot unit number(s).

export const LCP_NATIVE_MAPPER_VERSION="1.1.1";

function clean(v){
  if(v===null || v===undefined) return "";
  return String(v).trim();
}

function normalizeDateLike(v){
  if(v===null || v===undefined || v==="") return "";

  const s=String(v).trim();

  if(/^\d{1,2}\/\d{4}$/.test(s)) return s;

  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){
    const d=new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : s;
  }

  const dotnet=s.match(/\/Date\(([-+]?\d+)(?:[-+]\d+)?\)\//);
  if(dotnet){
    const d=new Date(Number(dotnet[1]));
    return Number.isFinite(d.getTime()) ? d.toISOString() : s;
  }

  return s;
}

function normalizeDirection(v){
  const s=clean(v).toUpperCase();
  if(!s) return "";
  if(["I/B","IB","INBOUND","IN"].includes(s)) return "I/B";
  if(["O/B","OB","OUTBOUND","OUT"].includes(s)) return "O/B";
  return s;
}

function pilotUnitNumbers(v){
  const s=clean(v);
  if(!s) return [];
  return s
    .split(/[,\s/]+/)
    .map(x=>x.trim())
    .filter(Boolean);
}

function recordId(record, section, index){
  return clean(record?.LogID) || `${section}-${index+1}`;
}

export function mapNativeLcpRecord(record, section, index=0){
  const units=pilotUnitNumbers(record?.Key);

  const mapped={
    __section: section,
    __sourceRecordId: recordId(record, section, index),

    Vessel: clean(record?.VesselName),
    Ordered: normalizeDateLike(record?.OrderedTime),
    PBT: normalizeDateLike(record?.PBT),
    ETA: normalizeDateLike(record?.ETA),

    Direction: normalizeDirection(record?.Direction),
    Status: clean(record?.Status),

    Length: record?.Length ?? "",
    Beam: record?.Beam ?? "",
    DWT: record?.DWT ?? "",
    Draft: record?.Draft ?? "",
    Berth: clean(record?.Berth),

    "Tug Co.": clean(record?.TugCo),
    LH: clean(record?.LineHandler),

    "36": normalizeDateLike(record?.C6DateTime),
    ICWW: normalizeDateLike(record?.ICWWDateTime),
    "Off Dock": normalizeDateLike(record?.OffDock),

    Agent: clean(record?.Agent),
    "Last Port": clean(record?.LastPort),
    Remarks: clean(record?.Remarks),
    "Last Change": normalizeDateLike(record?.LastChange),

    CallSign: clean(record?.CallSign),
    IMO: clean(record?.IMO),
    SideTo: clean(record?.SideTo),
    LogID: clean(record?.LogID),

    // Native schedule "Key" field = assigned pilot unit number(s).
    PilotUnitNumber: units[0] || null,
    PilotUnitNumbers: units,
    Key: clean(record?.Key),

    __raw: record
  };

  if(!mapped.Ordered && mapped.ETA) mapped.Ordered=mapped.ETA;

  if(mapped.Direction && !new RegExp(mapped.Direction.replace("/","\\/"),"i").test(mapped.Status)){
    mapped.Status=`${mapped.Direction} ${mapped.Status}`.trim();
  }

  return mapped;
}

export function mapNativeLcpSection(records, section){
  return (Array.isArray(records) ? records : []).map((r,i)=>mapNativeLcpRecord(r,section,i));
}
