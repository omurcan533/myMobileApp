# Yedi cihazla oyun geri bildirimi

## Değişiklikler

- Pong'da iki kişilik takımın ortak seçimi isteğe bağlıdır. Eksik/uyuşmayan oylar kurucunun başlatmasını engellemez; atanmış mevcut iki kişilik düzen kullanılır. İki oyuncu birlikte tek kişi seçerse tek kişilik kontrol korunur.
- Halat çekmenin kuvvet farkı metni açık renktir. Sayaç ve başlangıç kontrolü cihazın ham saati yerine eşitlenmiş sunucu saatini kullanır.
- Lobide oyuncular, oda kodu ve oyun seçimlerinden önce görünür.
- Çizgi birleştirmede her oyuncunun doğrulanmış tamamlanma süresi sunucuda bir kez kaydedilir. İlk bitiren veya herkesin bitirmesi turu erken kapatmaz. 150 saniye sonunda en hızlı bireysel oyuncunun takımı +2 puan ve bonus parça alır; sonuçta herkesin süresi/tamamlayamama durumu görünür. Genel katılım RPC'siyle çizgi doğrulamasını atlamak engellenir.
- Hızlı eşleştirme gösterimi, iptal edilen zamanlayıcıların arkasında takılan bir bayrak yerine geçen zamandan hesaplanır. Ön plana dönüşte tekrar gösterilir; oyuncu da sıralamayı yeniden izleyebilir. Kurucu yeni bir hafıza turu başlatabilir; tekrar isteği aynı turdan iki rövanş oluşturmaz.
- Bilmece önerileri doğrudan ekranda görünür; kaptan öneriye dokunarak mevcut cevap onayına geçer. Önerilerde ve bilmece/harf bulmacası sonuçlarında gönderim sırası ve saniye gösterilir. Yeni cevapların süreleri sunucuda kaydedilir, duraklamalar çıkarılır; eski cevaplarda zaman damgasından hesaplanan değer gösterilir.
- Tarayıcı ses sistemi oluşturulamazsa oyun ekranı düşmez. Android'in geçici sıfır viewport yüksekliği yok sayılır. Beklenmedik ekran hatasında oda kaydını koruyan yeniden bağlanma ekranı gösterilir.
- Kurucu kendi odasını onay diyaloğuyla kapatabilir. Tek kişilik **bekleme** odaları kesintisiz 10 dakika sonra kapanır; ikinci oyuncu gelince sayaç sıfırlanır, tekrar tek kişi kalınca yeniden başlar. Aktif oyunlar bu kuralla kapanmaz. Dakikalık sunucu görevi 10–11 dakika içinde kapatır; oda listesi yenilenirken de temizlik yapılır. Kapatma geçmiş verileri silmez, kodla yeniden katılımı engeller. Başka kişilerin odasını kapatabilen ortak parola eklenmez.

## Otomatik testler

TypeScript, Expo lint, web export ve Node regresyonları çalıştırılır. Veritabanı testi PGlite/PostgreSQL motorunda sentetik kullanıcılarla gerçek değişiklik SQL'ini ve RPC'leri çalıştırır. Canlı oyuncu verileri test ortamına kopyalanmaz. Yedi oyunculu çizgi/halat, erken bitiş, yinelenen puan, geçersiz çizgiler, eksik Pong oyları, hafıza rövanşı, cevap süreleri, oda nüfusu geçişleri ve kurucu yetkisi kapsanır. Cron ayrı olarak Supabase'de doğrulanır.

## Cihaz testi gerekenler

Gerçek Android boş ekranının tüm nedenlerinin giderildiği doğrulanmış değildir. İki farklı Android tarayıcısı ve iOS Safari ile zar atma, arka plana dönüş, ekran döndürme ve ses açık/kapalı denenmeli. Tarayıcı önizleme aracı mevcut URL'yi güvenle belirleyemediği için görsel kontrolü durdurdu; bu çalışma başarılı görsel test iddiasında bulunmaz.

Halat çekme yedi gerçek cihazda 60/120 saniye, farklı cihaz saatleri ve bir oyuncunun Wi-Fi/mobil veri geçişiyle yeniden denenmeli. Oyuncunun 3–5 saniye sonra ekranının kaybolduğu olayın tek kesin nedeni mevcut kayıtlarla belirlenemedi; saat ve hata toparlama düzeltmeleri test edilmelidir. Çizgi birleştirmede herkes tamamladığında da sonuca kadar kalan süreyi beklemek beklenen davranıştır.
