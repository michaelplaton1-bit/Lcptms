import { NextResponse } from "next/server";

const ADMIN_COOKIE="lcptms_admin";

async function sha256(value){
  const bytes=new TextEncoder().encode(String(value||""));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}

function safeEqual(a,b){
  if(!a || !b || a.length!==b.length)return false;
  let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}

export async function middleware(request){
  const {pathname,search}=request.nextUrl;

  if(pathname==="/login" || pathname==="/api/admin-auth"){
    return NextResponse.next();
  }

  const learningSecret=process.env.LCPTMS_LEARNING_SECRET;
  const bearer=request.headers.get("authorization");
  if(learningSecret && safeEqual(bearer,`Bearer ${learningSecret}`)){
    return NextResponse.next();
  }

  const adminKey=process.env.LCPTMS_ADMIN_KEY;
  const cookie=request.cookies.get(ADMIN_COOKIE)?.value;
  const authorized=adminKey && cookie && safeEqual(cookie,await sha256(adminKey));
  if(authorized)return NextResponse.next();

  if(pathname.startsWith("/api/")){
    return NextResponse.json({error:"Admin authorization required"},{status:401});
  }

  const login=request.nextUrl.clone();
  login.pathname="/login";
  login.search="";
  login.searchParams.set("next",`${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config={
  matcher:["/((?!_next/static|_next/image|favicon.ico|lcp-logo.png).*)"]
};
