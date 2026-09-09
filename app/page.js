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
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/environment", { cache:"no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Unable to load environmental feeds");
      setEnv(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => setClock(new Date()), 30000);
    const r = setInterval(load, 300000);
    return () => { clearInterval(t); clearInterval(r); };
  }, []);

  const timeText = useMemo(() =>
    new Intl.DateTimeFormat("en-US", {
      timeZone:"America/Chicago", weekday:"short", month:"short", day:"numeric",
      hour:"2-digit", minute:"2-digit"
    }).format(clock), [clock]);

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
          <div><b>Read-only prototype</b><span>traffic.lcptms.com</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>Lake Charles Pilots</h1>
            <p>Traffic Management System</p>
          </div>
          <div className="topStats">
            <div className="topStat"><b>{timeText}</b><span>Central Time</span></div>
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

            <Card title="Live / Upcoming Traffic">
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Vessel</th><th>Type</th><th>Draft</th><th>Direction</th><th>PBT / ETA</th><th>Next Point</th><th>Risk</th></tr></thead>
                  <tbody>
                    {MOVES.map(m => <tr key={m.vessel}>
                      <td className="vessel">{m.vessel}</td><td>{m.type}</td><td>{m.draft}</td>
                      <td>{m.dir}</td><td>{m.eta}</td><td>{m.next}</td>
                      <td><span className="risk"><Dot tone={m.tone}/>{m.risk}</span></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
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
            <Card title="Environmental Conditions" right={loading ? "Refreshing…" : "Live public feeds"}>
              <div className="envList">
                <EnvRow label="LB 36 Current" value={env?.noaa?.lb36?.display} source="NOAA"/>
                <EnvRow label="Cameron Fishing Pier" value={env?.noaa?.cameron?.display} source="NOAA"/>
                <EnvRow label="Calcasieu Pass Water Level" value={env?.noaa?.waterLevel?.display} source="NOAA"/>
                <EnvRow label="Wind (KLCH)" value={env?.nws?.wind?.display} source="NWS"/>
                <EnvRow label="Visibility (KLCH)" value={env?.nws?.visibility?.display} source="NWS"/>
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

function Metric({n,label,sub}) {
  return <div className="metric card"><strong>{n}</strong><b>{label}</b><span>{sub}</span></div>
}
function Card({title,right,children}) {
  return <section className="card"><div className="cardHead"><h3>{title}</h3>{right&&<span>{right}</span>}</div>{children}</section>
}
function EnvRow({label,value,source}) {
  return <div className="envRow"><span>{label}</span><b>{value || "—"}</b><span className="source">{source}</span></div>
}
function Status({label,good,pending,text}) {
  return <div className="envRow"><span>{label}</span><b>{text || (good?"Live":"Unavailable")}</b><span><Dot tone={pending?"yellow":good?"green":"red"}/></span></div>
}