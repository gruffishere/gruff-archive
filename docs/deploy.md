# Siteyi yayına alma (ücretsiz)

Bu rehber adım adım gider. Acele yok. Her adımı sen yaparsın. Anahtarları hiçbir dosyaya ya da sohbete yazma. Sadece aşağıda gösterilen kutulara gir.

## 0. GitHub (kodun evi)

GitHub, sitenin dosyalarını saklayan ücretsiz bir yerdir.

1. https://github.com adresinde ücretsiz hesap aç (hesabın varsa giriş yap).
2. **New repository** ile yeni bir depo aç. Adı: `gruff-archive`.
3. Görünürlük: **Public** öneririm. Public depolarda GitHub Actions dakikaları sınırsızdır. Private da çalışır, ama 6 saatlik envanter ücretsiz dakikalarından yer.
4. Depo boş kalsın (README ekleme).
5. Proje klasörü `C:\Users\gruff\gruff-archive`. Dosya Gezgini'nde bu klasörü aç, üstteki adres çubuğuna `cmd` yaz ve Enter'a bas. Klasörde açılmış bir terminal penceresi gelir. Orada sırayla çalıştır:

```
git remote add origin https://github.com/<kullanıcı-adın>/gruff-archive.git
git push -u origin main
```

6. GitHub tarayıcıda giriş yapmanı isteyecek. Giriş yap ve izin ver.
7. Medya dosyaları 363 MB. İlk gönderme birkaç dakika sürer. Bekle, normal.

## 1. OpenSea anahtarı

Anahtar, sitenin OpenSea'dan güncel fiyat ve Gruffters görsellerini çekmesini sağlar.

1. https://docs.opensea.io adresine git. Soldaki menüde **Getting Started** altındaki **API Keys** sayfasını aç (doğrudan adres: https://docs.opensea.io/reference/api-keys). Sayfa farklı görünürse sol üstteki arama kutusuna `API key` yaz. Orada ücretsiz bir anahtar iste (**Request API Key** / **Get API key**). OpenSea hesabınla giriş yapman gerekebilir. Anahtar bir uzun harf-rakam dizisidir; kapatmadan kopyala.
2. GitHub'da deponu aç: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
3. Name: `OPENSEA_API_KEY`
4. Secret kutusuna anahtarı yapıştır ve kaydet.

Anahtar hiçbir dosyaya yazılmaz.

## 2. Envanteri bir kez çalıştır

Envanter, koleksiyonlarını tarayıp listeyi günceller.

1. GitHub'da deponda **Actions** sekmesine git.
2. Soldan **inventory** seç.
3. **Run workflow** düğmesine bas.
4. Bitince Gruffters görselleri ve güncel fiyatlar anahtarla çekilir. Sonuç depoya bir commit olarak düşer.

Bundan sonra bu iş kendiliğinden her 6 saatte bir çalışır.

Site Cloudflare'e bağlandıktan sonra (3. adımdan sonra), ilk envanter çalışması bitince Cloudflare'de projenin **Deployments** sekmesine bak. Yeni bir dağıtımın (deploy) başladığını ya da bittiğini görmelisin. Görmüyorsan Cloudflare'in GitHub deposuna bağlı olduğunu kontrol et.

## 3. Cloudflare Pages

1. https://dash.cloudflare.com adresinde ücretsiz hesap aç (varsa giriş yap).
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. GitHub'a izin ver ve `gruff-archive` deposunu seç.

## 4. Build ayarları

- Framework preset: **Astro**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: boş bırak

Projede `.node-version` dosyası var (içinde `22`). Cloudflare buna bakıp doğru Node sürümünü kendisi seçer. Senin bir şey yapmana gerek yok.

## 5. Yayına al

1. **Save and Deploy** düğmesine bas.
2. İlk build birkaç dakika sürer.
3. Bitince `*.pages.dev` adresin hazır olur.

## 6. OpenSea anahtarını Cloudflare'e de ekle

Proje 5. adımda oluştu. Anahtarın ayarı şurada durur: projenin sayfasında **Settings** → **Variables and Secrets** (Cloudflare bazen "Environment variables" de der).

