"use client";

import { useEffect, useMemo, useState } from "react";

function Dot({tone="green"}) { return <span className={`dot ${tone}`} />; }
function fmtDateTime(v){
  if(!v)return "—";
  const d=new Date(v);
  if(!Number.isFinite(d.getTime()))return String(v);
  return new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d).replace(",","");
}
function sectionItems(items,section){return (items||[]).filter(x=>x.section===section);}
function keyText(m){return (m?.pilotUnitNumbers||[]).join(", ") || m?.native?.Key || "—";}

function lcpDateTime(v){
  if(!v)return "—";

  const s=String(v).trim();

  // Preserve native LCP shorthand exactly, e.g. 09/1100.
  if(/^\d{1,2}\/\d{4}$/.test(s)) return s.padStart(7,"0");

  const d=new Date(v);
  if(!Number.isFinite(d.getTime())) return s;

  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit",
    hourCycle:"h23"
  }).formatToParts(d);

  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.day}/${p.hour}${p.minute}`;
}

function planningTimeMs(m){
  const candidates=[
    m?.movement?.schedule?.pbtAt,
    m?.movement?.schedule?.orderedAt,
    m?.native?.PBT,
    m?.native?.OrderedTime
  ];
  for(const v of candidates){
    if(!v)continue;
    const d=new Date(v);
    if(Number.isFinite(d.getTime()))return d.getTime();
  }
  return null;
}

function liveUpcoming24h(moving,expected){
  const now=Date.now(), horizon=now+24*60*60*1000;
  const due=(expected||[]).filter(m=>{
    const t=planningTimeMs(m);
    return t!=null && t>=now && t<=horizon;
  });
  return [...(moving||[]),...due];
}

function dimensionText(m){
  const n=m?.native||{}, d=m?.display||{};
  const length=n.Length ?? d.lengthFt;
  const beam=n.Beam ?? d.beamFt;
  if(length==null && beam==null)return "—";
  return `${length??"—"}x${beam??"—"}`;
}

function sideToText(m){
  const n=m?.native||{};
  return n.SideTo || n["?ST"] || "—";
}

function isUnderway(m){
  return m?.section==="MOVING" || m?.movement?.movement?.status==="MOVING";
}

export default function Home(){
  const [env,setEnv]=useState(null),[schedule,setSchedule]=useState(null),[err,setErr]=useState(""),[loading,setLoading]=useState(true),[clock,setClock]=useState(new Date()),[tab,setTab]=useState("Overview");
  async function load(){
    setLoading(true);setErr("");
    try{
      const [er,sr]=await Promise.all([fetch("/api/environment",{cache:"no-store"}),fetch("/api/schedule",{cache:"no-store"})]);
      const [e,s]=await Promise.all([er.json(),sr.json()]);
      if(!er.ok)throw new Error(e?.error||"Unable to load environmental feeds");
      if(!sr.ok)throw new Error(s?.error||"Unable to load schedule");
      setEnv(e);setSchedule(s);
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{load();const c=setInterval(()=>setClock(new Date()),30000),r=setInterval(load,60000);return()=>{clearInterval(c);clearInterval(r)}},[]);
  const timeText=useMemo(()=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZoneName:"short"}).format(clock),[clock]);
  const items=schedule?.items||[],moving=sectionItems(items,"MOVING"),expected=sectionItems(items,"EXPECTED"),arriving=sectionItems(items,"ARRIVING"),inPort=sectionItems(items,"IN_PORT");
  const lb36=env?.noaa?.operational?.lb36,cam=env?.noaa?.operational?.cameron,camPred=Array.isArray(cam?.prediction)?cam.prediction:[];

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><div className="mark">⚓</div><div><b>LCPTMS</b><span>Lake Charles Pilots</span></div></div>
      <nav><a className={tab==="Overview"?"active":""} onClick={()=>setTab("Overview")}>Dashboard</a><a className={tab==="Schedule"?"active":""} onClick={()=>setTab("Schedule")}>Schedule</a><a onClick={()=>setTab("Environmental")}>Environmental</a><a>Traffic Plan (AI)</a><a>What-If Analysis</a><a>Hurricane Monitor</a><a>Channel / ATON</a><a>Notes & Alerts</a><a>Reports</a></nav>
      <div className="sidebarFoot"><div className="avatar">LCP</div><div><b>Live read-only</b><span>Structured schedule</span></div></div>
    </aside>
    <main><header className="topbar"><div><h1>Lake Charles Pilots</h1><p>Traffic Management System</p></div><div className="topStats"><div className="topStat"><b>{timeText}</b><span>Lake Charles Local</span></div><div className="topStat"><b><Dot/> Live Schedule</b><span>{schedule?.fetchedAt?"Connected":"Loading"}</span></div><button className="iconBtn" onClick={load}>↻</button></div></header>
      <div className="tabs">{["Overview","Waterway","Schedule","Environmental","AI Insights"].map(x=><button key={x} onClick={()=>setTab(x)} className={tab===x?"active":""}>{x}</button>)}</div>
      {tab==="Schedule"?<ScheduleBoard schedule={schedule} moving={moving} expected={expected} arriving={arriving} inPort={inPort}/>:
       tab==="Environmental"?<EnvironmentalOnly env={env} cam={cam} lb36={lb36} camPred={camPred} loading={loading} err={err}/>:
       <Overview env={env} schedule={schedule} moving={moving} expected={expected} arriving={arriving} inPort={inPort} cam={cam} lb36={lb36} camPred={camPred} loading={loading} err={err}/>}
      <div className="commandBar"><button>＋</button><input placeholder="Ask about the schedule, vessels, weather, or run a what-if…"/><button>→</button></div>
    </main>
  </div>;
}
function ScheduleBoard({schedule,moving,expected,arriving,inPort}){
  return <section className="pilotSheet">
    <div className="sheetStatus"><InfoBox title="Pilotage Service" value={noteMessage(schedule?.notes?.pilotage)||"Available"}/><InfoBox title="Channel Status" value={noteMessage(schedule?.notes?.channel)||"Open — Normal Operations"}/><div className="sheetLive"><Dot/><b>LIVE</b><span>60 sec refresh</span></div></div>
    <PilotSection title="Vessels Moving within the VTIS" items={moving} type="moving"/>
    <PilotSection title="Vessels Expected To Move" items={expected} type="expected"/>
    <NotesBlock notes={schedule?.notes?.general}/>
    <PilotSection title="Vessels Arriving Or Anchored At Bar" items={arriving} type="arriving"/>
    <PilotSection title="Vessels In Port" items={inPort} type="inport"/>
  </section>;
}
function InfoBox({title,value}){return <div><b>{title}</b><span>{value}</span></div>}
function noteMessage(v){const a=Array.isArray(v)?v:[];const x=a[0];return x?.Message||x?.message||x?.Text||x?.text||null}
function NotesBlock({notes}){const a=Array.isArray(notes)?notes:[];return <section className="scheduleSection"><div className="scheduleTitle">Notes <span>{a.length?"LIVE":"—"}</span></div><div className="scheduleNotes">{a.length?a.map((n,i)=><div key={i}>{n.Message||n.message||n.Text||n.text||JSON.stringify(n)}</div>):<div className="muted">No active notes returned.</div>}</div></section>}
function PilotSection({title,items,type}){
  return <section className="scheduleSection"><div className="scheduleTitle">{title}<span>{items.length} live</span></div><div className="tableWrap pilotTableWrap"><table className="pilotTable"><thead><tr>
    <th>Vessel</th><th>Key</th>{type==="expected"&&<><th>Ordered</th><th>PBT</th></>}{type==="arriving"&&<><th>ETA</th><th>PBT</th></>}{type==="inport"&&<><th>Ordered</th><th>PBT</th></>}
    <th>Status</th><th>Length</th><th>Beam</th><th>DWT</th><th>Draft</th><th>Berth</th><th>?ST</th><th>TugCo</th><th>Agent</th><th>LH</th>
    {type==="moving"&&<><th>36</th><th>ICWW</th><th>Off Dock</th></>}{type==="arriving"&&<th>Last Port</th>}<th>Remarks</th><th>Last Change</th><th>AI ETA</th>
  </tr></thead><tbody>{items.length?items.map(m=><PilotRow key={m.logId||m.display?.vessel} m={m} type={type}/>):<tr><td colSpan="20">No vessels in this section.</td></tr>}</tbody></table></div></section>
}
function PilotRow({m,type}){const d=m.display||{},n=m.native||{};return <tr>
  <td className="vessel stickyVessel">{d.vessel||n.VesselName||"—"}</td><td className="pilotKey">{keyText(m)}</td>
  {type==="expected"&&<><td>{lcpDateTime(n.OrderedTime||m?.movement?.schedule?.orderedAt)}</td><td>{lcpDateTime(n.PBT||m?.movement?.schedule?.pbtAt)}</td></>}
  {type==="arriving"&&<><td>{lcpDateTime(n.ETA)}</td><td>{lcpDateTime(n.PBT||m?.movement?.schedule?.pbtAt)}</td></>}
  {type==="inport"&&<><td>{lcpDateTime(n.OrderedTime||m?.movement?.schedule?.orderedAt)}</td><td>{d.pbt||n.PBT||"—"}</td></>}
  <td className="statusCell">{n.Status||d.status||"—"}</td><td>{n.Length??d.lengthFt??"—"}</td><td>{n.Beam??d.beamFt??"—"}</td><td>{n.DWT??d.dwt??"—"}</td><td className="draftCell">{n.Draft??(d.draftFt!=null?`${d.draftFt.toFixed(1)}'`:"—")}</td><td>{n.Berth||d.berth||"—"}</td><td>{n.SideTo||"—"}</td><td>{n.TugCo||"—"}</td><td>{n.Agent||d.agent||"—"}</td><td>{n.LineHandler||d.lineHandler||"—"}</td>
  {type==="moving"&&<><td>{n.C6DateTime?fmtDateTime(n.C6DateTime):"—"}</td><td>{n.ICWWDateTime?fmtDateTime(n.ICWWDateTime):"—"}</td><td>{n.OffDock?fmtDateTime(n.OffDock):"—"}</td></>}
  {type==="arriving"&&<td>{n.LastPort||"—"}</td>}<td className="remarksCell">{n.Remarks||d.remarks||"—"}</td><td>{n.LastChange?fmtDateTime(n.LastChange):"—"}</td><td className="aiEta">{d.eta36||d.eta60||d.etaICW||"—"}{d.cameronEffect&&<small>{d.cameronEffect}</small>}</td>
