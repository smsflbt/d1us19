/**
 * Şehit Mehmet Şengül Fen Lisesi — Uygulama Sınavı Gönderim Servisi
 * -----------------------------------------------------------------
 * Bu Cloudflare Worker, öğrencilerin sınav cevaplarını GitHub
 * reposuna güvenli biçimde kaydeder. GitHub erişim anahtarı (token)
 * yalnızca Worker'ın gizli değişkenlerinde durur; öğrenciler göremez.
 *
 * Uç noktalar:
 *   POST   /submit       Öğrenci cevabını repoya yeni dosya olarak yazar
 *   GET    /submissions  (öğretmen şifresi gerekir) Tüm gönderileri listeler
 *   POST   /grade        (öğretmen şifresi gerekir) Puan/notları dosyaya işler
 *   DELETE /submission   (öğretmen şifresi gerekir) Gönderi dosyasını siler
 *
 * Gerekli değişkenler (wrangler.toml [vars] içinde):
 *   REPO_OWNER   Örn: "ogretmenkullaniciadi"
 *   REPO_NAME    Örn: "smsfl-sinav-cevaplari"   (PRIVATE repo önerilir)
 *   REPO_BRANCH  Örn: "main"
 * Gizli değişkenler (wrangler secret put ... ile eklenir, koda YAZILMAZ):
 *   GITHUB_TOKEN      Yalnızca bu repoda Contents: Read and write yetkili token
 *   TEACHER_PASSWORD  Öğretmen paneli şifresi (örn: Smsfl2016!)
 */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "*";
  const allowed = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? origin || "*" : allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Teacher-Password",
    "Access-Control-Max-Age": "86400",
  };
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) },
  });
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function slug(s) {
  return String(s || "ogrenci")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "ogrenci";
}

function gh(env, path, options = {}) {
  return fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "smsfl-sinav-worker",
      ...(options.headers || {}),
    },
  });
}

function repoPath(env, filePath) {
  const branch = env.REPO_BRANCH || "main";
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  return `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${encoded}?ref=${encodeURIComponent(branch)}`;
}

function isTeacher(request, env) {
  const pass = request.headers.get("X-Teacher-Password") || "";
  return env.TEACHER_PASSWORD && pass === env.TEACHER_PASSWORD;
}

