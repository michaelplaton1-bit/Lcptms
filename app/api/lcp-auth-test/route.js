export const dynamic = "force-dynamic";

const BASE = "https://www.lakecharlespilots.com";
const TARGET = `${BASE}/Vessel-Traffic`;

function safeText(s){ return String(s || ""); }

function cookieHeaderFrom(response) {
  // Node/undici may expose getSetCookie(); fall back to a single set-cookie header.
  const h = response.headers;
  const values = typeof h.getSetCookie === "function"
    ? h.getSetCookie()
    : [h.get("set-cookie")].filter(Boolean);

  return values
    .map(v => v.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(...headers) {
  const jar = new Map();
  for (const header of headers) {
    for (const pair of String(header || "").split(";")) {
      const p = pair.trim();
      const eq = p.indexOf("=");
      if (eq <= 0) continue;
      jar.set(p.slice(0,eq), p.slice(eq+1));
    }
  }
  return [...jar].map(([k,v]) => `${k}=${v}`).join("; ");
}

function inputFields(html) {
  const fields = [];
  const re = /<input\b[^>]*>/gi;
  for (const tag of html.match(re) || []) {
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    const type = (tag.match(/\btype=["']([^"']+)["']/i)?.[1] || "text").toLowerCase();
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] || "";
    if (name) fields.push({name,type,value});
  }
  return fields;
}

function formCandidates(html) {
  const forms = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1], body = m[2];
    const action = attrs.match(/\baction=["']([^"']*)["']/i)?.[1] || "";
    const method = (attrs.match(/\bmethod=["']([^"']*)["']/i)?.[1] || "GET").toUpperCase();
    const fields = inputFields(body);
    const hasPassword = fields.some(f => f.type === "password");
    forms.push({action,method,fields,hasPassword});
  }
  return forms;
}

function absoluteUrl(action, fallback) {
  try { return new URL(action || fallback, BASE).toString(); }
  catch { return fallback; }
}

function detectSections(html) {
  const t = safeText(html).toUpperCase();
  return {
    movingSectionFound: t.includes("VESSELS MOVING WITHIN THE VTIS"),
    expectedSectionFound: t.includes("VESSELS EXPECTED TO MOVE"),
    barSectionFound: t.includes("VESSELS ARRIVING OR ANCHORED AT BAR"),
    inPortSectionFound: t.includes("VESSELS IN PORT"),
    notesSectionFound: t.includes(">NOTES<") || t.includes("NOTES AS OF"),
    currentSetSectionFound: t.includes("LC AI CURRENT SET"),
    channelStatusFound: t.includes("CHANNEL STATUS"),
    pilotageServiceFound: t.includes("PILOTAGE SERVICE")
  };
}

export async function GET() {
  const username = process.env.LCP_SCHEDULE_USERNAME;
  const password = process.env.LCP_SCHEDULE_PASSWORD;

  const out = {
    diagnosticVersion: "0.1.0",
    credentialsPresent: !!username && !!password,
    loginPageReached: false,
    loginFormDetected: false,
    loginAttempted: false,
    loginSucceeded: false,
    vesselTrafficAccessible: false,
    authModeDetected: null,
    sections: {},
    notes: []
  };

  if (!username || !password) {
    out.notes.push("Missing LCP_SCHEDULE_USERNAME or LCP_SCHEDULE_PASSWORD in Vercel.");
    return Response.json(out, {status: 500, headers: {"Cache-Control":"no-store"}});
  }

  try {
    // First try target directly. Some sites redirect unauthenticated users to login.
    const first = await fetch(TARGET, {
      redirect: "follow",
      cache: "no-store",
      headers: {"User-Agent":"LCPTMS/0.1 read-only schedule connector"}
    });

    const firstHtml = await first.text();
    let cookies = cookieHeaderFrom(first);

    out.loginPageReached = first.ok;
    out.initialStatus = first.status;
    out.initialFinalPath = new URL(first.url).pathname;

    const initialSections = detectSections(firstHtml);
    if (Object.values(initialSections).some(Boolean)) {
      out.loginSucceeded = true;
      out.vesselTrafficAccessible = true;
      out.authModeDetected = "TARGET_ALREADY_ACCESSIBLE";
      out.sections = initialSections;
      out.notes.push("Vessel Traffic content was accessible without an additional form login in this request.");
      return Response.json(out, {headers:{"Cache-Control":"no-store"}});
    }

    const forms = formCandidates(firstHtml);
    const loginForm = forms.find(f => f.hasPassword);
    out.loginFormDetected = !!loginForm;

    if (!loginForm) {
      out.authModeDetected = "UNKNOWN_OR_EXTERNAL_LOGIN";
      out.notes.push("No password form was detected. Inspect the browser login request in DevTools Network; the site may use an external or JavaScript authentication flow.");
      return Response.json(out, {headers:{"Cache-Control":"no-store"}});
    }

    out.authModeDetected = "HTML_FORM";
    out.loginAttempted = true;

    const params = new URLSearchParams();
    for (const f of loginForm.fields) {
      if (f.type === "hidden" || f.type === "submit") params.set(f.name, f.value);
    }

    const userField = loginForm.fields.find(f =>
      ["text","email"].includes(f.type) &&
      /user|email|login|name/i.test(f.name)
    ) || loginForm.fields.find(f => ["text","email"].includes(f.type));

    const passField = loginForm.fields.find(f => f.type === "password");

    if (!userField || !passField) {
      out.notes.push("Login form found, but username/password field names could not be resolved safely.");
      return Response.json(out, {headers:{"Cache-Control":"no-store"}});
    }

    params.set(userField.name, username);
    params.set(passField.name, password);

    const loginUrl = absoluteUrl(loginForm.action, first.url);
    const login = await fetch(loginUrl, {
      method: loginForm.method === "GET" ? "GET" : "POST",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "User-Agent":"LCPTMS/0.1 read-only schedule connector",
        "Content-Type":"application/x-www-form-urlencoded",
        ...(cookies ? {Cookie:cookies} : {})
      },
      ...(loginForm.method === "GET" ? {} : {body:params.toString()})
    });

    cookies = mergeCookies(cookies, cookieHeaderFrom(login));
    out.loginResponseStatus = login.status;

    // Never expose cookie values, field values, username, or password.
    const target = await fetch(TARGET, {
      redirect:"follow",
      cache:"no-store",
      headers:{
        "User-Agent":"LCPTMS/0.1 read-only schedule connector",
        ...(cookies ? {Cookie:cookies} : {})
      }
    });

    const html = await target.text();
    out.vesselTrafficStatus = target.status;
    out.vesselTrafficAccessible = target.ok;
    out.sections = detectSections(html);

    const foundCount = Object.values(out.sections).filter(Boolean).length;
    out.loginSucceeded = target.ok && foundCount >= 2;
    out.notes.push(
      out.loginSucceeded
        ? "Authenticated Vessel Traffic content detected."
        : "Request completed but authenticated Vessel Traffic sections were not confirmed."
    );

    return Response.json(out, {headers:{"Cache-Control":"no-store"}});
  } catch (e) {
    out.notes.push(`Connector error: ${e?.message || "unknown error"}`);
    return Response.json(out, {status:500, headers:{"Cache-Control":"no-store"}});
  }
}
