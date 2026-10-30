import { supabase } from './supabase';

/**
 * Sunucu saati ile cihaz saati arasındaki farkı tahmin eder (ms).
 * Geri sayımlar cihaz saatine göre yanlış olmasın diye kullanılır.
 */
let offsetMs = 0;
let isSynced = false;

export const serverNow = () => Date.now() + offsetMs;

export const getServerOffset = () => offsetMs;

export const isTimeSynced = () => isSynced;

async function timedFetch(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Keep the deadline alive while reading the trace body as well as headers.
    const text = options.method === 'HEAD' ? '' : await response.text();
    return { ok: response.ok, text, date: response.headers.get('date') };
  }
  finally { clearTimeout(timer); }
}

export async function syncServerTime(): Promise<void> {
  // 1. Birincil yöntem: Cloudflare trace (CORS: * destekler, gövdede 'ts=' döner, dünya çapında hızlı)
  try {
    const t0 = Date.now();
    const res = await timedFetch('https://cloudflare.com/cdn-cgi/trace');
    if (res.ok) {
      const text = res.text;
      const t1 = Date.now();
      const match = text.match(/ts=([\d.]+)/);
      if (match) {
        const serverTs = parseFloat(match[1]) * 1000;
        offsetMs = serverTs - (t0 + t1) / 2;
        isSynced = true;
        return;
      }
    }
  } catch {
    /* Cloudflare başarısız olursa sonraki adıma geç */
  }

  // 2. İkincil yöntem: Supabase HEAD isteği (CORS izin verirse Date başlığından)
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const t0 = Date.now();
      const res = await timedFetch(`${url}/rest/v1/`, { method: 'HEAD', headers: { apikey: key } });
      const t1 = Date.now();
      const date = res.date;
      if (date) {
        samples.push(Date.parse(date) + 500 - (t0 + t1) / 2);
      }
    } catch {
      /* sonraki örnek */
    }
  }
  if (samples.length) {
    samples.sort((a, b) => a - b);
    offsetMs = samples[Math.floor(samples.length / 2)];
    isSynced = true;
  }
}

export { supabase };

