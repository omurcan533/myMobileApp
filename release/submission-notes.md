# Mağaza gönderim paketi — 3 Kasım 2026

Durum: metinler hazır; henüz mağaza paneline gönderilmedi. Gerçek cihaz QA ve yayın engelleri tamamlanmadan incelemeye sunulmaz.

## Metinler

`store-metadata.json`: App Store adı (30), alt başlık (30), tanıtım metni (170), anahtar kelimeler (100), açıklama (4000); Google Play kısa açıklama (80), tam açıklama (4000) için TR/EN metinleri.

İngilizce mağaza adı şimdilik marka tutarlılığı için Ucube Atölyesi. Oddity Workshop açıklamada kullanılıyor. Marka değişimi mağaza kaydından önce kararlaştırılabilir. Şarkı tamamlama menüde kapalı olduğundan tanıtım metinlerinde vaat edilmiyor. Reklamsızlık, fiyat, çevrim dışı oyun ve kesin süre gibi doğrulanmamış vaatler yok.

Kategori önerisi: Games / Casual; mağaza panelinin izin verdiği ikincil kategori için Puzzle değerlendirilebilir. Kesin yaş derecesi yazılmadı: kişisel soru, açık oda ve mesaj özellikleri derecelendirme formunda gerçek davranışa göre yanıtlanmalı. Çocuklara yönelik kategori otomatik seçilmemeli.

## İnceleme erişim notu (İngilizce)

The app uses anonymous authentication; no email/password registration is required. An internet connection and at least two players are needed for a normal match. Select a nickname and avatar, create a room on one device, and join it from a second device using the room code. The host selects the games and assigns teams. Interface language can be changed in Profile; the host sets the shared question language in the lobby. Optional personal questions can remain disabled. Please use invented, non-sensitive sample answers when reviewing that optional activity.

Bu erişim yolu iki gerçek cihazla henüz doğrulanmadı. Bot deneme kontrolleri üretim erişim talimatı olarak kullanılmıyor; yayın öncesi erişimleri ayrıca incelenmeli.

## Ekran görüntüsü çekim listesi

Son imzalı sürümde, aynı sahneler Türkçe ve İngilizce hazırlanacak:

1. Ana ekran: oda oluşturma ve oyun modları. Başlık: “Arkadaşlarını atölyeye çağır” / “Bring your friends to the workshop”.
2. Lobi: iki takım, avatarlar ve ortak oyun dili. “Takımını kur” / “Find your team”.
3. Bulmaca: gerçek bir anagram veya bilmece. “Birlikte çöz, birlikte kazan” / “Solve together, win together”.
4. Mini oyun: Pong veya renk bağlantısı, anlaşılır oyun anı. “Her tur yeni bir mücadele” / “A new challenge every round”.
5. Tasarım: kazanılmış parçalarla gerçek yaratık. “Kendi ucubeni tasarla” / “Create your own oddity”.
6. Sonuç: gerçek puanlar ve takım eseri. “Atölyenin yıldızı sen ol” / “Make your workshop masterpiece”.

Gerçek ekran içeriği kullanılmalı. Önceki 390×844 web QA görselleri mağaza ekran görüntüsü olarak teslim edilmedi. Son boyutlar App Store Connect ve Play Console'un güncel cihaz seçeneklerine göre alınmalı. iPad desteği açık; iPad QA/görüntüleri de tamamlanmalı veya destek kapsamı ürün kararıyla değiştirilmeli.

## Gönderimi engelleyen kalan işler

- Xcode/CocoaPods kurulumu, fiziksel iPhone imzalama ve test; Android cihaz testi.
- Apple Developer / Play Console hesapları ve imzalı dağıtım sürümleri.
- Geliştirici/yayıncı bilgisi ve nihai gizlilik URL'si. Destek e-postası: yilmazomurcan@gmail.com; destek URL'si: https://omurcan533.github.io/myMobileApp/support.html.
- Anonim hesap ve ilişkili veriler için güvenli sunucu silme akışı ve webden talep yolu.
- Mesajlar/açık odalar için bildirim, engelleme, içerik süzme ve moderasyon.
- Sunucu verileri/loglar/yedekler için saklama sürelerinin doğrulanması; App Privacy ve Data safety formları.
- İkon/açılış görseli, varlık hakları, gerçek cihaz ekran görüntüleri.
- Bağımlılık denetimindeki dolaylı Expo araç zinciri uyarılarının değerlendirilmesi.

## Resmi kaynaklar

- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- https://support.google.com/googleplay/android-developer/answer/9859152
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/13327111
