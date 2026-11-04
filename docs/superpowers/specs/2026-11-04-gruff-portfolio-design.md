# gruff — portföy sitesi tasarımı

Tarih: 2026-11-04 · Durum: kullanıcı onayı bekliyor

## 1. Amaç

gruff'ın (gruffdzn.eth) bütün NFT işlerini ve birkaç deneysel işini tek bir çatı altında toplayan kişisel bir arşiv sitesi kurulacak. Siteye giren kişi gruff'ın estetiğini ve vibe'ını hissetmeli. Her eserin zincir üstü bilgileri yer almalı (kontrat, sahip, tarihler, fiyatlar, linkler), ama bunlar bağırmamalı; müze etiketi sakinliğinde sunulmalı.

**Başarı ölçütleri**

- Yeni bir mint, kimse elle bir şey yapmadan en geç 6 saat içinde sitede görünür. Mevcut bir koleksiyona eklenen token'lar kendiliğinden gelir; yeni bir koleksiyon için ayar dosyasına tek satır eklemek yeterlidir.
- Domain dışında düzenli hiçbir ödeme yoktur: barındırma, veri ve API'lerin hepsi ücretsiz katmanlarda çalışır.
- Bir dış kaynak çöktüğünde (IPFS gateway'i, phigures.art, gruffters.gg, OpenSea) site kararmaz; son sağlam veriyi göstermeye devam eder.
- Site mobilde masaüstündeki kadar iyi çalışır.
- Sitenin tamamı İngilizcedir.

## 2. Katalog

Ana cüzdan: `0x4730497622bDFd6EAFe1F09Fa22B3A0ACA94a646` (gruffdzn.eth). Base zinciri ve başka cüzdanlar kapsam dışıdır.

Index'te 16 koleksiyon yer alır. Envanter kodu, koleksiyon bir kez yayınlandıktan sonra **hiç değişmez**.

| Kod | Koleksiyon | Kontrat | Platform / standart | İlk mint |
|---|---|---|---|---|
| ANT | Antique by Gruff | 0x8c94b846bb90f4a1c1c77b6baca2be7be1507dab | Manifold · ERC-1155 | 2023-01 |
| BLS | BLAST | 0xbd2d5d9fbb00aabb8a2b7a4951cbdfeb459265b4 | Manifold · ERC-1155 | 2023-01 |
| PPC | Pepe Club | 0x6f348237a913e75557b6c1dd2c024c2580975636 | Manifold · ERC-1155 | 2023-01 |
| VBS | Vibes & Times | 0x0e64f1665b86bf3579148321d31cd7fde44cbc0d | Manifold · ERC-1155 | 2023-01 |
| GFT | Gift Editions by Gruff | 0x8ee9ffa0cf643f5bfc4b0046c12cb5036d8f802f | Manifold · ERC-1155 | 2023-01 |
| CLB | Gruff's Collabs | 0x258f44d4ebe9f74481eedb6177b1d53f97128e1c | Manifold · ERC-1155 | 2023-01 |
| ONE | 1/1's by Gruff | 0xda6388ca494c1f9920b679ee79d78548907e7ed2 | Foundation · ERC-721 | 2023-02 |
| ICN | ICON's by Gruff | 0x4b5599f580dc09db8ac3c7cbe650137d871d3ae1 | Foundation · ERC-721 | 2023-02 |
| SLV | SILVER SURFER | 0x3be88adf4d68c32bad5707588c7d25e1af8644e0 | Manifold · ERC-721 | 2023-03 |
| ESS | ESSENCE | 0xf808228c5dd6e5b0a8f80c55c83c54f5520d15d5 | Manifold · ERC-721 | 2023-04 |
| GRT | Gruffters | 0x72b1f41c1afc5cc7e68071753967902138b51bb2 | özel kontrat · ERC-721 (ilk generative iş, Grifters'tan esinlenmiş) | 2023-10 |
| OVS | oversimulated | 0x685ec110408cede874604f75ff9ccbd297ccde21 | Transient · ERC-721 | 2025-04 |
| 366 | The Memes #366 "WORTHLESS" | 0x33FD426905F149f8376e227d0C9D3340AaD17aF1, token 366 | 6529 · ERC-1155 | 2025-05 |
| SUB | subsimulated | 0x5b5a4bcaedf305a6c85f83486a907a188224efa8 | Transient · ERC-1155 | 2025-06 |
| PHG | Phigures | 0xcbbca0a0871a4f2a5567940c38a5c7fd6fbb6480 | on-chain · ERC-721 | 2026-05 |
| FCT | FACETS | 0xa219558e037063879315d6c0dc37aa29e1ed9f07 | on-chain · ERC-721 (2.222 arz) | 2026-09 |

**Experiments** bölümüne şimdilik OVVN (`0x11dd77cfda1ffa289522f028977fbfc0fc0fce67`, on-chain, 2026-09) girer. 6529 dive bar submission'ı ve diğer deneyler en son fazda kullanıcıyla birlikte belirlenecek.

**Envanter numarası:** `GRF.<YY>.<KOD>.<token>`, örneğin `GRF.23.SLV.002`. YY koleksiyonun ilk mint yılıdır. Token numarası sıfırla doldurulur: genişlik, koleksiyondaki en büyük id'nin basamak sayısıdır ama en az 3 olur. Tek token'lı koleksiyonlarda token eki yazılmaz; örneğin #366 için `GRF.25.366`.

## 3. Mimari (sıfır düzenli maliyet)

```
GitHub repo ──(her 6 saatte: GitHub Actions)──► indexer (Node)
                                                  │  Blockscout · Ethereum RPC · 6529 API · OpenSea API (ücretsiz anahtar)
                                                  ▼
                                   data/catalog/*.json  +  public/media/*  (commit)
                                                  │
                                                  ▼
                                 Astro build ──► Cloudflare Pages (statik)
                                                  │
                     eser sayfası açılınca ──► /api/listing (Pages Function) ──► OpenSea best listing
```

- **Site:** Astro ile statik üretilir ve Cloudflare Pages'te barınır. Cloudflare Pages ücretsizdir, trafik limiti yoktur ve ticari kullanıma izin verir. Sayfalarda ağır bir framework olmaz; etkileşim için küçük, düz TypeScript betikleri kullanılır.
- **Indexer:** `scripts/indexer/` altındaki bir Node betiğidir. GitHub Actions'ta 6 saatte bir ve elle tetiklenerek çalışır. Ürettiği veri değiştiyse commit atar, bu da Cloudflare'de yeni bir build başlatır.
- **Canlı listed fiyat:** `functions/api/listing.ts` bir Cloudflare Pages Function'dır (ücretsiz katmanda günde 100 bin istek). OpenSea anahtarı sunucuda kalır. Yanıtlar 60 saniye önbelleklenir.
- **Visitors' book arka ucu:** `workers/room` adlı ayrı bir Cloudflare Worker'dır. İçinde tek bir Durable Object bulunur (SQLite depolama ve WebSocket hibernation); bunlar Workers Free planında ücretsizdir. Site `/api/room/*` ve `/api/verified` yollarını bu Worker'a yönlendirir.
- **Kullanıcının yapacakları:** Bir GitHub hesabı ve repo, bir Cloudflare hesabı, ücretsiz bir OpenSea API anahtarı ve WalletConnect için ücretsiz bir Reown proje kimliği edinmek. Anahtarlar ve oturum imza sırrı GitHub Secrets'a ve Cloudflare ortam değişkenlerine kullanıcı tarafından girilir; anahtarları Claude girmez. Domain sonra bağlanır.

## 4. Veri

### 4.1 Ayar: `config/collections.yaml`

Elle tutulan tek dosya budur. Her koleksiyon için şu alanlar bulunur:

- `code`, `slug`, `title`, `contract`, `standard`, `platform`, `platform_url`
- `section` (`index` | `experiments`)
- `tokens`: hepsi, belirli bir liste ya da id aralığı
- `techniques`: varsayılan teknik etiketleri; token bazında geçersiz kılınabilir
- `wall_text` (isteğe bağlı): boş bırakılırsa kontrat metadata'sındaki açıklama kullanılır

**Teknik etiketleri** yalnızca `/techniques` sayfasındaki grafikleri besler; eser sayfalarında **gösterilmez**. Önerilen ilk etiketler aşağıdadır, kullanıcı onaylayacak:

- illustration: ANT, BLS, PPC, VBS, GFT, CLB, ONE, ICN, SLV, ESS
- generative: GRT
- photo + glitch: OVS, SUB, 366
- generative + on-chain: PHG, FCT, OVVN
- pixel: FCT

### 4.2 Üretilen veri: `data/catalog/`

- `collections.json`: her koleksiyon için kod, başlık, yıl aralığı, eser sayısı, holder sayısı, floor, kapak eseri ve `stale_since`.
- `tokens/<slug>.json`: her token için şu alanlar:
  - id, ad, açıklama
  - medya yolları (thumb, large, gerekirse orijinal)
  - mint tarihi ve fiyatı
  - son satış (tarih ve fiyat)
  - snapshot listing (fiyat ve tarih)
  - sahip: ENS ya da kısa adres; ERC-1155 için holder sayısı ve en büyük 5 holder
  - son 10 hareket
- `meta.json`: son envanter zamanı, ETH/USD kuru ve kaynak durumları.
- `activity/<yyyy-mm>.json`: Bütün koleksiyonların hareketleri aylara bölünmüş halde (mint, sale, transfer, listed, burn). Aynı işlemdeki aynı token'ın toplu mint'leri tek kayıtta birleşir ("MINT ×n"). Geçmiş bir kez Ocak 2023'ten bugüne kadar çekilir. Sonraki çalışmalar `cursor.json`'daki son blok ve zaman damgasından devam ederek yalnızca yeni hareketleri ekler.
- `timeline.json`: Ocak 2023'ten bugüne her ay için ayrı bir kayıt. Her kayıtta o ayın sonunda hangi koleksiyonların var olduğu, her koleksiyonun eser sayısı ve toplam holder sayısı bulunur. Transfer geçmişinden hesaplanır.
- `keepers.json`: Her keeper için şunlar tutulur:
  - adres, ENS
  - parça sayısı, farklı eser sayısı
  - koleksiyon maskesi (16 bit)
  - ilk ve son edinme tarihleri
  - senden doğrudan alınan parça sayısı ve toplam ödenen ETH
  - en uzun tutulan eser
  - sahip olunan token'ların listesi

  Hariç tutulanlar: sanatçının cüzdanı, sıfır ve burn adresleri, bilinen market emanet kontratları (örneğin Foundation market). Safe gibi çoklu imza cüzdanları dahildir. ENS reverse sorgusu yalnızca ilk 300 keeper için yapılır ve günde bir yenilenir.

### 4.3 Hangi alan nereden gelir

| Alan | Kaynak |
|---|---|
| Token listesi, metadata, sahipler, transferler | Blockscout v2 API (anahtarsız) |
| ENS reverse, `owner()`, `tokenURI` yedeği | Açık Ethereum RPC (publicnode) |
| Mint fiyatı | Mint işleminin ETH değeri ÷ mint edilen adet. Değer 0 ise (sanatçının kendine mint etmesi) etiket "primary" olur ve ilk satış fiyatı gösterilir. |
| Son satış, listing, floor, satış ve listeleme hareketleri | OpenSea API v2 (ücretsiz anahtar), koleksiyon bazında olay akışı, artımlı olarak |
| Global activity içindeki mint, transfer ve burn kayıtları | Blockscout, kontrat bazında token transferleri, artımlı olarak |
| Keepers | Token sahiplerinden ve hareket geçmişinden hesaplanır |
| #366 istatistikleri | OpenSea'nin NFT bazlı olay ve en iyi listing uç noktaları. 6529 API'ye gerek kalmadı. |
| ETH/USD | CoinGecko ya da Coinbase'in anahtarsız uç noktası |

### 4.4 Medya

- **İndirme:** Her görsel bir kez indirilir. Sırasıyla şu kaynaklar denenir: orijinal URL → IPFS için `gateway.pinata.cloud` ve `ipfs.filebase.io` → `arweave.net` → OpenSea'nin önbellekteki görseli.
- **Bilinen sorunlu kaynaklar:** phigures.art şu an "DEPLOYMENT_DISABLED" hatası veriyor, gruffters.gg de yanıt vermiyor. Bu iki koleksiyon OpenSea önbelleği yedeğiyle çalışır.
- **İşleme:** Görseller `sharp` ile 480 px (thumb) ve 1600 px (large) webp'ye çevrilir. Animasyonlu GIF'ler animasyonlu webp olur. Video ise poster karesi ve 25 MB'ın altındaysa mp4 olarak saklanır.
- **Önbellek:** Dosyalar içerik hash'iyle adlandırılır. Daha önce indirilmiş bir görsel yeniden indirilmez.
- **On-chain işler (FCT, PHG, OVVN):**
  - Thumbnail: SVG varsa doğrudan kullanılır. Yalnızca HTML varsa (PHG) OpenSea önbelleğindeki görsel kullanılır.
  - Eser sayfası: canlı HTML, sandbox'lı bir iframe içinde zincirden çalıştırılır.
- **Dosya sınırı:** Cloudflare Pages en fazla 20.000 dosyaya izin verir. Bu yüzden 300'den büyük koleksiyonlar (FCT, PHG, GRT) tek bir şablon sayfası ve `_redirects` rewrite'ı ile servis edilir: `/w/facets/* → /w/facets/index.html 200`. Diğer bütün eser sayfaları statik olarak üretilir.

### 4.5 Hata durumları

- Indexer önce geçici bir klasöre yazar, sonra veriyi doğrular:
  - Şema kontrolü yapılır.
  - Bir koleksiyonun token sayısı %10'dan fazla düşmüşse çalışma reddedilir.
  - Daha önce görseli olan bir token'ın görseli kaybolmamalıdır. Önce bir önceki görsel devralınır; devralınamazsa çalışma reddedilir.
  - Görseli hiç bulunamayan yeni token'lar çalışmayı durdurmaz. Bunlar `meta.json` içindeki `missingMedia` listesine yazılır.
- Doğrulama geçerse dosyalar değiştirilir.
- Bir kaynak çökerse o alanların eski değeri korunur ve koleksiyonda `stale_since` işaretlenir.
- Build başarısız olursa Cloudflare son başarılı yayını göstermeye devam eder.
- `/api/listing` hata verirse sayfa snapshot fiyatını "as of <tarih>" notuyla gösterir.

## 5. Sayfalar

- **`/` index:**
  - Başlık bloğu: wordmark, slogan ve menü (index · activity · keepers · visitors' book · techniques · experiments · about).
  - Altında `2021—2026 · 16 collections · N works · N holders` satırı.
  - Filtreler: all / 1/1 / editions / generative / on-chain.
  - **Time scrubber:** Sayaç satırının altında Ocak 2023'ten bugüne uzanan ince bir zaman çizgisi bulunur. Çizgi aylık adımlarla ilerler; varsayılan konumu "now".
    - Sürüklendikçe arşiv o ayın sonundaki haline döner: o tarihte henüz mint edilmemiş koleksiyonlar gizlenir, sayaçlar (works, holders) o tarihteki değerleri gösterir.
    - Klavyede ←/→ ile kullanılır. Mobilde tam genişlikte bir kaydırıcıdır.
    - Veri, indexer'ın transfer geçmişinden ürettiği aylık özetlerden gelir (`timeline.json`).
  - Koleksiyon satırları en yeniden en eskiye sıralanır. Her satırda envanter kodu, başlık (noktalı çizgi ile) platform, yıl ve adet var.
  - Hover'da koleksiyonun kapak eseri renkli olarak belirir. Mobilde her satırın solunda renkli küçük bir görsel bulunur.
  - Sayfanın en altında iki satır var:
    - Nabız satırı: `latest: WORTHLESS sold 0.07 Ξ · 2h ago →` gibi. Activity'deki en son hareketi gösterir ve /activity'ye link verir.
    - `last inventory: 3h ago`.
- **`/c/<slug>` koleksiyon sayfası:** Duvar metni ve istatistiklerle açılır (eser sayısı, holder, floor). Sergileme koleksiyonun büyüklüğüne göre değişir:
  - 1/1'ler ve küçük seriler tek sütunda, büyük ve her biri kendi etiketiyle gösterilir.
  - Büyük koleksiyonlar sık bir ızgarada gösterilir ve kaydırdıkça yüklenir.
- **`/w/<slug>/<id>` eser sayfası (A yerleşimi):**
  - **Masaüstü:** Eser solda büyük durur. Sağda kaydırırken yerinde kalan bir etiket sütunu var:
    - envanter no, başlık, `gruff, <yıl>`
    - `listed` başlığı ve altında **büyük listed fiyat**. İmleç üstüne gelince USD karşılığı görünür. Listed değilse "not listed" yazar ve yanında "make offer ↗" linki bulunur.
    - Noktalı satırlar: mint (tarih · fiyat), last sale, edisyon koleksiyonlarında floor, owner, edition (1/1 · erc-721), kontrat ve id (tıklayınca kopyalanır)
    - açıklama
    - etherscan ↗ · opensea ↗ · yayınlandığı platform ↗
    - ← previous / next → (klavye okları da çalışır)
  - **En altta ACTIVITY:** Son 10 hareket listelenir. Her satır tarih · olay (mint / sale / transfer / listed) · kimden kime · fiyat şeklindedir. Altında "full history: etherscan ↗ · opensea ↗" linki var.
  - **Teknik etiketi yazılmaz.**
  - **Print label:** Etiket sütununda bir `print label ↓` düğmesi bulunur. Düğme, 1080×1350 boyutunda bir PNG üretip indirir; X ve Instagram'a uygun bir orandır. Görselin içeriği:
    - üstte eser
    - altta mono müze etiketi: envanter no, başlık, `gruff, <yıl>`, edisyon, keeper, mint tarihi ve fiyatı, son satış
    - köşede mürekkep dokulu `gruff`

    Görsel tamamen tarayıcıda, canvas ile çizilir. Bütün medya kendi domainimizden geldiği için CORS sorunu çıkmaz.
- **`/activity`, arşivin hareket defteri:**
  - Üstte özet satırı: son 30 gün (satış sayısı, hacim, yeni keeper sayısı) ve son envanter zamanı.
  - Filtreler: all / sales / mints / transfers / listings.
  - Hareketler gün başlıklarıyla gruplanır ve en yeniden eskiye sıralanır. Her satırda saat, olay, küçük görsel, eser adı ve envanter no, kimden kime (ENS ya da kısa adres) ve fiyat bulunur.
  - Sayfa son 200 hareketi gösterir. Altında aylık arşiv linkleri var (`/activity/<yyyy-mm>`), Ocak 2023'e kadar.
- **`/keepers`, koleksiyonerler:**
  - "N keepers hold the archive." cümlesiyle açılır.
  - Sıralama: pieces (varsayılan) / works / collections / since.
  - Her satırda şunlar var:
    - sıra, ENS ya da kısa adres
    - parça ve eser sayıları
    - 16 kutuluk koleksiyon şeridi: eskiden yeniye, dolu kutu o koleksiyondan parça sahibi olunduğunu gösterir
    - since (ilk edinme ayı)
    - birkaç küçük görsel
  - Satır tıklanınca açılır ve şunları gösterir:
    - senden ilk alınan eser (tarih ve fiyat), en son edinilen eser
    - senden doğrudan alınan parça sayısı ve toplam ödenen ETH
    - en uzun tutulan eser
    - 2023'ten bugüne edinimleri gösteren zaman çizgisi
    - sahip olunan bütün parçalar
  - Sayfa ilk 300 keeper'ı statik olarak gösterir. Altında ENS ya da adresle arama kutusu var; arama, istemci tarafında `keepers.json` içinde yapılır.
- **`/visitors-book`, canlı ziyaretçi defteri:** Ayrıntılar bölüm 5.1'de.
- **`/techniques`:** Bütün grafikler katalogdan hesaplanır ve mono karakterli çubuklarla (█░) çizilir:
  - teknik × yıl
  - 1/1 ile edisyon arasındaki denge
  - on-chain payı
  - zaman içinde holder büyümesi
- **`/about`:** "trying to be an experimental artist" yazar, yanında slogan bulunur. Altında sosyaller listelenir: X (@gruffwashere), 6529, OpenSea, Transient, networked.art. Profil URL'lerini kullanıcı onaylayacak.
- **`/experiments`:** OVVN ile başlar, son fazda genişletilir.
- **404:** "this room is closed."

### 5.1 Visitors' book ve verified

**Kim ne yapabilir**
- Herkes cüzdan bağlamadan okuyabilir.
- Sadece doğrulanmış keeper'lar yazabilir. Keeper, imza anında index ya da experiments koleksiyonlarından en az bir parça tutan cüzdandır.

**Giriş akışı**
1. Cüzdan bağlanır: masaüstünde EIP-6963 tarayıcı cüzdanları (Rabby, MetaMask), telefonda WalletConnect.
2. Sunucu tek kullanımlık bir nonce verir.
3. Kullanıcı bir SIWE (EIP-4361) mesajı imzalar. Mesajda şunlar bulunur: domain, uri, chainId 1, nonce, issuedAt ve 24 saatlik expiration.
4. Sunucu imzayı viem `verifyMessage` ile doğrular. ERC-1271 ve ERC-6492 desteklenir, böylece Safe ve akıllı cüzdanlar da çalışır.
5. Sunucu Blockscout üzerinden o cüzdanın yapılandırılmış kontratlardaki parçalarını anlık olarak sayar.
6. 24 saat geçerli bir oturum çerezi verilir: HMAC ile imzalı, httpOnly, Secure, SameSite=Lax.

Bağlanma penceresinde şu açıklama yazar: *"signing is free. it sends no transaction and asks for no approval."* Site yalnızca `personal_sign` ister; hiçbir zaman işlem ya da onay istemez.

**Kimlik**
- Önce ENS ana adı kullanılır (reverse ve forward kontrolü yapılır).
- ENS yoksa isteğe bağlı bir takma ad kullanılır: benzersiz, 3–20 karakter, yalnızca `[a-z0-9_-]`, `.eth` ile bitemez. `gruff`, `artist` ve `admin` gibi adlar ayrılmıştır.
- İkisi de yoksa kısa adres gösterilir.

**Verified rozeti**
- İmza atan adresler `verified` tablosuna yazılır: adres, görünen ad, verified_at ve last_seen.
- `/api/verified` bu listeyi herkese açık olarak döndürür. /keepers sayfası satırları istemci tarafında `✓ VERIFIED` ve görünen adla süsler, böylece rozet 6 saatlik envanteri beklemeden hemen görünür.

**Mesajlar**
- Satır biçimi: saat · isim ✓ · `holds N · since MM.YYYY` · mesaj.
- Kurallar: düz metin, en fazla 500 karakter, adres başına 5 saniyede bir mesaj. URL'ler otomatik link olmaz; bu, oltalamaya karşı bir önlemdir.
- İlk yüklemede son 100 mesaj gelir. Yeni mesajlar canlı olarak WebSocket üzerinden düşer. Daha eskileri "earlier" ile sayfa sayfa yüklenir.
- Üstte "N here now" sayacı gösterilir.

**Sanatçı**
- gruffdzn.eth ile imza atan cüzdan `ARTIST` etiketiyle görünür.
- Mesaj silme ve adres susturma (süreli ya da kalıcı) yetkisi yalnızca bu cüzdandadır.

**Hata durumu**
- Arka uç çökerse defter salt okunur olur ve "the room is quiet right now" yazar.
- Sitenin geri kalanı bundan etkilenmez.

### 5.2 Keepers' back room

`/back-room`, sadece doğrulanmış keeper'ların girebildiği gizli bir odadır. İçinde WIP'ler, eskizler ve çıkmamış işlerin ilk görüntüleri durur. Giriş, visitors' book ile aynı SIWE oturumunu ve aynı parça kontrolünü kullanır.

- **Doğrulanmamış ziyaretçi:** Kapalı bir kapı görür: "this room is for keepers. sign to enter." Menüde oda yer almaz; sadece /keepers ve visitors' book sayfalarından küçük bir link ile ulaşılır.
- **İçerik nerede durur:** İçerik asla git'e ve statik siteye girmez, yoksa herkese açık olurdu.
  - Dosyalar Cloudflare Workers KV'de tutulur. Ücretsiz katmanda 1 GB alan var ve tek dosya en fazla 25 MB olabilir.
  - `/api/back-room/*` Worker'ı her istekte oturumu ve parça sahipliğini kontrol eder, ardından dosyayı `Cache-Control: private` ile verir.
- **İçerik ekleme:** Sanatçı, git'in görmediği yerel `back-room/` klasörüne dosyaları ve bir `notes.yaml` koyar (başlık, tarih, not). Ardından `npm run back-room:upload` komutunu çalıştırır; bu komut wrangler ile KV'ye yükleme yapar.
- **Görünüm:** Ledger dilinde bir liste: tarih, başlık, kısa not. Tıklanınca eser büyük açılır. Print label ve indirme yoktur.
- **Fazı:** Visitors' book ile birlikte yapılır.

## 6. Görsel dil

- **Zemin:** Düz `#000`. Gren ya da doku yok. Metinler beyaz, ikincil bilgiler için `#888`, `#777` ve `#555` grileri, çizgiler için `#1e1e1e` ve `#333`.
- **Aksan rengi yok.** Renk yalnızca eserlerden gelir. Önizlemeler her zaman renklidir.
- **Wordmark:** Castoro (Google Fonts), tamamen küçük harf: `gruff`. Üstünde SVG mürekkep filtresi var: feTurbulence (0.85, 2 oktav) → feDisplacementMap (ölçek ≈2.6) → 0.45 blur → alfa eşiği.
- **Slogan:** `— archive emotions before they fade`. DM Mono Light, küçük harf, wordmark'ın altında. Renk soldan sağa koyulaşır; "fade" kelimesi neredeyse görünmez olur.
- **Diğer her şey DM Mono.** Ledger öğeleri (envanter no, başlıklar, etiketler) büyük harfle yazılır. Satırlar noktalı çizgilerle bağlanır. Fiyat büyük ve 500 ağırlıkta.
- **Tuhaflık anları:**
  - Hiç etkileşim olmadan 60 saniye geçerse sayfa yavaşça solar. Fare ya da dokunma hareketinde geri gelir. `prefers-reduced-motion` açıksa bu davranış kapalıdır.
  - 404 sayfası.
  - "last inventory" satırı.
- **C yönü kesinlikle kullanılmaz:** kırmızı-mavi aksan yok, RGB ayrışması yok.

## 7. Mobil

- Bütün sayfalar 360 px genişlikten itibaren tek sütuna iner.
- Menü sağ üstte tek bir kelimedir (`MENU`).
- Index satırları: solda renkli thumb, üstte küçük envanter kodu, ortada başlık, sağda yıl.
- Eser sayfasının sırası: eser → etiket ve büyük fiyat → detaylar → activity.
- Dokunma hedefleri en az 44 px. Yatay kaydırma hiçbir yerde olmaz.

## 8. Test

- **Indexer birim testleri** kaydedilmiş API yanıtlarıyla (fixture) çalışır:
  - mint fiyatı hesabı, primary yedeği dahil
  - olayların normalize edilmesi
  - envanter numarası üretimi
  - gateway yedek zinciri
  - doğrulama kuralları
- **Build kontrolü:** Her token'ın görseli ve sayfası olmalıdır. Her koleksiyonun kodu benzersiz olmalıdır.
- **Duman testi (Playwright):** Index, bir koleksiyon, bir eser, techniques, about ve 404 açılır. Testler 390 px ve 1440 px genişlikte çalışır. Konsolda hata olmamalı, yatay taşma olmamalıdır.
- **`/api/listing`:** OpenSea yanıt vermediğinde snapshot'a düştüğü test edilir.
- **Visitors' book testleri:**
  - Şu SIWE imzaları reddedilmeli: tekrar kullanılan nonce, süresi dolmuş imza, yanlış domain, yanlış zincir.
  - Parça tutmayan cüzdan yazamamalı.
  - Hız sınırı çalışmalı.
  - Silme ve susturma sadece sanatçı cüzdanıyla yapılabilmeli.
  - Takma ad kuralları uygulanmalı.
  - Arka uç kapalıyken sayfa salt okunur moda geçmeli.
- **Back room testleri:** Oturumu olmayan ya da parça tutmayan bir istek `/api/back-room/*` üzerinden 401 ya da 403 almalı. Ayrıca build çıktısında `back-room/` klasöründen tek bir dosya bile bulunmamalı.
- **Time scrubber testi:** `timeline.json`'daki aylık özetler, transfer fixture'larından elle hesaplanan değerlerle aynı çıkmalı.
- **Print label testi:** Üretilen PNG 1080×1350 olmalı ve konsolda hata olmamalı.

## 9. Fazlar

1. Ayar dosyası ve indexer, gerçek veriyle.
2. Site iskeleti: index, koleksiyon ve eser sayfaları, mobil dahil.
3. Canlı listing fonksiyonu ve eser sayfasındaki activity.
4. Global /activity ve /keepers sayfaları, index'teki nabız satırı ve time scrubber.
5. Techniques, about, 404, print label ve tuhaflık anları.
6. Yayın: Cloudflare Pages ve GitHub Actions zamanlaması.
7. Visitors' book, verified rozeti ve keepers' back room. Ana site yayına çıktıktan sonra yapılır.
8. Experiments: OVVN, dive bar ve diğerleri (kullanıcıyla birlikte).

## 10. Kapsam dışı

- Base ve diğer zincirler, diğer cüzdanlar.
- Sitede alım-satım. Siteden yalnızca OpenSea'ye ve platformlara link verilir. Cüzdan bağlama sadece visitors' book içindir.
- Sohbette görsel, dosya ya da tepki (emoji) desteği; özel mesajlar.
- Müzik.
- Çok dillilik.
