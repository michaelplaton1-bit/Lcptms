// LCPTMS official-current-set validation v0.1

function valuesDeep(x,out=[]){
  if(Array.isArray(x)){for(const v of x)valuesDeep(v,out);return out;}
  if(typeof x==="string"&&/^[\[{]/.test(x.trim())){
    try{return valuesDeep(JSON.parse(x),out);}catch{return out;}
  }
  if(x&&typeof x==="object"){
    out.push(x);
    for(const v of Object.values(x)) if(v&&typeof v==="object") valuesDeep(v,out);
  }
  return out;
}
function norm(s){return String(s||"").toUpperCase().replace(/[’′]/g,"'").replace(/\s+/g," ").trim();}
function first(obj,names){
  const entries=Object.entries(obj||{});
  for(const wanted of names){
    const hit=entries.find(([k])=>norm(k)===norm(wanted));
    if(hit&&hit[1]!=null&&hit[1]!=="")return hit[1];
  }
  return null;
}
function categoryFromText(s){
  const x=norm(s);
  if(x.includes("INBOUND")&&(x.includes("DEEP")||x.includes("36")))return "INBOUND_DEEP_DRAFT";
  if(x.includes("OUTBOUND")&&(x.includes("CAMERON")||x.includes("CLNG"))&&(x.includes("UP TO 38")||x.includes("<=38")||x.includes("LESS THAN 38")||x.includes("LE 38")))return "CLNG_OUTBOUND_LE_38";
  if(x.includes("OUTBOUND")&&(x.includes("CAMERON")||x.includes("CLNG"))&&(x.includes("38' TO 40")||x.includes("GREATER THAN 38")||x.includes(">38")||x.includes("GT 38")))return "CLNG_OUTBOUND_GT_38";
  if(x.includes("INBOUND")&&x.includes("VENTURE"))return "VG_INBOUND";
  if(x.includes("OUTBOUND")&&x.includes("VENTURE"))return "VG_OUTBOUND";
  return null;
}
function chicagoIsoFromOfficial(v,year=new Date().getFullYear()){
  if(!v)return null;
  if(typeof v==="number"){
    const ms=v<1e12?v*1000:v;
    const d=new Date(ms);
    return Number.isFinite(d.getTime())?d.toISOString():null;
  }
  const dotNet=String(v).match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if(dotNet)return new Date(Number(dotNet[1])).toISOString();
  const direct=new Date(v);
  if(Number.isFinite(direct.getTime())&&/[TZ]|-\d\d:\d\d/.test(String(v)))return direct.toISOString();
  const s=String(v).trim();
  const m=s.match(/(\d{1,2})[.\/-](\d{1,2})\s+(\d{2})(\d{2})/);
  if(!m)return null;
  const [,mo,d,h,mi]=m;
  const naive=Date.UTC(year,+mo-1,+d,+h,+mi);
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(naive));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const rendered=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
  return new Date(naive-(rendered-naive)).toISOString();
}
export function parseOfficialWindows(payload){
  const records=[];
  for(const obj of valuesDeep(payload)){
    const label=first(obj,["Category","Title","Name","Type","WindowName","TideSetName","Description","Header","DisplayName","RuleName","TideSet","Movement"]);
    const category=categoryFromText(label)||categoryFromText(JSON.stringify(obj));
    if(!category)continue;
    const open=first(obj,["Open","OPEN","OpenTime","WindowOpen","Start","StartTime","From","Begin","BeginTime","Opening"]);
    const close=first(obj,["Close","CLOSE","CloseTime","WindowClose","End","EndTime","To","Stop","Closing"]);
    if(open&&close){
      const oi=chicagoIsoFromOfficial(open),ci=chicagoIsoFromOfficial(close);
      if(oi&&ci)records.push({category,label:String(label||category),open:oi,close:ci,native:obj});
    }
  }
  const unique=new Map();
  for(const row of records)unique.set(`${row.category}|${row.open}|${row.close}`,row);
  return [...unique.values()].sort((a,b)=>new Date(a.open)-new Date(b.open));
}
function mins(a,b){return (new Date(a).getTime()-new Date(b).getTime())/60000;}
function nearestOfficial(window,official){
  if(!official.length)return null;
  return official.reduce((best,o)=>{
    const score=Math.abs(mins(window.open,o.open))+Math.abs(mins(window.close,o.close));
    return !best||score<best.score?{...o,score}:best;
  },null);
}
export function compareWindowSets(categories,official){
  return (categories||[]).map(cat=>{
    const refs=(official||[]).filter(o=>o.category===cat.id);
    const rows=(cat.raw||[]).slice(0,12).map((raw,i)=>{
      const adjusted=(cat.biasAdjusted||[])[i]||null;
      const ref=nearestOfficial(raw,refs);
      return {
        raw,
        biasAdjusted:adjusted,
        official:ref?{open:ref.open,close:ref.close,label:ref.label}:null,
        rawErrorMinutes:ref?{
          open:+mins(raw.open,ref.open).toFixed(1),
          close:+mins(raw.close,ref.close).toFixed(1)
        }:null,
        adjustedErrorMinutes:ref&&adjusted?{
          open:+mins(adjusted.open,ref.open).toFixed(1),
          close:+mins(adjusted.close,ref.close).toFixed(1)
        }:null,
        accuracy:ref?{
          rawAbsoluteErrorMinutes:{
            open:+Math.abs(mins(raw.open,ref.open)).toFixed(1),
            close:+Math.abs(mins(raw.close,ref.close)).toFixed(1)
          },
          adjustedAbsoluteErrorMinutes:adjusted?{
            open:+Math.abs(mins(adjusted.open,ref.open)).toFixed(1),
            close:+Math.abs(mins(adjusted.close,ref.close)).toFixed(1)
          }:null,
          postedDurationMinutes:+mins(ref.close,ref.open).toFixed(1),
          calculatedDurationMinutes:+mins(raw.close,raw.open).toFixed(1)
        }:null
      };
    });
    return {id:cat.id,label:cat.label,officialCount:refs.length,rows};
  });
}
