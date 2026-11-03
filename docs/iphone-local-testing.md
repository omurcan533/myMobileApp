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

## Xcode 27 / iOS 27

SDK 57 için `expo-build-properties` içindeki `ios.enableSceneSupport: true` ayarı gereklidir. `app.json` bu ayarı içerir; native dosyaları elle değiştirme. Expo prebuild, `AppDelegate` için `ExpoReactNativeFactoryProvider` uyumluluğunu ve `EXExpoAppSceneDelegate` sahne manifestini üretir. Bu ayar olmadan iOS 27, uygulamayı JavaScript başlamadan `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` hatasıyla kapatır.

Kaynak: https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md

## İlk kurulum sırasında imzalama doğrulaması

macOS anahtar zinciri onaylarının ilk kez istendiği derlemede, bir framework imzalanamazsa CocoaPods'un paralel imzalama aşaması genel derlemeyi yine başarılı gösterebilir. Telefonda `ApplicationVerificationFailed` görülürse ayrıntılı cihaz kurulum hatasına bak; ana uygulamayla birlikte gömülü framework'lerin imzalarını da doğrula. Parola veya anahtar zinciri sıfırlama işlemiyle çözmeye çalışma. Onaylar tamamlandıktan sonra yeniden derle ve kur.

Bu Mac'te Xcode 27.2, CocoaPods 1.16.2, ücretsiz Personal Team ve iPhone 14 Plus / iOS 27.0.1 ile derleme, kurulum ve gerçek cihazda profil ekranı açılışı doğrulandı. Tüm oyunların fiziksel cihaz testi ayrı aşamadır. Debug sürümünü test ederken Mac'teki Metro açık ve telefon aynı ağda olmalıdır; USB kablosu ilk kurulumdan sonra oyun verisini taşımak için gerekli değildir.
