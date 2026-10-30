# Yeniden bağlantı doğrulaması

## Düzeltilen davranış

- Oda yenilemesindeki bütün sorgular, mini oyun katılımları dahil, ortak 10 saniyelik iptal sınırı kullanır.
- Realtime yeniden abone olduğunda veya uygulama ön plana geldiğinde eski sorgu iptal edilir ve güncel oda yeniden okunur. İptal edilen yanıt ekrana yazılamaz.
- Geçici sorgu hatası mevcut oda verisini korur; oyuncuyu odadan çıkarmaz.
- Yeniden bağlantıda sunucu saati ayrıca eşitlenir. Saat sorguları, yanıt gövdesi dahil, istek başına 3 saniyeyle sınırlıdır; başarısız eşitleme son geçerli saat farkını korur.

## Otomatik doğrulama

`node --experimental-strip-types --test scripts/room-reconnect.test.mjs scripts/server-time.test.mjs scripts/coalesced-task.test.mjs`

Testler gerçek useRoom ve serverTime kodunu çalıştırır; React/native olayları ve ağ yanıtları kontrollü taklitlerdir. Takılan sorgu, geciken eski yanıt, giriş sorgusunun zaman aşımı, yeniden bağlantı, ön plana dönüş, güncel tur/takım/skor/katılım kayıtları, duraklatılmış geri sayım ve cihaz saati değişikliği kapsanır. TypeScript ve Expo lint ayrıca çalıştırılır.

## Gerçek cihazda henüz yapılmayan testler

Android ve iOS üzerinde en az iki telefonla:

1. Bir oyuncunun bağlantısını soru sırasında uçak moduyla kes. Diğer cihazda turu ilerlet. Bağlantı geri geldiğinde aynı oyuncu kimliğinin, mevcut turun, takımın, kaptan/mimar rollerinin ve skorların korunduğunu karşılaştır.
2. Uygulamayı arka plana al; diğer cihazda soru/mini oyun/inşa aşamaları arasında ilerle. Geri dönüşte doğru ekran ve sunucu bitiş zamanına göre kalan süreyi karşılaştır.
3. Bağlantı kesikken oyunu duraklat; geri bağlanan cihazda sayacın durduğunu, devam ettirince diğer cihazla birlikte ilerlediğini kontrol et.
4. Wi-Fi ve mobil veri arasında geçiş yap; Realtime yeniden aboneliğini ve periyodik sorguyla toparlanmayı kontrol et. Mini oyun katılımının iki kez gönderilmediğini doğrula.
5. Bir cihaz arka plandayken saatini değiştir; ön plana dönüşte geri sayımın diğer cihazla yeniden uyuştuğunu doğrula.
6. Bağlantısı kesilen oyuncuyu lobiden çıkar veya odayı kapat. Yeniden bağlanan cihazın ana ekrana dönmesini; yalnızca geçici ağ hatasında odada kalmasını doğrula.
7. Uygulamayı kapatıp yeniden aç; kalıcı anonim oturum ve kayıtlı oda ile doğru aşamaya dönüldüğünü doğrula.

Bu çalışma canlı Supabase veritabanında oyun oturumu veya fiziksel cihaz testi yürütmez; çoklu tablo okumalarının tek veritabanı anlık görüntüsü olduğunu garanti etmez.
