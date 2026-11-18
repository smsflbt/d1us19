# Kurulum Yönergesi — Sınav Cevaplarını GitHub'da Saklama

Bu repo iki parçadan oluşur:

1. **Web sayfaları** (bu repo, GitHub Pages ile yayınlanır)
   - `index.html` → Hazırlık / çalışma sayfası
   - `uygsnavi9.html` → Uygulama sınavı sayfası
2. **Gönderim servisi** (`worker/` klasörü, Cloudflare Worker)
   - Öğrenci "Cevapları Gönder"e basınca cevapları **gizli bir cevaplari** reposuna dosya olarak yazar.
   - GitHub anahtarı (token) yalnızca Worker'da gizli durur; **öğrenciler göremez, cevapları silemez/değiştiremez.**

Mimari:

```
Öğrenci tarayıcı ──► uygsnavi9.html (GitHub Pages)
                          │  "Cevapları Gönder"
                          ▼
                   Cloudflare Worker ──(gizli token)──► GitHub PRIVATE repo
                                                            submissions/2026-11-20/125-ayse-....json
Öğretmen paneli ──► Worker ──► aynı repodan cevapları + puanları okur/yazar
```

---

## Adım 1 — İki GitHub reposu oluşturun

GitHub'da:

1. **`smsfl-sinav-sayfasi`** (Public) — bu klasörün içeriğini buraya yükleyeceksiniz; sayfalar buradan yayınlanacak.
2. **`smsfl-sinav-cevaplari`** (**Private** ✔) — öğrenci cevapları burada saklanacak. İçine ilk commit için bir `README` ekleyerek oluşturun (boş repo Worker'ın yazması için uygun değildir; README'li oluşturun).

> Neden ayrı private repo? Cevaplarda ad-soyad ve okul numarası var; public repoda herkes görebilir. Sayfa altyapısı public, cevaplar private olmalı.

## Adım 2 — GitHub erişim anahtarı (token) oluşturun

1. GitHub → profil fotoğrafı → **Settings** → en altta **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Ayarlar:
   - **Token name:** `smsfl-sinav-worker`
   - **Expiration:** sınav dönemini kapsayan bir tarih
   - **Repository access:** *Only select repositories* → yalnızca **`smsfl-sinav-cevaplari`** reposunu seçin
   - **Permissions → Repository permissions → Contents:** **Read and write**
   - (Metadata: Read otomatik seçilir)
3. Token'ı üretip **kopyalayın**. Bu token'ı **hiçbir dosyaya yazmayın**, kimseyle paylaşmayın; yalnızca Adım 3'te Worker'a gizli değişken olarak gireceksiniz.

## Adım 3 — Cloudflare Worker'ı kurun

Bilgisayarınızda (Node.js kurulu olmalı):

```bash
cd worker
npm install -g wrangler        # ilk kez
npx wrangler login             # Cloudflare hesabıyla giriş (ücretsiz plan yeterli)

# wrangler.toml içindeki REPO_OWNER ve REPO_NAME değerlerini düzenleyin:
#   REPO_OWNER = sizin GitHub kullanıcı adınız
#   REPO_NAME  = smsfl-sinav-cevaplari

npx wrangler secret put GITHUB_TOKEN       # Adım 2'deki token'ı yapıştırın
npx wrangler secret put TEACHER_PASSWORD   # Öğretmen paneli şifreniz (örn: Smsfl2016!)

npx wrangler deploy
```

Deploy sonunda adres verilir, örn: `https://smsfl-sinav-api.KULLANICI.workers.dev`
Adresi tarayıcıda açın; `{"ok":true,...}` görüyorsanız servis çalışıyor demektir.

## Adım 4 — Worker adresini sınav sayfasına işleyin

`uygsnavi9.html` dosyasının sonlarına doğru şu bölüm var:

```js
window.SINAV_CONFIG = { WORKER_URL: "" };
```

İçine Worker adresinizi yazın:

```js
window.SINAV_CONFIG = { WORKER_URL: "https://smsfl-sinav-api.KULLANICI.workers.dev" };
```

Değişikliği sayfa reposuna commit edin.

> ⚠️ `WORKER_URL` boş bırakılırsa sınav sayfası eski davranışa döner: cevaplar yalnızca öğrencinin kendi cihazına kaydedilir, GitHub'a gönderilmez ve sayfa bunu öğrenciye açıkça söyler.

## Adım 5 — Sayfayı yayınlayın (GitHub Pages)

Sayfa reposunda: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root) → Save**

Birkaç dakika sonra adresiniz hazır olur:

- Çalışma sayfası: `https://KULLANICI.github.io/smsfl-sinav-sayfasi/`
- **Sınav sayfası:** `https://KULLANICI.github.io/smsfl-sinav-sayfasi/uygsnavi9.html`

## Adım 6 — Sınavdan önce mutlaka deneyin

1. Sınav sayfasını açın, sahte bir öğrenci gibi 1-2 cevap yazıp **Cevapları Gönder** deyin (test kimliği kullanın).
2. Private cevap reposunda `submissions/<tarih>/` altında dosyanızın oluştuğunu görün.
3. **Öğretmen Paneli**ne şifrenizle girin: test gönderisi listede olmalı; bir başlığa puan verin ve repodaki dosyada `grades` alanının güncellendiğini kontrol edin.
4. Test gönderisini panelden silin.

## Sorun giderme

| Belirti | Olası neden |
|---|---|
| Öğrencide "Gönderim BAŞARISIZ" | `WORKER_URL` yanlış/boş, Worker deploy edilmemiş ya da internet yok. Cevap kilitlenmez; öğrenci tekrar deneyebilir. |
| Worker adresi `{"ok":false...GitHub kaydı başarısız (401/404)` | Token yanlış, süresi dolmuş ya da yanlış repoya yetki verilmiş. |
| Öğretmen paneli "GitHub deposundan gönderiler alınamadı (401)" | Panel şifresi ile Worker'daki `TEACHER_PASSWORD` gizli değişkeni aynı değil. |
| Panel boş görünüyor | Gönderiler farklı bir repoya/branch'e yazılıyor olabilir; `wrangler.toml` değerlerini kontrol edin. |

## Güvenlik notları

- Token'ı asla HTML/JS dosyalarına, bu repoya ya da öğrencilerle paylaşılan bir yere yazmayın.
- Öğretmen şifresi yalnızca panel kapısıdır; asıl güvenlik, token'ın Worker'da gizli olmasıdır.
- Sınav dönemi bitince token'ı GitHub'dan **revoke** edebilirsiniz (Developer settings → token → Revoke).
