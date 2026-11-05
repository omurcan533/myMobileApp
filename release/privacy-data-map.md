# Gizlilik ve veri dökümü

3 Kasım 2026 — kaynak kodu incelemesi. Bu belge nihai gizlilik politikası veya doldurulmuş mağaza beyanı değildir. Sunucu ayarları, saklama süreleri ve yayıncı iletişim bilgileri tamamlanmadan öyle kullanılmamalı.

| Veri | Nerede / amaç | Kod kanıtı | Yayın hazırlığında yapılacak |
| --- | --- | --- | --- |
| Anonim kullanıcı UUID ve oturum | Supabase Auth; kimlik doğrulama, odaya yeniden bağlanma; oturum cihazda da tutulur | `lib/supabase.ts`, `App.tsx` | User IDs / Device or other IDs sınıflandırmasını form açıklamalarıyla eşleştir; anonim hesap silme akışı |
| Takma ad, seçili avatar | Cihaz + odadaki oyuncu kaydı; diğer oyunculara gösterim | `screens/Home.tsx`, `lib/api.ts`, `lib/types.ts` | Takma ad gerçek ad içerebilir; otomatik olarak kimliksiz veri kabul etme |
| Dil ve ses tercihi | AsyncStorage, cihaz tercihi; oda soru dili sunucu | `lib/i18n.ts`, `screens/Home.tsx` | Sadece cihazdaki tercih ile sunucuya iletilen oda dilini ayır |
| Oynanan oyun / galibiyet / XP | Yerel profil; XP bu sayaçlardan hesaplanır | `lib/profile.ts` | Yerel istatistikleri bulut profil vaadiyle tanıtma |
| Oda, takım, hamle, cevap, puan, oylama, yaratık adı ve yerleşimler | Sunucu; oyun senkronizasyonu ve sonuçlar | `lib/api.ts`, `lib/types.ts`, `hooks/useRoom.ts` | Gameplay / Other user content / App interactions kategorilerini karşılaştır |
| Mesajlar ve parti etkinliklerindeki serbest metin | Sunucu; takım koordinasyonu ve sosyal oyunlar | `survivorSendMessage`, `partyCourtSpeak`, `partyEventVote` | Mesaj/UGC sınıflandırması; bildirim/engelleme/moderasyon eksik |
| İsteğe bağlı arkadaşlık cevapları | Sunucu; burç, kardeş sayısı, ayakkabı numarası, takım tercihi, okul numarası, yaş; oda paylaşımı ve hafıza oyunu | `components/FriendFactsLobby.tsx`, friend-facts RPC'leri | Yaş dahil kişisel veriyi dikkate al; özellik kapatılabilir. Tam doğum tarihi toplanıyor deme |
| Ağ / güvenlik / hizmet günlükleri | API ve hosting sağlayıcılarının yapılandırmasına bağlı | Supabase ve GitHub Pages kullanımı | IP, istemci bilgisi, saklama, bölge, yedek ve alt işleyenleri dashboard/sözleşmelerden doğrula; koddan yok sonucunu çıkarma |

## Doğrulanan sınırlar

- İncelenen bağımlılıklarda ve uygulama kaynaklarında reklam, ödeme, reklam kimliği, üçüncü taraf ürün analitiği veya çökme raporlama entegrasyonu görülmedi. Bu, hosting/ağ günlüklerinin olmadığı anlamına gelmez.
- Konum, kişiler, kamera veya mikrofonu okuyan bir özellik bulunmadı. Native nihai manifest ve SDK gizlilik manifestleri ayrıca derlemede denetlenmeli.
- Takma adla kullanım, anonimleştirilmiş veri garantisi değildir. UUID ile ilişkilendirilmiş oyun kayıtları vardır.
- `leaveRoom` ve cihazdaki tercihleri temizleme, Supabase Auth kullanıcısını silmez. Arayüzde “tüm veriler silindi” sonucu verilemez.
- Kaynakta bazı oda kapatma/temizleme işleri var; oda kapatma, tüm kişisel verinin belirli sürede silindiği garantisi değildir. Auth kullanıcıları, mesajlar, oyun verileri, yedekler ve loglar için ayrı plan gerekir.
- Açık oda listesinde kod ve kurucu takma adı görünür. Oda kodunu gizli/güvenli davet bağlantısı gibi tanıtma.

