"use client";

import { useEffect, useMemo, useState } from "react";

const WAYPOINTS = [
  "CC Buoy","2B Buoy","8 Buoy","18 Buoy","27/28 Buoy","36 Buoy",
  "60 Beacon","81/82 Beacon","Calcasieu ICW","104 Beacon (New Cut)",
  "110 Beacon (Clifton Ridge)","A4 Anchorage","I-210 Bridge",
  "City Docks (CD-9 / 119)","I-10 Bridge"
];

const MOVES = [
  { vessel:"HLAITAN", type:"Bulk", draft:"35.2'", dir:"Outbound", eta:"15:55", next:"36 Buoy", risk:"Low", tone:"green" },
  { vessel:"MAGNOLIA STATE", type:"Tanker", draft:"28.1'", dir:"Shift", eta:"16:30", next:"60 Beacon", risk:"Watch", tone:"yellow" },
  { vessel:"INFINITY K", type:"Bulk", draft:"36.8'", dir:"Inbound", eta:"17:00", next:"CC Buoy", risk:"Low", tone:"green" },
  { vessel:"ANGERONA", type:"Tanker", draft:"39.5'", dir:"Inbound", eta:"19:00", next:"CC Buoy", risk:"Tide", tone:"yellow" }
];

function Dot({tone="green"}) {
  return <span className={`dot ${tone}`} />;
}

