# Şehit Mehmet Şengül Fen Lisesi — 9. Sınıf BTY Uygulama Sınavı

**1. Dönem 1. Uygulama Sınavı** (Programlamaya Giriş ve Algoritma) için web sayfaları:

| Dosya | Açıklama |
|---|---|
| `index.html` | 🎯 **Hazırlık / çalışma sayfası** — örnek çözümler, "Şimdi Sıra Sende" modu ve otomatik değerlendirme |
| `uygsnavi9.html` | 📝 **Uygulama sınavı sayfası** — örnek cevap yoktur; öğrenci gönderince cevaplar kilitlenir |
| `worker/` | ☁️ **Gönderim servisi** (Cloudflare Worker) — cevapları GitHub private reposuna güvenli kaydeder |
| `KURULUM.md` | 📖 Adım adım kurulum yönergesi (GitHub + Cloudflare) |

## Hızlı başlangıç

1. Bu repoyu GitHub'da yayınlayın (Settings → Pages → main / root).
2. Cevapların GitHub'da saklanması için **`KURULUM.md`** dosyasındaki adımları izleyin
   (private cevap reposu + token + Worker + `uygsnavi9.html` içinde `WORKER_URL` ayarı).
3. Sınav adresi: `https://KULLANICI.github.io/REPO/uygsnavi9.html`

## Nasıl çalışır?

- **Hazırlık sayfası:** Öğrenci önce örnek (dolu) çözümleri inceler, sonra boş ekranda
  kendisi çözüp anında geri bildirim alır. Kimlik bilgisi gerekmez.
- **Sınav sayfası:** Öğrenci 3 senaryoda GİÇ tablosu → algoritma → sözde kod → akış
  şeması adımlarını tamamlar. "Cevapları Gönder"de ad-soyad/sınıf/okul no istenir;
  gönderilen cevap **GitHub reposuna dosya olarak kaydedilir ve öğrenci ekranında kilitlenir.**
- **Öğretmen paneli** (sınav sayfasında, şifreli): Tüm gönderileri listeler; her senaryoda
  4 başlığı 25'er puan üzerinden puanlama + not yazma imkânı verir. Puanlar da repodaki
  dosyaya işlenir. CSV/JSON dışa aktarım desteklenir.
