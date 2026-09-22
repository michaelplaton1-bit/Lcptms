"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login(){
  const router=useRouter();
  const [key,setKey]=useState("");
  const [error,setError]=useState("");
  const [working,setWorking]=useState(false);

  async function submit(event){
    event.preventDefault();
    setWorking(true);
    setError("");
    try{
      const response=await fetch("/api/admin-auth",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({key})
      });
      if(!response.ok)throw new Error("Invalid admin key");
      const next=new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/")&&!next.startsWith("//")?next:"/");
      router.refresh();
    }catch{
      setError("Admin authorization failed.");
      setWorking(false);
    }
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#05070b",color:"#f7f8fa"}}>
    <form onSubmit={submit} style={{width:"min(420px,100%)",padding:32,border:"1px solid #273143",borderRadius:16,background:"#0d121b",boxShadow:"0 24px 80px rgba(0,0,0,.45)"}}>
      <img src="/lcp-logo.png" alt="Lake Charles Pilots" style={{width:72,height:72,objectFit:"contain",marginBottom:20}}/>
      <h1 style={{fontSize:26,margin:"0 0 8px"}}>LCPTMS Private Access</h1>
      <p style={{color:"#9ca8ba",lineHeight:1.5,margin:"0 0 24px"}}>Enter the LCPTMS admin key to continue.</p>
      <label htmlFor="admin-key" style={{display:"block",fontSize:13,fontWeight:700,marginBottom:8}}>Admin key</label>
      <input id="admin-key" type="password" autoComplete="current-password" value={key} onChange={e=>setKey(e.target.value)} autoFocus required style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",borderRadius:9,border:"1px solid #334158",background:"#080c12",color:"white",fontSize:16}}/>
      {error?<p role="alert" style={{color:"#ff7b7b",margin:"12px 0 0"}}>{error}</p>:null}
      <button type="submit" disabled={working} style={{width:"100%",marginTop:18,padding:"13px 16px",border:0,borderRadius:9,background:"#2f7df6",color:"white",fontSize:15,fontWeight:800,cursor:"pointer",opacity:working?.7:1}}>{working?"Checking…":"Open LCPTMS"}</button>
    </form>
  </main>;
}