async function handleSubmit(request, env) {
  let sub;
  try {
    sub = await request.json();
  } catch (e) {
    return json(request, env, { ok: false, error: "Geçersiz veri (JSON okunamadı)." }, 400);
  }
  if (!sub || !sub.student || !sub.student.name || !sub.student.cls || !sub.student.no || !Array.isArray(sub.answers)) {
    return json(request, env, { ok: false, error: "Eksik bilgi: ad soyad, sınıf ve okul numarası zorunludur." }, 400);
  }
  const body = JSON.stringify(sub, null, 2);
  if (new TextEncoder().encode(body).length > 900000) {
    return json(request, env, { ok: false, error: "Gönderi çok büyük." }, 413);
  }
  const day = String(sub.submittedAt || new Date().toISOString()).slice(0, 10);
  const stamp = Date.now();
  const filePath = `submissions/${day}/${sub.student.no}_${slug(sub.student.name)}_${stamp}.json`;
  const branch = env.REPO_BRANCH || "main";
  const res = await gh(env, repoPath(env, filePath), {
    method: "PUT",
    body: JSON.stringify({
      message: `Sinav gonderisi: ${sub.student.name} (${sub.student.cls}, No: ${sub.student.no})`,
      content: utf8ToBase64(body),
      branch,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json(request, env, { ok: false, error: `GitHub kaydı başarısız (${res.status}). ${detail.slice(0, 180)}` }, 502);
  }
  return json(request, env, { ok: true, path: filePath });
}

async function listSubmissionFiles(env) {
  const branch = env.REPO_BRANCH || "main";
  const res = await gh(env, `/repos/${env.REPO_OWNER}/${env.REPO_NAME}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!res.ok) throw new Error(`GitHub ağaç listesi alınamadı (${res.status}). Repo ve token yetkisini kontrol edin.`);
  const tree = await res.json();
  return (tree.tree || []).filter((x) => x.type === "blob" && x.path.startsWith("submissions/") && x.path.endsWith(".json"));
}

async function handleList(request, env) {
  if (!isTeacher(request, env)) return json(request, env, { ok: false, error: "Öğretmen şifresi hatalı." }, 401);
  try {
    const files = await listSubmissionFiles(env);
    const submissions = [];
    for (const f of files) {
      const res = await gh(env, repoPath(env, f.path));
      if (!res.ok) continue;
      const data = await res.json();
      try {
        const parsed = JSON.parse(base64ToUtf8(data.content || ""));
        parsed.path = f.path;
        submissions.push(parsed);
      } catch (e) { /* bozuk dosya atlanır */ }
    }
    submissions.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
    return json(request, env, { ok: true, submissions });
  } catch (e) {
    return json(request, env, { ok: false, error: e.message }, 502);
  }
}

async function handleGrade(request, env) {
  if (!isTeacher(request, env)) return json(request, env, { ok: false, error: "Öğretmen şifresi hatalı." }, 401);
  let payload;
  try { payload = await request.json(); } catch (e) {
    return json(request, env, { ok: false, error: "Geçersiz veri." }, 400);
  }
  const { path, grades } = payload || {};
  if (!path || !String(path).startsWith("submissions/") || !Array.isArray(grades)) {
    return json(request, env, { ok: false, error: "Geçersiz puan verisi." }, 400);
  }
  const branch = env.REPO_BRANCH || "main";
  const getRes = await gh(env, repoPath(env, path));
  if (!getRes.ok) return json(request, env, { ok: false, error: `Dosya bulunamadı (${getRes.status}).` }, 404);
  const file = await getRes.json();
  let sub;
  try { sub = JSON.parse(base64ToUtf8(file.content || "")); } catch (e) {
    return json(request, env, { ok: false, error: "Dosya içeriği okunamadı." }, 500);
  }
  sub.grades = grades;
  const putRes = await gh(env, repoPath(env, path), {
    method: "PUT",
    body: JSON.stringify({
      message: `Puanlama guncellendi: ${sub.student?.name || path}`,
      content: utf8ToBase64(JSON.stringify(sub, null, 2)),
      sha: file.sha,
      branch,
    }),
  });
  if (!putRes.ok) return json(request, env, { ok: false, error: `Puan kaydedilemedi (${putRes.status}).` }, 502);
  return json(request, env, { ok: true });
}

async function handleDelete(request, env) {
  if (!isTeacher(request, env)) return json(request, env, { ok: false, error: "Öğretmen şifresi hatalı." }, 401);
  let payload;
  try { payload = await request.json(); } catch (e) {
    return json(request, env, { ok: false, error: "Geçersiz veri." }, 400);
  }
  const { path } = payload || {};
  if (!path || !String(path).startsWith("submissions/")) {
    return json(request, env, { ok: false, error: "Geçersiz dosya yolu." }, 400);
  }
  const branch = env.REPO_BRANCH || "main";
  const getRes = await gh(env, repoPath(env, path));
  if (!getRes.ok) return json(request, env, { ok: false, error: `Dosya bulunamadı (${getRes.status}).` }, 404);
  const file = await getRes.json();
  const delRes = await gh(env, repoPath(env, path), {
    method: "DELETE",
    body: JSON.stringify({ message: `Gonderi silindi: ${path}`, sha: file.sha, branch }),
  });
  if (!delRes.ok) return json(request, env, { ok: false, error: `Silinemedi (${delRes.status}).` }, 502);
  return json(request, env, { ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === "/submit" && request.method === "POST") return await handleSubmit(request, env);
      if (url.pathname === "/submissions" && request.method === "GET") return await handleList(request, env);
      if (url.pathname === "/grade" && request.method === "POST") return await handleGrade(request, env);
      if (url.pathname === "/submission" && request.method === "DELETE") return await handleDelete(request, env);
      if (url.pathname === "/" || url.pathname === "/health") {
        return json(request, env, { ok: true, service: "smsfl-sinav-worker", repo: `${env.REPO_OWNER}/${env.REPO_NAME}` });
      }
      return json(request, env, { ok: false, error: "Bilinmeyen adres." }, 404);
    } catch (e) {
      return json(request, env, { ok: false, error: "Sunucu hatası: " + e.message }, 500);
    }
  },
};
