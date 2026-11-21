import type { NewsHeadline, NewsRegion, NewsSource } from './types'

const SAMPLES: Record<NewsRegion, [string, string][]> = {
  id: [
    ['Harbolnas 12.12 diprediksi pecahkan rekor transaksi belanja online', 'Kompas'],
    ['Tren skincare lokal naik, brand kecil ramai diburu di marketplace', 'Detik'],
    ['BMKG: hujan lebat diprediksi turun di Jabodetabek akhir pekan ini', 'Antara'],
    ['Gaji ke-13 cair, pusat perbelanjaan siapkan diskon besar-besaran', 'CNN Indonesia'],
    ['Timnas Indonesia menang 2-0, laga berikutnya digelar di GBK', 'Bola.net'],
    ['Harga emas hari ini naik tipis, cek daftar lengkapnya', 'Kontan']
  ],
  world: [
    ['Penjualan Black Friday global naik 8 persen dibanding tahun lalu', 'Reuters'],
    ['Film animasi terbaru jadi trending di berbagai negara', 'BBC Indonesia'],
    ['Harga minyak dunia turun setelah stok AS bertambah', 'Bloomberg Technoz'],
    ['Festival musik terbesar Asia umumkan deretan pengisi acara', 'Tempo']
  ]
}

/** Local development and tests (ADAPTER_MODE=fake): fixed headlines, today's date. */
export function fakeNewsSource(overrides: Partial<Record<NewsRegion, NewsHeadline[]>> = {}): NewsSource {
  return {
    name: 'fake',
    async topHeadlines(region) {
      if (overrides[region]) return overrides[region]!
      return SAMPLES[region].map(([title, source], i) => ({
        externalId: `fake-${region}-${i}`, title, source, url: `https://news.example.com/${region}/${i}`,
        publishedAt: new Date(Date.now() - (i + 1) * 3_600_000), rank: i + 1
      }))
    }
  }
}