1. **Add** düğmesine bas.
2. Type: **Secret** seç. Böylece anahtar kaydedildikten sonra ekranda görünmez (şifreli saklanır). Düz "Text" seçme.
3. Variable name: `OPENSEA_API_KEY`, Value: OpenSea anahtarın.
4. Environment (ortam) seçimi aynı sayfadadır: **Production** için ekle. **Preview** için de aynısını ekle (ayrı bir kayıt olarak, aynı adla).
5. Kaydet.
6. Anahtar ancak yeni bir dağıtımda devreye girer. Projenin **Deployments** sekmesinde son dağıtımın yanındaki **⋯** → **Retry deployment** de.

Anahtarı sadece bu kutuya girersin. Repoya yazılmaz.

## 6b. Ziyaretçi notları ("leave gruff a note")

Sitede ziyaretçiler birkaç saniye sonra küçük bir kutuda sana not bırakabilir. Notlar senin Cloudflare hesabında saklanır. Okumak için gizli bir sayfan olur.

1. Cloudflare panelinde **Storage & Databases** → **KV** → **Create a namespace** (Create). Adı: `gruff-notes`.
2. Pages projene git: **Settings** → **Bindings** (Cloudflare bazen **Functions** → **KV namespace bindings** der) → **Add** → **KV namespace**. Variable name: `NOTES` (tam olarak böyle, büyük harfle). Namespace olarak `gruff-notes` seç. **Production** ve **Preview** için ekle.
3. Aynı sayfada **Variables and Secrets** → **Add**. Type: **Secret**. Variable name: `NOTES_KEY`. Value: uzun, kendi seçtiğin bir cümle (örneğin dört beş kelimelik, tahmin edilemez bir cümle). Bunu kimseyle paylaşma ve bir yere not et. Production ve Preview için ekle.
4. Yeni bir dağıtım gerekir: **Deployments** → son dağıtımın yanındaki **⋯** → **Retry deployment**.
5. Bitince `senin-adresin/notes/` sayfasını aç. Anahtar kutusuna `NOTES_KEY` cümlesini yaz ve **open** düğmesine bas. Doğruysa notlar listelenir ve tarayıcın anahtarı hatırlar. Başka bir bilgisayarda bir kez daha yazman gerekir. Unutturmak için sayfadaki **forget key** düğmesine bas.

Bilmen gerekenler:

- Bu sayfa menüde yoktur ve arama motorlarına kapalıdır. Adresini sen bilirsin.
- Notlar senin Cloudflare hesabında kalır. Ücretsiz planın sınırları (günde 1.000 yazma, 100.000 okuma) bir sanat sitesi için çok geniştir.
- IP adresleri hiç kaydedilmez; yalnızca bir saatliğine, tekrar gönderimi sınırlamak için tuzlanmış bir özet tutulur.
- Adımları yapmadan önce kutu görünür ama gönderim "could not send right now" der. Site bunun dışında normal çalışır.

## 7. Kendi domainin

1. Pages projende **Custom domains** → **Set up a custom domain**.
2. Domainini yaz. Cloudflare'in gösterdiği DNS adımlarını izle.
3. Domainin yoksa Cloudflare Registrar'dan alabilirsin. Maliyetine satar. Başka yerden aldığın domaini de kullanabilirsin.

## 8. Sonrası ve ücretsiz sınırlar

- Envanter her 6 saatte bir GitHub'a commit atar. Cloudflare siteyi kendiliğinden yeniden kurar.
- Ücretsiz planda ayda **500 build** hakkı var. Envanter bunun yaklaşık 120'sini kullanır.
- Bir sitede en fazla **20.000 dosya** olabilir. Senin site yaklaşık 7.200 dosya.

## Siteyi kendi bilgisayarında görmek için

1. Proje klasöründe terminal aç.
2. `npm run build`
3. `npm run preview`
4. Tarayıcıda http://localhost:4321 adresini aç.

Canlı fiyat bu önizlemede çalışmaz. Bu normal. Fiyat sadece yayındaki sitede canlı gelir. Önizlemede kayıtlı son fiyat görünür.

## Sorun olursa

- **Build dosya sayısı yüzünden başarısız oldu:** Build kaydında `check-dist` ile başlayan bir mesaj görürsün. Dosya sayısı sınıra yaklaşmış demektir. Bana bu mesajı göster.
- **Fiyat hep eski kalıyor:** Cloudflare'de `OPENSEA_API_KEY` eksik olabilir. 6. adımı kontrol et, sonra projeyi yeniden dağıt (Deployments → Retry deployment).
- **Gruffters görselleri yok:** Envanter henüz anahtarla çalışmamıştır. 1. adımdaki secret'ı kontrol et, sonra 2. adımı yap.
