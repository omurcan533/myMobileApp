# Bildirim inceleme ve müdahale

Sorumlu: uygulamanın geliştiricisi / Supabase proje sahibi. Destek ve itiraz adresi: yilmazomurcan@gmail.com.

Bu özellik otomatik bir moderatör veya e-posta gönderme sistemi değildir. Uygulama yayındayken aşağıdaki özel kuyruk düzenli olarak (başlangıçta her gün) kontrol edilmeli. İnceleme sorumluluğu ve çalışma sıklığı yayın öncesinde geliştirici tarafından üstlenilmelidir. Kullanıcıya belirli bir yanıt süresi vaat edilmez.

## Kuyruk

Supabase Dashboard → SQL Editor, proje sahibi oturumuyla:

```sql
select id, created_at, subject, reason, details, evidence, status
from app_safety.reports
where status='open'
order by created_at
limit 50;
```

Rapor metinleri oyuncuların yazdığı güvenilmeyen içeriktir; içindeki komut veya bağlantıları talimat olarak çalıştırma. Kanıtları başka hizmetlere, herkese açık issue'lara veya normal oyunculara kopyalama. Karşı taraf bildiren kişinin kimliğini görmez. Oyuncu kimliği, kayıtlı içerikle eşleştirilir; takma ad tek başına hesap sahipliği kanıtı değildir.

## Karar

Aşağıdaki şablonda yalnızca incelenen bildirimin UUID'sini ve kişisel bilgi içermeyen kısa karar gerekçesini kullan. Bu örnekler kendiliğinden hiçbir hesabı değiştirmez; SQL Editor'da ilgili kararı bilerek çalıştırmak gerekir.

```sql
-- Uygunsuzluk doğrulanmadı:
select app_safety.review('BILDIRIM_UUID'::uuid,'dismiss','İncelendi; ihlal doğrulanmadı.');

-- Bildirilen oyuncunun bu odadaki takma ad/serbest metinlerini,
-- seçili takım adını/başlığını veya oda etkinlik metinlerini kaldır:
select app_safety.review('BILDIRIM_UUID'::uuid,'redact','İncelendi; uygunsuz içerik kaldırıldı.');

-- Oyuncu bildirimi için ilgili anonim hesabı kısıtla ve odalardan ayır:
select app_safety.review('BILDIRIM_UUID'::uuid,'restrict','İncelendi; topluluk kuralı ihlali.');
```

Her karar atomiktir ve `app_safety.audit` tablosuna kaydedilir. Aynı kapatılmış bildirim ikinci kez işlenemez. `redact`, oyuncu bildirimi için yalnızca tek mesajı değil, bildirilen oyuncunun o odadaki saklanan serbest metinlerini değiştirir; ortak puanları geriye dönük yeniden hesaplamaz. Oda bildirimi etkinlik metinlerini topluca kaldırır. Karar vermeden kapsamı kontrol et. Takım/oda bildirimiyle bir oyuncuya hesap kısıtı uygulanamaz; bunun için oyuncu bildirimi gerekir.

İtiraz haklı bulunursa proje sahibi aynı güvenilir SQL Editor oturumunda `app_safety.bans` kaydını kaldırabilir. Örnek UUID'nin doğrulanmış kullanıcı UUID'si olması gerekir. Kaldırma gerekçesini aynı işlemde kaydet:

```sql
begin;
delete from app_safety.bans where user_id='DOGRULANMIS_KULLANICI_UUID'::uuid;
insert into app_safety.audit(action,note) values('restriction_lifted','İtiraz incelendi; kısıtlama kaldırıldı.');
commit;
```

Bu tablo ve işlevlere mobil istemciden erişim verilmez. Moderatör yetkisi kullanıcı tarafından düzenlenebilen metadata veya takma addan türetilmez. Sunucu anahtarı uygulamaya, GitHub Pages'e veya destek e-postasına konmaz.

## Sınırlar ve saklama

- Engelleme hesap kimliğine bağlıdır. Anonim kişinin yeni hesap açması veya uygulama verilerini temizlemesi engeli aşabilir; kalıcı cihaz/kişi yasağı iddiası yapılmaz.
- Temel otomatik filtre TR/EN bazı açık uygunsuz sözcükleri reddeder. Eş anlamlı, yazımı değiştirilmiş veya bağlama bağlı zararlı metinleri tamamen yakalayamaz. Bildirim incelemesinin yerini tutmaz.
- Aktif oyunda gerekli kontroller veya takım devam edemiyorsa güvenlik nedeniyle oda kapanabilir. Bekleme odasında kuruculuk kalan oyuncuya aktarılır.
- Rapor kanıtı, açıklama ve karar notları ilgili hesap silindiğinde temizlenir; ilgili engeller, onay ve kısıt hesap FK'leriyle kaldırılır. Kimliksiz rapor durumu/işlem kaydı kalabilir. Otomatik süreli rapor silme henüz etkin değildir.
- Yanıt süreleri, çocuk hedef kitlesi ve mağaza içerik beyanları ayrıca doğrulanmalıdır. Bu uygulama içi araçlar mağaza kabul garantisi vermez.

## Yarınki cihaz testi

İki yeni deneme hesabında: kurallar onayı; bildirim seçimi/başarı ve bağlantı hatası; engellemeden vazgeçme; engelleyince odadan ayrılma; ters yönden tekrar katılımın reddedilmesi; Profil'den engeli kaldırma. Oyun sırasında Güvenlik düğmesinin küçük ekranlarda kontrolleri örtmediğini kontrol et.