</tr>}
function Overview({env,schedule,moving,expected,arriving,inPort,cam,lb36,camPred,loading,err}){
  const modeled=liveUpcoming24h(moving,expected);
  return <section className="mainGrid"><div className="leftCol"><div className="metrics"><Metric n={moving.length} label="Vessels in VTIS" sub="Moving within region"/><Metric n={expected.length} label="Expected to Move" sub="Live schedule"/><Metric n={arriving.length} label="At or Near the Bar" sub="Arriving / Anchored"/><Metric n={inPort.length} label="Vessels in Port" sub="All facilities"/></div>
  <Card title="Live / Upcoming Traffic" right="NOW + 24 HOURS"><div className="tableWrap"><table className="overviewTraffic"><thead><tr>
    <th>Vessel</th><th>Key</th><th>Ordered</th><th>PBT</th><th>Berth</th><th>I/B · O/B</th><th>Length x Beam</th><th>Draft</th><th>SST / PST / TBD</th>
    <th>36 ETA</th><th>60 ETA</th><th>ICW ETA</th>
  </tr></thead>
  <tbody>{modeled.length?modeled.map((m,i)=>{const d=m.display||{},n=m.native||{};return <tr key={m.logId||i}>
    <td className="vessel">
      <span className="vesselState">{isUnderway(m)?<span className="underwayDot" title="Underway"/>:<span className="scheduledDot" title="Scheduled"/>}</span>
      {d.vessel||n.VesselName||"—"}
      {isUnderway(m)&&<span className="underwayLabel">UNDERWAY</span>}
    </td>
    <td className="pilotKey">{keyText(m)}</td>
    <td>{lcpDateTime(n.OrderedTime||m?.movement?.schedule?.orderedAt)}</td>
    <td>{d.pbt||n.PBT||"—"}</td>
    <td>{n.Berth||d.berth||"—"}</td>
    <td className="statusCell">{d.direction||n.Direction||"—"}</td>
    <td className="dimensionsCell">{dimensionText(m)}</td>
    <td className="draftCell">{n.Draft??(d.draftFt!=null?`${d.draftFt.toFixed(1)}'`:"—")}</td>
    <td>{sideToText(m)}</td>
    <td className="aiEta">{d.eta36||"—"}</td>
    <td className="aiEta">{d.eta60||"—"}</td>
    <td className="aiEta">{d.etaICW||"—"}</td>
  </tr>}):<tr><td colSpan="12">No live or scheduled movements in the next 24 hours.</td></tr>}</tbody></table></div></Card>
  <Card title="AI Traffic Recommendation"><div className="recommendation"><div className="eyebrow">INITIAL PLANNING LOGIC</div><h2>Protect the narrowest environmental windows first.</h2><p>LCPTMS now has live structured schedule data. The next layer will compare vessel ETAs against current/tide windows and traffic constraints.</p></div></Card></div>
  <div className="rightCol"><EnvironmentalCard env={env} cam={cam} lb36={lb36} camPred={camPred} loading={loading} err={err}/><Card title="Connection Status"><div className="envList"><Status label="LakeCharlesPilots.com schedule" good={!!schedule?.items?.length} text={schedule?.items?.length?"Live structured feed":"Unavailable"}/><Status label="NOAA PORTS" good={!!env?.sources?.noaa}/><Status label="NWS / KLCH" good={!!env?.sources?.nws}/><Status label="StormGeo" pending text="Pending integration"/></div></Card></div></section>
}
function EnvironmentalOnly({env,cam,lb36,camPred,loading,err}){return <div className="rightCol" style={{maxWidth:760}}><EnvironmentalCard env={env} cam={cam} lb36={lb36} camPred={camPred} loading={loading} err={err}/></div>}
function EnvironmentalCard({env,cam,lb36,camPred,loading,err}){return <Card title="Environmental Conditions" right={loading?"Refreshing…":"60 sec polling"}><div className="envHeroGrid"><EnvHero title="36 BUOY CROSS CURRENT" value={lb36?.display||env?.noaa?.lb36?.display} status={lb36?.trend?.label} timestamp={lb36?.observedLocal} foot="LIVE ONLY • NOAA PORTS"/><EnvHero title="CAMERON CURRENT" value={cam?.actual?.display||env?.noaa?.cameron?.display} status={cam?.actual?.inboundEffect?`INBOUND ${cam.actual.inboundEffect}`:"—"} timestamp={cam?.actual?.observedLocal} foot={cam?.actual?.outboundEffect?`OUTBOUND ${cam.actual.outboundEffect}`:"NOAA PORTS"}/></div><div className="currentCompare"><div><span>ACTUAL</span><b>{cam?.actual?.speedKt!=null?`${cam.actual.speedKt.toFixed(2)} kt ${cam.actual.phase}`:"—"}</b></div><div><span>PREDICTED NOW</span><b>{cam?.predictedNow?.speed!=null?`${cam.predictedNow.speed.toFixed(2)} kt ${cam.predictedNow.phase}`:"—"}</b></div><div><span>RESIDUAL</span><b>{cam?.deviationKt!=null?`${cam.deviationKt>=0?"+":""}${cam.deviationKt.toFixed(2)} kt`:"—"}</b></div></div><CurrentOutlook prediction={camPred}/>{err&&<div className="error">{err}</div>}</Card>}
function CurrentOutlook({prediction}) {
  const pts = (prediction || []).filter(p => p && Number.isFinite(Number(p.speed)));
  if (pts.length < 2) {
    return <div className="outlookEmpty">Cameron 8-hour outlook unavailable</div>;
  }

  const width = 620, height = 210, padL = 42, padR = 14, padT = 18, padB = 38;
  const values = pts.map(p => Number(p.speed));
  const maxY = Math.max(1.0, Math.ceil(Math.max(...values) * 4) / 4);
  const x = i => padL + (i / (pts.length - 1)) * (width - padL - padR);
  const y = v => padT + (1 - (v / maxY)) * (height - padT - padB);
  const path = pts.map((p,i) => `${i===0?"M":"L"} ${x(i).toFixed(1)} ${y(Number(p.speed)).toFixed(1)}`).join(" ");
  const primaryEnd = Math.max(1, Math.round((pts.length - 1) * 0.75));
  const primaryX = x(primaryEnd);

  return (
    <div className="outlookWrap">
      <div className="outlookHead">
        <div><span>CAMERON</span><b>8-HOUR CURRENT OUTLOOK</b></div>
        <div className="outlookLegend"><span className="solidKey"/>0–6 HR PRIMARY <span className="dashKey"/>6–8 HR EXTENDED</div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="outlookChart" role="img" aria-label="Cameron current prediction">
        <rect x={primaryX} y={padT} width={width-padR-primaryX} height={height-padT-padB} className="extendedZone"/>
        {[0, .25, .5, .75, 1].map((f,i)=>{
          const yy = padT + f*(height-padT-padB);
          const label = (maxY*(1-f)).toFixed(2);
          return <g key={i}><line x1={padL} x2={width-padR} y1={yy} y2={yy} className="gridLine"/><text x={4} y={yy+4} className="axisLabel">{label}</text></g>
        })}
        <line x1={primaryX} x2={primaryX} y1={padT} y2={height-padB} className="primaryDivider"/>
        <path d={path} className="predictionLine"/>
        {pts.map((p,i)=><circle key={i} cx={x(i)} cy={y(Number(p.speed))} r="2.5" className="predictionDot"/>)}
        {[0, Math.floor((pts.length-1)/4), Math.floor((pts.length-1)/2), Math.floor((pts.length-1)*3/4), pts.length-1].map((idx,j)=>{
          const raw = pts[idx]?.time || "";
          const hhmm = raw ? raw.slice(11,16) : "";
          return <text key={j} x={x(idx)} y={height-12} textAnchor="middle" className="axisLabel">{hhmm}</text>
        })}
      </svg>
    </div>
  );
}

function Metric({n,label,sub}) {
  return <div className="metric card"><strong>{n}</strong><b>{label}</b><span>{sub}</span></div>;
}

function Card({title,right,children}) {
  return <section className="card"><div className="cardHead"><h3>{title}</h3>{right&&<span>{right}</span>}</div>{children}</section>;
}

function EnvHero({title,value,status,timestamp,foot}) {
  return <div className="envHero">
    <div className="envHeroTitle">{title}</div>
    <div className="envHeroValue">{value || "—"}</div>
    <div className="envHeroStatus">{status || "—"}</div>
    <div className="envHeroTime">{timestamp ? `OBS ${timestamp}` : "OBS —"}</div>
    <div className="envHeroFoot">{foot}</div>
  </div>;
}

function EnvRow({label,value,source,time}) {
  return <div className="envRow">
    <span>{label}</span>
    <b>{value || "—"}{time && <small className="obsTime">OBS {time}</small>}</b>
    <span className="source">{source}</span>
  </div>;
}

function Status({label,good,pending,text}) {
  return <div className="envRow">
    <span>{label}</span>
    <b>{text || (good?"Live":"Unavailable")}</b>
    <span><Dot tone={pending?"yellow":good?"green":"red"}/></span>
  </div>;
}
