# Ucube Atölyesi — yayın kontrol listesi

3 Kasım 2026. İncelenen kaynak: omurcan533/myMobileApp, main; iPhone hazırlığı 390dca3 sonrası.
Apple Developer, Google Play Console ve Expo/EAS hesaplarına henüz başlanmadığı kullanıcı tarafından doğrulandı.

## Kodda doğrulanan eksikler

- [x] İngilizce arayüz, dinamik metinler, erişilebilirlik etiketleri ve sunucu hata mesajları tamamlandı; oyuncuların yazdığı metinler korunuyor.
- [x] 48 İngilizce anagram, 24 bilmece, 20 bilgi sorusu ve 24 sosyal soru eklendi. Oda dili herkes için aynı; cevap doğrulaması sunucuda. İki istemciyle canlı test geçti.
- [x] 24 İngilizce şarkı adı ve dil seçimine bağlı sunucu havuzu hazırlandı. Şarkı oyununun menüdeki kapalı durumu korundu.
- [x] iOS bundleIdentifier ve Android package: com.omurcan533.ucubeatolyesi. Mağaza hesapları açılınca kimlik uygunluğu ayrıca doğrulanacak.
- [x] Cihazda görünen ad Ucube Atölyesi olarak ayarlandı. İngilizce arayüzde Oddity Workshop kullanılıyor.
- [ ] Expo projesini hesaba bağla, EAS projectId ve imzalamayı yapılandır. Başlangıç eas.json bu çalışma kopyasına eklendi; henüz build alınmadı.
- [ ] Gizlilik politikası ve destek bağlantılarını oluştur, uygulama içinden erişilebilir yap.
- [ ] Anonim oturum ve oyuncu verileri için veri silme akışını değerlendir ve uygula; yalnızca cihaz depolamasını temizlemek sunucu verisini silmez.
- [ ] Açık odalar ve takım mesajları nedeniyle içerik bildirimi, kullanıcı engelleme ve moderasyon akışlarını incele. Kurucunun oyuncu çıkarabilmesi tek başına bunların yerine geçmez.
- [ ] Mevcut beş avatarla yayın mı yapılacağını belirle. Eski sohbetteki 20 ek avatar mevcut assets/art içinde yok; bunlar yayın için zorunlu değildir.

## Hesaplar ve mağaza hazırlığı

- [ ] Apple Developer kaydı, kimlik doğrulaması ve sözleşmeler.
- [ ] Google Play Console kaydı, hesap türü ve gerekli doğrulamalar.
- [ ] Expo hesabı ve EAS bağlantısı.
- [ ] Türkçe/İngilizce mağaza açıklaması, kategori, destek e-postası, gizlilik URL'si.
- [ ] Son oyun ekranlarından mağazaya uygun ekran görüntüleri; ikon ve açılış ekranının gerçek cihazda kontrolü.
- [ ] Apple App Privacy ve Google Data safety beyanları; gerçek veri akışı ve kullanılan SDK'larla eşleştir.
- [ ] Yaş/içerik derecelendirmesi, hedef kitle, reklam ve satın alma beyanları; özellik yoksa varmış gibi doldurma.
- [ ] Yayın ülkeleri ve varsa ticari durum beyanlarını tamamla.

## Derleme ve test

- [x] Bağımlılık kurulumu, lint (0 hata/0 uyarı), TypeScript, 59 test ve web export tamamlandı.
- [x] Expo SDK 57.0.31, geliştirme istemcisi, iOS prebuild ve iOS/web export kontrolleri.
- [ ] Gerçek cihaz testleri; Xcode/CocoaPods kurulumu ve kişisel imzalama bekleniyor.
- [ ] Preview Android sürümünü gerçek telefonda dene; iOS için cihaz kaydı/imzalama veya TestFlight yolunu tamamla.
- [ ] İki dilde oluştur/katıl, açık odalar, tüm oyunlar, sonuç, yeniden bağlanma, arka plana alma ve bağlantı kaybı testleri.
- [ ] En az iki gerçek cihazla aynı odada karışık dil denemesi; kalabalık oda regresyonu.
- [ ] Yeni kişisel Google Play hesabında gerekli kapalı test: en az 12 katılımcı, kesintisiz en az 14 gün; ardından production erişim başvurusu. Hesaba uygulanacak koşulu Console'dan doğrula.
- [ ] TestFlight ve Play test geri bildirimlerini çöz; incelemeye erişim yönergeleriyle gönder.

## Bu çalışma sırasında başlanan işler

- [x] Güncel GitHub kaynağı yerel çalışma alanına alındı.
- [x] Mod adları, oda durumları, devam/tekrar düğmeleri, odadan çıkarılma bildirimi, takım atama yüklemesi ve kurtarma ekranı için 22 İngilizce karşılık eklendi; hata ekranları çeviriye bağlandı.
- [x] Preview/production EAS yapılandırması eklendi; production build numarası otomatik artırılır.
- [x] npm ci tamamlandı; npx tsc --noEmit geçti.
- [x] Başlangıçtaki 87 lint hatası ve 34 uyarı düzeltildi. Kurallar kapatılmadı. 59 test, TypeScript ve Expo web export geçti.

Değişiklikler GitHub main dalına gönderildi (3eabf4f7ee877ff7ad3e3de164a40d9d7097dc6e); mağazaya yüklenmedi.
Mac'te git kullanımı Xcode komut satırı araçlarının eksikliği nedeniyle çalışmadı; kaynak GitHub arşiviyle alındı. Bulut EAS derlemesi için yerel Xcode zorunlu değildir.

## Kaynaklar

- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/app-store/app-privacy-details/
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://docs.expo.dev/build/eas-json/

Bu liste depo incelemesine dayanır. İngilizce içerik geçişi canlı veritabanına uygulandı ve iki istemciyle doğrulandı. Mağaza paneli ve fiziksel cihaz testi henüz yapılmadı.

## Xcode indirilirken tamamlananlar

- [x] TR/EN mağaza açıklamaları, alt başlıklar, kısa açıklamalar, anahtar kelimeler; karakter sınırları doğrulandı.
- [x] Profilde TR/EN veri kullanım açıklaması; kişisel soru formunda oda paylaşımı açıklaması.
- [x] Kullanıcının seçtiği herkese açık destek e-postası: yilmazomurcan@gmail.com.
- [x] TR/EN destek sayfası ve uygulama içi destek bağlantısı.
- [x] Gizlilik veri dökümü ve inceleme/ekran görüntüsü çekim planı.
- [ ] Nihai gizlilik politikası, sunucu verisi silme ve moderasyon tamamlanacak. Destek sayfası gizlilik politikası yerine kullanılmaz.
