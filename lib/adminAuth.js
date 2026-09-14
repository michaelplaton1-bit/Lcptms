import crypto from "crypto";

const COOKIE_NAME="lcptms_admin";

function hash(v){
  return crypto.createHash("sha256").update(String(v||"")).digest("hex");
}
export function adminConfigured(){
  return !!process.env.LCPTMS_ADMIN_KEY;
}
export function expectedAdminCookie(){
  return adminConfigured()?hash(process.env.LCPTMS_ADMIN_KEY):null;
}
function parseCookies(header){
  const out={};
  for(const part of String(header||"").split(";")){
    const i=part.indexOf("=");
    if(i<0)continue;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
export function isAdminRequest(request){
  const expected=expectedAdminCookie();
  if(!expected)return false;
  const cookies=parseCookies(request?.headers?.get?.("cookie"));
  const got=cookies[COOKIE_NAME];
  if(!got||got.length!==expected.length)return false;
  try{return crypto.timingSafeEqual(Buffer.from(got),Buffer.from(expected));}catch{return false;}
}
export function adminCookieHeader(){
  return `${COOKIE_NAME}=${expectedAdminCookie()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}
export function clearAdminCookieHeader(){
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
export function adminKeyMatches(key){
  if(!adminConfigured())return false;
  const a=hash(key), b=hash(process.env.LCPTMS_ADMIN_KEY);
  try{return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}catch{return false;}
}
export function learningCaptureAuthorized(request){
  if(isAdminRequest(request))return true;
  const secret=process.env.LCPTMS_LEARNING_SECRET;
  if(!secret)return false;
  return request?.headers?.get?.("authorization")===`Bearer ${secret}`;
}