export default function Home() {
  const [env, setEnv] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const [res,sr]=await Promise.all([fetch("/api/environment",{cache:"no-store"}),fetch("/api/schedule",{cache:"no-store"})]);
      const [data,sd]=await Promise.all([res.json(),sr.json()]);
      if(!res.ok)throw new Error(data?.error||"Unable to load environmental feeds");
      if(!sr.ok)throw new Error(sd?.error||"Unable to load schedule model");
      setEnv(data); setSchedule(sd);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => setClock(new Date()), 30000);
    const r = setInterval(load, 60000);
    return () => { clearInterval(t); clearInterval(r); };
  }, []);

  const timeText = useMemo(() =>
    new Intl.DateTimeFormat("en-US", {
      timeZone:"America/Chicago",
      weekday:"short",
      month:"short",
      day:"numeric",
      hour:"2-digit",
      minute:"2-digit",
      hourCycle:"h23",
      timeZoneName:"short"
    }).format(clock), [clock]);

  const lb36 = env?.noaa?.operational?.lb36;
  const cam = env?.noaa?.operational?.cameron;
  const camPred = Array.isArray(cam?.prediction) ? cam.prediction : [];
  const modeledMoves=Array.isArray(schedule?.items)?schedule.items:[];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">⚓</div>
          <div><b>LCPTMS</b><span>Lake Charles Pilots</span></div>
        </div>
        <nav>
          {["Dashboard","Live Traffic","Expected to Move","Arrivals at Bar","In Port","Environmental","Traffic Plan (AI)","What-If Analysis","Hurricane Monitor","Channel / ATON","Notes & Alerts","Reports"].map((x,i)=>
            <a key={x} className={i===0?"active":""} href="#">{x}</a>
          )}
        </nav>
        <div className="sidebarFoot">
          <div className="avatar">MP</div>
          <div><b>Read-only prototype</b><span>lcptms.vercel.app</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>Lake Charles Pilots</h1>
            <p>Traffic Management System</p>
          </div>
          <div className="topStats">
            <div className="topStat"><b>{timeText}</b><span>Lake Charles Local</span></div>
            <div className="topStat"><b><Dot/> Channel Open</b><span>Normal Operations</span></div>
            <button className="iconBtn" onClick={load}>↻</button>
          </div>
        </header>

        <div className="tabs">
          <button className="active">Overview</button>
          <button>Waterway</button>
          <button>Schedule</button>
          <button>Environmental</button>
          <button>AI Insights</button>
        </div>

        <section className="mainGrid">
          <div className="leftCol">
            <div className="metrics">
              <Metric n="2" label="Vessels in VTIS" sub="Moving within region"/>
              <Metric n="14" label="Expected to Move" sub="Next 24 hours"/>
              <Metric n="18" label="At or Near the Bar" sub="Arriving / Anchored"/>
              <Metric n="10" label="Vessels in Port" sub="All facilities"/>
            </div>

            <Card title="Live / Upcoming Traffic" right={schedule?.environmentConnected?"ETA + NOAA LINKED":"Loading"}>
              <div className="tableWrap"><table><thead><tr><th>Vessel</th><th>Dir</th><th>Draft</th><th>Berth</th><th>PBT</th><th>36 ETA</th><th>Cameron @ ETA</th><th>Effect</th><th>60 ETA</th><th>ICW ETA</th><th>Flags</th></tr></thead>
              <tbody>{modeledMoves.length?modeledMoves.map((m,i)=><tr key={i}><td className="vessel">{m.display?.vessel||"—"}</td><td>{m.display?.direction||"—"}</td><td>{m.display?.draftFt!=null?`${m.display.draftFt.toFixed(1)}'`:"—"}</td><td>{m.display?.berth||"—"}</td><td>{m.display?.pbt||"—"}</td><td>{m.display?.eta36||"—"}</td><td>{m.display?.cameronPrediction||"—"}</td><td><span className="risk"><Dot tone={m.display?.cameronEffect==="OPPOSING"?"yellow":"green"}/>{m.display?.cameronEffect||"—"}</span></td><td>{m.display?.eta60||"—"}</td><td>{m.display?.etaICW||"—"}</td><td>{(m.display?.flags||[]).join(", ")||"—"}</td></tr>):<tr><td colSpan="11">Loading…</td></tr>}</tbody></table></div>
            </Card>

            <Card title="AI Traffic Recommendation">
              <div className="recommendation">
                <div className="eyebrow">INITIAL PLANNING LOGIC</div>
                <h2>Protect the narrowest environmental windows first.</h2>
                <p>
                  Once the private schedule connector is authenticated, the optimization layer will combine
                  vessel class, berth, draft, waypoint ETAs, NOAA current/tide, weather, Standards of Care,
                  tug/pilot constraints, and historical pilot discretion.
                </p>
                <div className="actions">
                  <button className="primary">Run What-If</button>
                  <button>View Inputs</button>
                </div>
              </div>
            </Card>

            <Card title="Key Waypoints">
              <div className="waypoints">
                {WAYPOINTS.map((w,i)=><div className="waypoint" key={w}>
                  <span className="wayDot"/><span>{w}</span><span className="muted">{i===0?"Start":"—"}</span>
                </div>)}
              </div>
            </Card>
          </div>

          <div className="rightCol">
            <Card title="Environmental Conditions" right={loading ? "Refreshing…" : "60 sec polling"}>
              <div className="envHeroGrid">
                <EnvHero
                  title="36 BUOY CROSS CURRENT"
                  value={lb36?.display || env?.noaa?.lb36?.display}
                  status={lb36?.trend?.label}
                  timestamp={lb36?.observedLocal}
                  foot="LIVE ONLY • NOAA PORTS"
                />
                <EnvHero
                  title="CAMERON CURRENT"
                  value={cam?.actual?.display || env?.noaa?.cameron?.display}
                  status={cam?.actual?.inboundEffect ? `INBOUND ${cam.actual.inboundEffect}` : "—"}
                  timestamp={cam?.actual?.observedLocal}
                  foot={cam?.actual?.outboundEffect ? `OUTBOUND ${cam.actual.outboundEffect}` : "NOAA PORTS"}
                />
              </div>

              <div className="currentCompare">
                <div>
                  <span>ACTUAL</span>
                  <b>{cam?.actual?.speedKt != null ? `${cam.actual.speedKt.toFixed(2)} kt ${cam.actual.phase}` : "—"}</b>
                </div>
                <div>
                  <span>PREDICTED NOW</span>
                  <b>{cam?.predictedNow?.speed != null ? `${cam.predictedNow.speed.toFixed(2)} kt ${cam.predictedNow.phase}` : "—"}</b>
                </div>
                <div>
                  <span>RESIDUAL</span>
                  <b>{cam?.deviationKt != null ? `${cam.deviationKt >= 0 ? "+" : ""}${cam.deviationKt.toFixed(2)} kt` : "—"}</b>
                </div>
              </div>

              <CurrentOutlook prediction={camPred} />

              <div className="envList">
                <EnvRow label="Cameron / Calcasieu Pass Wind"
                  value={env?.noaa?.wind?.display}
                  source="NOAA PORTS"
                  time={env?.noaa?.wind?.observedLocal}/>
                <EnvRow label="Lake Charles Regional Wind"
                  value={env?.nws?.wind?.display}
                  source="NWS / KLCH"
                  time={env?.nws?.wind?.observedLocal}/>
                <EnvRow label="KLCH Visibility"
                  value={env?.nws?.visibility?.display}
                  source="NWS"
                  time={env?.nws?.observedLocal}/>
                <EnvRow label="Calcasieu Pass Water Level"
                  value={env?.noaa?.waterLevel?.display}
                  source="NOAA"
                  time={env?.noaa?.waterLevel?.observedLocal}/>
                <EnvRow label="Hurricane Status" value={env?.nhc?.display} source="NHC"/>
                <EnvRow label="StormGeo WC-181 / WC-62" value={env?.stormgeo?.display || "Credentials required"} source="StormGeo"/>
              </div>
              {err && <div className="error">{err}</div>}
            </Card>

            <Card title="Waterway Overview">
              <div className="map">
                <div className="route"/>
                {[12,30,48,66,84].map((t,i)=><span key={i} className="marker" style={{top:`${t}%`,left:`${57-i*2}%`}}/>)}
                <div className="mapLabel l1">I-10 / City Docks</div>
                <div className="mapLabel l2">I-210</div>
                <div className="mapLabel l3">ICW</div>
                <div className="mapLabel l4">60 / 36</div>
                <div className="mapLabel l5">CC Buoy</div>
              </div>
            </Card>

            <Card title="Connection Status">
              <div className="envList">
                <Status label="NOAA PORTS" good={!!env?.sources?.noaa}/>
                <Status label="NOAA Wind" good={!!env?.sources?.noaaWind}/>
                <Status label="NOAA Cameron Prediction" good={!!env?.sources?.noaaPredictions}/>
                <Status label="NWS / KLCH" good={!!env?.sources?.nws}/>
                <Status label="National Hurricane Center" good={!!env?.sources?.nhc}/>
                <Status label="StormGeo" pending text="Pending credentials"/>
                <Status label="LakeCharlesPilots.com schedule" pending text="Pending read-only integration"/>
              </div>
            </Card>
          </div>
        </section>

        <div className="commandBar">
          <button>＋</button>
          <input placeholder="Ask about the schedule, vessels, weather, or run a what-if…"/>
          <button>→</button>
        </div>
      </main>
    </div>
  );
}

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
