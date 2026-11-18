// Cloudflare Worker: serveste site-ul (folderul public) si API-urile:
//   /api/players - lista (publica), adaugare / editare / stergere (doar administrator)
//   /api/image   - incarcare si afisare fotografii de profil (JPEG)
//   /api/login, /api/logout, /api/me - autentificare administrator
// Totul se salveaza in KV (binding: DATA).
// Oricine poate citi; doar administratorul (parola in secretul ADMIN_PASSWORD) poate modifica.
// Se pastreaza o copie de siguranta ("players-backup") la fiecare modificare.

const KEY = "players";
const BACKUP_KEY = "players-backup";
const MAX_PLAYERS = 300;
const MAX_IMAGE_BYTES = 1500 * 1024;
const UPLOAD_TTL = 24 * 60 * 60;     // fotografia neasociata unui profil dispare dupa 24 de ore
const RETIRE_TTL = 7 * 24 * 60 * 60; // fotografia unui profil sters / inlocuit mai ramane 7 zile
const IMAGE_ID = /^[a-f0-9]{16}$/;

function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(extra || {}) },
  });
}

// ---- Administrator ----
// Parola este secretul ADMIN_PASSWORD din Cloudflare (nu se afla in cod).
// Dupa autentificare, serverul da un cookie semnat (HttpOnly) valabil 30 de zile.
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_FAILS = 8;
const enc = new TextEncoder();

function hmacKey(env) {
  return crypto.subtle.importKey("raw", enc.encode("caiet:" + env.ADMIN_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function toHex(buf) {
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
}
function fromHex(h) {
  return new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
}
function cookie(value, maxAge) {
  return "admin=" + value + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Strict";
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)admin=([0-9]{1,16})\.([a-f0-9]{64})/);
  if (!m || Number(m[1]) < Date.now()) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(env), fromHex(m[2]), enc.encode(m[1]));
}

async function handleLogin(request, env) {
  if (request.method !== "POST") return json({ error: "metoda nepermisa" }, 405);
  if (!env.ADMIN_PASSWORD) return json({ error: "neconfigurat" }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "anon";
  const failKey = "rl:loginfail:" + ip;
  const fails = Number(await env.DATA.get(failKey)) || 0;
  if (fails >= MAX_LOGIN_FAILS) return json({ error: "prea multe incercari" }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "cerere invalida" }, 400); }
  const key = await hmacKey(env);
  const real = await crypto.subtle.sign("HMAC", key, enc.encode("pw:" + env.ADMIN_PASSWORD));
  const ok = await crypto.subtle.verify("HMAC", key, real, enc.encode("pw:" + String((body && body.password) || "").slice(0, 200)));
  if (!ok) {
    await env.DATA.put(failKey, String(fails + 1), { expirationTtl: 900 });
    return json({ error: "parola gresita" }, 401);
  }
  const exp = String(Date.now() + SESSION_MS);
  const sig = toHex(await crypto.subtle.sign("HMAC", key, enc.encode(exp)));
  return json({ admin: true }, 200, { "set-cookie": cookie(exp + "." + sig, SESSION_MS / 1000) });
}

function parse(raw) {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
async function loadRaw(env) {
  return (await env.DATA.get(KEY)) || "[]";
}

function clean(body) {
  const name = String(body.name || "").trim().slice(0, 80);
  const joinDate = String(body.joinDate || "").trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) return null;
  return { name, competitor: body.competitor !== false && body.competitor !== "0", joinDate };
}

// Fotografia devine permanenta (se scoate expirarea).
async function keepImage(env, id) {
  const buf = await env.DATA.get("img:" + id, { type: "arrayBuffer" });
  if (!buf) return false;
  await env.DATA.put("img:" + id, buf);
  return true;
}
// Fotografia nu mai e folosita: ramane 7 zile, apoi dispare.
async function retireImage(env, id) {
  if (!id || !IMAGE_ID.test(id)) return;
  const buf = await env.DATA.get("img:" + id, { type: "arrayBuffer" });
  if (buf) await env.DATA.put("img:" + id, buf, { expirationTtl: RETIRE_TTL });
}