## Nihai politika için eksik kararlar

1. Yayıncı/geliştirici adı ve herkese açık destek e-postası.
2. Veri sorumlusu iletişimi ve yayın kapsamına göre gerekli açıklamalar.
3. Aktif / kapanmış oda verileri, anonim hesap, log ve yedek saklama süreleri.
4. Sunucu tarafında hesap silme, oturum iptali ve ilişkili verilerin silinmesi/anonimleştirilmesi; başarısızlık durumunda yeniden deneme ve kullanıcıya doğru sonuç.
5. Webden silme talebinde anonim hesabın güvenli doğrulanması. Sadece takma ad veya oda koduna göre başkasının verisi silinmemeli. JWT/parola/e-posta ile token gönderimi istenmemeli.
6. Bildirimlerin kime iletileceği, içerik müdahalesi ve engelleme davranışı.
7. Mağaza hedef kitlesi, çocuk kullanım politikası ve kişisel soru kapsamı.

## Kaynaklar

- Apple gizlilik ve hesap silme: https://developer.apple.com/app-store/review/guidelines/ (5.1.1)
- Apple veri beyanı: https://developer.apple.com/app-store/app-privacy-details/
- Google hesap silme: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Anonim Supabase hesabı: https://supabase.com/docs/guides/auth/auth-anonymous

## 4 Kasım güncellemesi

Herkese açık TR/EN politika: public/privacy.html; silme sayfası: public/delete-account.html. Profil içi silme ve önceden üretilen web koduyla silme uygulanmıştır. Silme kodlarının yalnızca SHA-256 özeti app_privacy.deletion_tokens tablosunda tutulur; anon/authenticated rolleri erişemez. Edge Function, taze Auth doğrulaması veya 256 bit silme koduyla yalnızca ilgili hesabı silebilir. Sunucu anahtarı istemciye veya statik sayfalara verilmez.

Uygulama içi silme, onaylanmış sunucu başarısından sonra ilgili yerel profil/tercih anahtarlarını temizler ve yerel oturumu kapatır. Web silme başka cihazın depolamasını temizleyemez. Diğer oyuncuların bağımsız yazdığı içerikler, ortak toplamlar, sağlayıcı günlükleri ve yedekler için tüm veriler anında silinir iddiası yapılmaz. Anonim hesaplar için süreli otomatik silme etkin değildir.

Yukarıdaki eksik kararların hesap silme ve güvenli web doğrulama maddeleri uygulanmıştır. Yayıncı hukuki bilgileri, sağlayıcı log/yedek saklama ayarları, hedef kitle ve moderasyon kararları mağaza başvurusu öncesinde tamamlanmalıdır.

## Topluluk güvenliği verileri

`app_safety` özel şemasında kabul edilen kural sürümü/tarihi, engeller, bildirim nedeni/açıklaması/ilgili içerik kanıtı, inceleme kararı ve hesap kısıtı tutulur. Normal oyuncular rapor kuyruğunu veya başkalarının engellerini okuyamaz; moderatör işlevleri istemciye kapalıdır. Oyuncuya ait hesap silinince bağlı rapor kanıtları, açıklamaları ve karar notları temizlenir; FK'lerle engel/onay/kısıt kaldırılır. Kimliksiz karar durumu/audit kaydı kalabilir. Raporlar için otomatik süreli temizlik henüz etkin değildir.

Kendi engelleme listesinde engellenen hesabın takma adı gösterilir. Engelleme yeni anonim hesapların aynı kişi olduğunu belirleyemez. Bildirim kanıtları başka sağlayıcıya otomatik gönderilmez; geliştiricinin özel Supabase kuyruğunda incelenir.
