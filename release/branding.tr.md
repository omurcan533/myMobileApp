# İkon ve açılış görselleri

5 Kasım 2026. Üretim: yerleşik imagegen aracı; mevcut tilki/rakun maskotları stil referansı olarak kullanıldı.

## Dosyalar

- `assets/brand/mascot-source-v1.png`: üretilen şeffaf kaynak.
- `assets/brand/mascot-mark-v1.png`: 1024×1024 şeffaf açılış/uygulama yükleme işareti.
- `assets/brand/app-icon-v1.png`: 1024×1024, gerçek RGB, opak iOS ve eski Android ikonu.
- `assets/brand/android-foreground-v1.png`: 1024×1024 şeffaf ön plan; görünen karakter 66/108 güvenli alanının içinde.
- `assets/brand/android-monochrome-v1.png`: aynı karakterin alpha konturundan üretilen tek renk maske; temalı ikon için dış siluet.
- `assets/brand/favicon-v1.png`: 64×64 web ikonu.

Teknik dışa aktarımlar `node scripts/export-brand-assets.mjs` ile yeniden üretilebilir. Düşük alpha gürültüsü temizlenir, karakterin dışındaki boşluk kırpılır, ölçeklenir ve platform tuvalleri hazırlanır. Renkli kaynak veya eski avatar dosyaları yeniden çizilmez.

## Kullanılan son görsel istemi

Use case: logo-brand. Asset type: production mobile game mascot mark for Ucube Atölyesi / Oddity Workshop, a team game about assembling oddball creatures. The two attached images are STYLE REFERENCES ONLY (existing fox and raccoon team mascots), not edit targets. Generate ONE original friendly fox–raccoon hybrid head and a short neck only: orange fox fur and pointed ears, charcoal raccoon eye mask, cream muzzle, big expressive amber eyes, a mischievous closed smile, subtly asymmetrical little tufts. Match the polished playful 3D illustrated game-mascot look and subtle cyan/magenta edge lighting of the references. Strong clean silhouette and simple large facial features readable at 48 pixels. Centered front-facing head, almost symmetrical overall, entire ears visible with generous transparent margins. Image square 1024x1024, character within central 72% of canvas. Transparent background with genuine alpha. No text, lettering, numbers, clothes, drinks, hands, props, badges, borders, rounded-square tile, ground shadow, scene, extra characters or watermark. Keep all pixels outside the clean character silhouette fully transparent, no floating glow.

## Yapılandırma ve sınırlar

`app.json` yeni dosyalara bağlandı. SDK 57 ile uyumlu `expo-splash-screen` eklendi; `imageWidth: 240`, `resizeMode: contain`, arka plan `#050A14`. Uygulama koyu olduğu için ayrı dark varyantı gerekmez. `expo-system-ui` yerel arka plan/koyu görünüm yapılandırmasını uygular. Expo'nun önerdiği patch sürümleri eşitlendi.

İkon ve yerel splash değişikliği yeni native derleme/kurulum gerektirir; Metro yenilemesi tek başına değiştirmez. Geliştirme istemcisinin açılış ekranı release sürümünü tam temsil etmez. Yayın/preview sürümünde gerçek iPhone ve Android açılış kontrolü hâlâ gerekli. Native projeler elle düzenlenmedi; bağımsız çalışma klasöründe prebuild ile üretildi. Bu kontrol, imzalı mağaza derlemesi veya gerçek cihaz açılış testi değildir.

Kaynaklar: https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/ · https://docs.expo.dev/versions/v57.0.0/sdk/system-ui/ · https://developer.android.com/develop/ui/compose/system/icon_design_adaptive
