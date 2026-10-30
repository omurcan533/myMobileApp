# Oyun arası oyuncu yönetimi

Kurucu, soru ve mini oyunların hazırlık/sonuç ekranındaki **Oyuncuları Yönet** düğmesiyle odadaki oyuncuları, takımlarını ve görevlerini görür. Aktif turda, zar dağıtımında, inşa ve oylama aşamasında bu işlem kapalıdır. Mevcut lobi çıkarma işlemi korunur.

Normal çıkarma onayında oyun kalan oyuncularla devam eder. Kaptan ve mimar görevleri aynı takımın kalan oyuncusuna geçer; mimar değişince hazır işareti temizlenir. Pong'un bekleyen kontrol koltukları ve rövanş koltukları güncellenir; takımda tek oyuncu kalırsa tek kişilik kontrol kullanılır.

Takımın son oyuncusunu çıkarmak ayrı bir uyarı gerektirir: **“Onu çıkarırsan oda kapanacak ve herkes ana ekrana dönecek.”** Kurucu ancak **Çıkar ve Odayı Kapat** düğmesine basarsa oda kapanır. Bu durumda üyelik ve oyun geçmişi silinmez; tüm odanın erişimi kapatılır. Kurucu kendisini bu menüden çıkaramaz. Test botları mevcut lobi ayarlarından yönetilir.

Sunucu her istekte kurucu yetkisini, güncel aşamayı ve takım nüfusunu oda kilidi altında kontrol eder. Uyarı açıldıktan sonra takım nüfusu değişirse normal çıkarma isteği odayı kapatamaz; arayüz daha güçlü onayı gösterip ikinci bir kullanıcı eylemi bekler. Tur aynı anda başlarsa çıkarma reddedilir.

Otomatik testler: PostgreSQL/PGlite ile gerçek RPC çalıştırılır; yetkisiz istek, canlı tur engeli, son oyuncu onayı, aynı isteğin tekrarı, rol devri ve Pong koltukları sınanır. Arayüz testlerinde uyarı, vazgeçme ve eski oyuncu listesi nedeniyle yeniden onay isteme doğrulanır. Gerçek telefonlarda çıkarılan oyuncunun ana ekrana dönüşü ve tüm cihazların kapanan odadan çıkması ayrıca denenmelidir.
