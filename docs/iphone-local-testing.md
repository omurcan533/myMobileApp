# iPhone üzerinde ücretsiz yerel test

Bu yol Mac üzerinde Xcode ve ücretsiz Apple hesabı kullanır. App Store/TestFlight yayını ayrı bir aşamadır.

## İlk kurulum

1. Mac App Store'dan Apple'ın Xcode uygulamasını yükle. Xcode'u aç; lisans ve gerekli iOS bileşenlerinin kurulumunu kendi hesabınla tamamla.
2. Xcode > Settings > Accounts bölümüne Apple hesabını ekle.
3. iPhone'u kabloyla Mac'e bağla, kilidini aç ve telefondaki “Bu bilgisayara güven” isteğini onayla.
4. Xcode cihazı tanıdıktan sonra iPhone'da Ayarlar > Gizlilik ve Güvenlik > Geliştirici Modu'nu aç. Telefonun istediği yeniden başlatma ve onayı tamamla.
5. Mac ve iPhone aynı Wi-Fi ağında olsun. Yerel ağ erişimi istenirse uygulamaya izin ver.

## Çalıştırma

Node.js ve npm kullanılabilir olmalıdır. Proje kökünde:

```sh
npm ci
npm run ios:device
```

`.env` dosyasında `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY` bulunmalıdır. Bunlar istemciye açık proje değerleridir; service-role anahtarı kullanma.

Komut cihaz seçimini açar; bağlı iPhone'u seç. Expo, `ios/` projesini ayarlardan üretir ve geliştirme derlemesini kurar. `ios/` klasörünü elle düzenleme veya repoya ekleme.

İmzalama takılırsa üretilen `ios/*.xcworkspace` dosyasını Xcode'da aç. Uygulama hedefinde Signing & Capabilities > Automatically manage signing açık olsun, Team olarak Apple hesabının Personal Team'ini seç. Ardından aynı cihazla tekrar çalıştır. Kişisel Team kimliği repoda tutulmaz.

`npm run ios` mevcut geliştirme sunucusunu açmak içindir; ilk yerel derleme komutu `npm run ios:device`'tır. Yerel derlemenin ardından JavaScript değişiklikleri için `npx expo start --dev-client` kullanılabilir. Native bağımlılık/ayar değişince tekrar derle.

## Telefonda kontrol

- Türkçe ve İngilizce arayüz, kalıcı dil tercihi
- Oda oluşturma, ikinci cihazdan katılma, ortak oyun dili
- Klavye, çentik/güvenli alan, küçük ekran taşmaları
- Tur geçişleri, puanlar, bağlantı kesilip geri gelme
- Haptik ve uygulamanın arka plandan geri dönüşü

## Resmi kaynaklar

- https://docs.expo.dev/guides/local-app-development/
- https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/
- https://apps.apple.com/app/xcode/id497799835

Bu hazırlık tek başına imzalı iOS uygulaması üretildiği veya fiziksel cihaz testinin geçtiği anlamına gelmez. Xcode kurulumu, kişisel imzalama ve bağlı cihaz gerekir.