async function handlePlayers(request, env) {
  if (request.method === "GET") {
    const players = parse(await loadRaw(env)).sort((a, b) => String(a.name).localeCompare(String(b.name), "ro"));
    return json({ players });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "cerere invalida" }, 400); }
    body = body || {};
    const fields = clean(body);
    if (!fields) return json({ error: "nume si data obligatorii" }, 400);
    const wantImage = IMAGE_ID.test(String(body.image || "")) ? String(body.image) : "";

    const raw = await loadRaw(env);
    const players = parse(raw);
    let player;
    if (body.id) {
      player = players.find((p) => p.id === body.id);
      if (!player) return json({ error: "profilul nu exista" }, 404);
      const oldImage = player.image || "";
      if (wantImage && wantImage !== oldImage && !(await keepImage(env, wantImage))) {
        return json({ error: "imaginea nu mai exista" }, 400);
      }
      Object.assign(player, fields);
      player.image = wantImage;
      if (oldImage && oldImage !== wantImage) await retireImage(env, oldImage);
    } else {
      if (players.length >= MAX_PLAYERS) return json({ error: "lista este plina" }, 400);
      if (wantImage && !(await keepImage(env, wantImage))) return json({ error: "imaginea nu mai exista" }, 400);
      player = { id: crypto.randomUUID().slice(0, 8), ts: Date.now(), ...fields, image: wantImage };
      players.push(player);
    }
    await env.DATA.put(BACKUP_KEY, raw);
    await env.DATA.put(KEY, JSON.stringify(players));
    return json({ player });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    const raw = await loadRaw(env);
    const players = parse(raw);
    const gone = players.find((p) => p.id === id);
    await env.DATA.put(BACKUP_KEY, raw);
    await env.DATA.put(KEY, JSON.stringify(players.filter((p) => p.id !== id)));
    if (gone && gone.image) await retireImage(env, gone.image);
    return json({ ok: true });
  }

  return json({ error: "metoda nepermisa" }, 405);
}

async function handleImage(request, env, ctx) {
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!IMAGE_ID.test(id)) return new Response("nu exista", { status: 404 });

    const cache = typeof caches !== "undefined" ? caches.default : null;
    const cacheKey = new Request(request.url);
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }
    const buf = await env.DATA.get("img:" + id, { type: "arrayBuffer" });
    if (!buf) return new Response("nu exista", { status: 404 });
    const res = new Response(buf, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
      },
    });
    if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  if (request.method === "POST") {
    const buf = await request.arrayBuffer();
    if (buf.byteLength < 100 || buf.byteLength > MAX_IMAGE_BYTES) return json({ error: "imagine prea mare" }, 413);
    const b = new Uint8Array(buf, 0, 3);
    if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) return json({ error: "doar JPEG" }, 400);
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
    await env.DATA.put("img:" + id, buf, { expirationTtl: UPLOAD_TTL });
    return json({ id });
  }

  return json({ error: "metoda nepermisa" }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/me") return json({ admin: await isAdmin(request, env), configured: !!env.ADMIN_PASSWORD });
    if (path === "/api/logout") return json({ admin: false }, 200, { "set-cookie": cookie("", 0) });
    if (path === "/api/login") {
      if (!env.DATA) return json({ error: "KV lipseste" }, 500);
      return handleLogin(request, env);
    }

    if (path === "/api/players" || path === "/api/image") {
      if (!env.DATA) return json({ error: "KV lipseste" }, 500);
      // Citirea e publica; orice modificare cere administratorul.
      if (request.method !== "GET" && !(await isAdmin(request, env))) return json({ error: "doar administratorul" }, 401);
      return path === "/api/players" ? handlePlayers(request, env) : handleImage(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
