import type { LibraryTag, TagBreadth, TagNiche, TagStatus } from './types'

/**
 * Starter tag list for Indonesian affiliate creators. Shipped by migration 0008 and the seed with
 * deterministic ids (`hashtag-<tag>`); after that /admin/hashtags is the source of truth.
 * `keywords` are caption words that make the tag fit (lowercase, single words).
 */
type Row = [tag: string, breadth: TagBreadth, keywords?: string[], status?: TagStatus]

const NICHES: Record<TagNiche, { keywords: string[], rows: Row[] }> = {
  skincare: {
    keywords: ['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori'],
    rows: [
      ['skincare', 'broad'],
      ['skincareindonesia', 'niche'],
      ['skincareroutine', 'niche', ['rutin', 'routine', 'malam', 'pagi']],
      ['skincarereview', 'niche', ['review', 'ulasan']],
      ['reviewskincare', 'niche', ['review', 'ulasan']],
      ['racunskincare', 'niche', ['racun']],
      ['skincaremurah', 'specific', ['murah', 'hemat', 'terjangkau']],
      ['skincarelokal', 'specific', ['lokal']],
      ['skincarepemula', 'specific', ['pemula', 'basic']],
      ['sunscreen', 'specific', ['sunscreen', 'sunblock', 'spf', 'matahari']],
      ['sunscreenwajah', 'specific', ['sunscreen', 'sunblock', 'spf']],
      ['serumwajah', 'specific', ['serum']],
      ['moisturizer', 'specific', ['moisturizer', 'pelembap']],
      ['facialwash', 'specific', ['facial', 'wash', 'cleanser', 'sabun']],
      ['tonerwajah', 'specific', ['toner']],
      ['kulitberminyak', 'specific', ['berminyak', 'minyak', 'oily']],
      ['kulitkering', 'specific', ['kering', 'dry']],
      ['kulitsensitif', 'specific', ['sensitif', 'sensitive', 'kemerahan']],
      ['jerawat', 'specific', ['jerawat', 'acne', 'breakout']],
      ['bekasjerawat', 'specific', ['bekas', 'jerawat', 'noda']],
      ['glowingskin', 'specific', ['glowing', 'cerah', 'glow']]
    ]
  },
  makeup: {
    keywords: ['makeup', 'lipstik', 'lipstick', 'lip', 'lipcream', 'tint', 'cushion', 'foundation', 'bedak', 'powder', 'maskara', 'mascara', 'eyeliner', 'blush', 'perona', 'alis', 'eyebrow', 'kosmetik', 'concealer'],
    rows: [
      ['makeup', 'broad'],
      ['makeupindonesia', 'niche'],
      ['makeuplokal', 'specific', ['lokal']],
      ['makeuppemula', 'specific', ['pemula', 'belajar']],
      ['makeupnatural', 'specific', ['natural', 'flawless', 'tipis']],
      ['makeuptutorial', 'niche', ['tutorial', 'cara', 'langkah']],
      ['racunmakeup', 'niche', ['racun']],
      ['lipcream', 'specific', ['lipcream', 'lip', 'cream']],
      ['lipstiklokal', 'specific', ['lipstik', 'lipstick', 'lokal']],
      ['cushion', 'specific', ['cushion']],
      ['foundation', 'specific', ['foundation']],
      ['maskara', 'specific', ['maskara', 'mascara', 'bulu', 'mata']],
      ['kecantikan', 'broad', ['cantik', 'kecantikan', 'beauty']]
    ]
  },
  fashion: {
    keywords: ['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse'],
    rows: [
      ['fashion', 'broad'],
      ['ootd', 'broad'],
      ['ootdindo', 'niche'],
      ['ootdhijab', 'specific', ['hijab', 'kerudung', 'jilbab']],
      ['hijabstyle', 'niche', ['hijab', 'kerudung', 'jilbab']],
      ['hijabinstan', 'specific', ['hijab', 'instan', 'bergo']],
      ['fashionmuslim', 'niche', ['muslim', 'gamis', 'hijab', 'syari']],
      ['fashionwanita', 'niche', ['wanita', 'cewek', 'perempuan']],
      ['fashionpria', 'niche', ['pria', 'cowok', 'laki']],
      ['fashionlokal', 'specific', ['lokal', 'brand']],
      ['outfitkuliah', 'specific', ['kuliah', 'kampus']],
      ['outfitkerja', 'specific', ['kerja', 'kantor', 'formal']],
      ['outfitharian', 'specific', ['harian', 'daily', 'santai']],
      ['racunbaju', 'niche', ['racun', 'baju']],
      ['bajumurah', 'specific', ['murah', 'baju', 'hemat']],
      ['dresswanita', 'specific', ['dress']],
      ['gamis', 'specific', ['gamis']],
      ['sneakers', 'specific', ['sneakers', 'sepatu']],
      ['sepatuwanita', 'specific', ['sepatu', 'heels', 'flatshoes']],
      ['taswanita', 'specific', ['tas', 'bag', 'totebag', 'slingbag']]
    ]
  },
  gadget: {
    keywords: ['hp', 'handphone', 'smartphone', 'gadget', 'earphone', 'headset', 'tws', 'earbuds', 'powerbank', 'charger', 'kabel', 'casing', 'case', 'smartwatch', 'laptop', 'keyboard', 'mouse', 'speaker', 'kamera', 'tablet', 'ipad', 'iphone', 'android', 'samsung', 'xiaomi', 'baterai'],
    rows: [
      ['gadget', 'broad'],
      ['gadgetindonesia', 'niche'],
      ['reviewgadget', 'niche', ['review', 'ulasan']],
      ['racungadget', 'niche', ['racun']],
      ['gadgetmurah', 'specific', ['murah', 'hemat']],
      ['reviewhp', 'specific', ['hp', 'handphone', 'smartphone', 'review']],
      ['hpmurah', 'specific', ['hp', 'handphone', 'murah']],
      ['twsmurah', 'specific', ['tws', 'earbuds', 'earphone', 'murah']],
      ['powerbank', 'specific', ['powerbank', 'baterai', 'charger']],
      ['smartwatch', 'specific', ['smartwatch', 'jam']],
      ['aksesorishp', 'specific', ['casing', 'case', 'kabel', 'charger', 'holder', 'aksesoris']],
      ['laptopmurah', 'specific', ['laptop', 'notebook', 'murah']],
      ['setupmeja', 'specific', ['setup', 'meja', 'desk', 'keyboard', 'monitor']],
      ['techreview', 'niche', ['review', 'tech']]
    ]
  },
  home: {
    keywords: ['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas'],
    rows: [
      ['homedecor', 'broad', ['decor', 'dekorasi']],
      ['homedecorindonesia', 'niche', ['decor', 'dekorasi']],
      ['dekorasirumah', 'niche', ['dekorasi', 'decor', 'hiasan']],
      ['rumahminimalis', 'niche', ['minimalis', 'minimalist']],
      ['perabotrumah', 'specific', ['perabot', 'furniture', 'meja', 'kursi', 'lemari']],
      ['peralatandapur', 'specific', ['dapur', 'panci', 'wajan', 'pisau', 'spatula']],
      ['alatdapur', 'specific', ['dapur', 'panci', 'wajan']],
      ['racunrumahtangga', 'niche', ['racun', 'rumah', 'tangga']],
      ['rumahtangga', 'niche', ['rumah', 'tangga']],
      ['organizerrumah', 'specific', ['organizer', 'rak', 'penyimpanan', 'kotak', 'rapi']],
      ['kamartidur', 'specific', ['kamar', 'tidur', 'sprei', 'bantal', 'kasur']],
      ['bersihbersih', 'specific', ['bersih', 'sapu', 'pel', 'cleaning', 'beres']],
      ['tanamanhias', 'specific', ['tanaman', 'pot', 'bunga']]
    ]
  },
  food: {
    keywords: ['makan', 'makanan', 'masak', 'masakan', 'resep', 'cemilan', 'camilan', 'snack', 'keripik', 'kue', 'kopi', 'teh', 'minuman', 'frozen', 'sambal', 'bumbu', 'mie', 'enak', 'lezat', 'kuliner', 'jajan', 'jajanan'],
    rows: [
      ['kuliner', 'broad'],
      ['foodie', 'broad', ['food']],
      ['kulinerindonesia', 'niche'],
      ['makananenak', 'niche', ['enak', 'lezat', 'nikmat']],
      ['jajanan', 'niche', ['jajan', 'jajanan']],
      ['cemilan', 'specific', ['cemilan', 'camilan', 'snack', 'keripik']],
      ['snackmurah', 'specific', ['snack', 'cemilan', 'murah']],
      ['resepmudah', 'specific', ['resep', 'mudah', 'gampang']],
      ['resepmasakan', 'specific', ['resep', 'masakan', 'masak']],
      ['masakrumahan', 'specific', ['masak', 'rumahan', 'rumah']],
      ['frozenfood', 'specific', ['frozen', 'beku', 'nugget', 'sosis']],
      ['kopisusu', 'specific', ['kopi', 'susu']],
      ['makanansehat', 'specific', ['sehat', 'diet', 'healthy']]
    ]
  },
  mom_baby: {
    keywords: ['bayi', 'baby', 'anak', 'balita', 'mpasi', 'popok', 'diapers', 'menyusui', 'asi', 'stroller', 'mainan', 'ibu', 'mama', 'bunda', 'parenting', 'kids', 'toddler'],
    rows: [
      ['parenting', 'broad'],
      ['momlife', 'niche', ['ibu', 'mama', 'bunda', 'mom']],
      ['ibudananak', 'niche', ['ibu', 'anak']],
      ['perlengkapanbayi', 'specific', ['bayi', 'baby', 'perlengkapan']],
      ['perlengkapananak', 'specific', ['anak', 'perlengkapan']],
      ['mpasi', 'specific', ['mpasi', 'makan', 'bayi']],
      ['popokbayi', 'specific', ['popok', 'diapers', 'pampers']],
      ['mainananak', 'specific', ['mainan', 'anak', 'toys']],
      ['mainanedukasi', 'specific', ['mainan', 'edukasi', 'belajar']],
      ['ibumenyusui', 'specific', ['menyusui', 'asi', 'pumping']],
      ['bajuanak', 'specific', ['baju', 'anak', 'kids']]
    ]
  },
  health_sport: {
    keywords: ['olahraga', 'gym', 'workout', 'fitness', 'yoga', 'lari', 'running', 'sepeda', 'gowes', 'diet', 'sehat', 'kesehatan', 'vitamin', 'protein', 'matras', 'dumbbell', 'badan', 'stretching'],
    rows: [
      ['olahraga', 'broad'],
      ['hidupsehat', 'niche', ['sehat', 'healthy']],
      ['gymindonesia', 'niche', ['gym', 'fitness']],
      ['olahragadirumah', 'specific', ['rumah', 'home', 'workout']],
      ['alatolahraga', 'specific', ['alat', 'matras', 'dumbbell', 'skipping']],
      ['dietsehat', 'specific', ['diet', 'sehat', 'kalori']],
      ['yogaindonesia', 'specific', ['yoga', 'matras']],
      ['larisehat', 'specific', ['lari', 'running', 'jogging']],
      ['gowes', 'specific', ['sepeda', 'gowes', 'bike']]
    ]
  },
  hobby: {
    keywords: ['buku', 'novel', 'baca', 'game', 'gaming', 'alat', 'tulis', 'stationery', 'kucing', 'anjing', 'hewan', 'peliharaan', 'kamera', 'foto', 'jahit', 'rajut', 'lukis'],
    rows: [
      ['rekomendasibuku', 'specific', ['buku', 'novel', 'baca']],
      ['bacabuku', 'niche', ['buku', 'baca', 'novel']],
      ['gamingindonesia', 'niche', ['game', 'gaming', 'gamer']],
      ['alattulis', 'specific', ['alat', 'tulis', 'pulpen', 'pensil', 'stationery', 'buku']],
      ['perlengkapankucing', 'specific', ['kucing', 'cat', 'pasir']],
      ['makanankucing', 'specific', ['kucing', 'makanan', 'cat']],
      ['pecintakucing', 'niche', ['kucing', 'cat', 'anabul']]
    ]
  },
  general: {
    keywords: [], // each general tag lists its own words (see below)
    rows: [
      ['racunshopee', 'niche', ['racun', 'shopee']],
      ['racuntiktok', 'niche', ['racun', 'tiktok']],
      ['shopeehaul', 'niche', ['shopee', 'haul']],
      ['shopeefinds', 'niche', ['shopee', 'finds', 'temuan']],
      ['rekomendasi', 'broad', ['rekomendasi', 'rekomen', 'recommended']],
      ['rekomendasibarang', 'niche', ['rekomendasi', 'barang']],
      ['barangunik', 'specific', ['unik', 'barang', 'lucu']],
      ['barangmurah', 'specific', ['murah', 'barang', 'hemat']],
      ['reviewjujur', 'specific', ['review', 'jujur', 'ulasan']],
      ['reviewproduk', 'niche', ['review', 'produk', 'ulasan']],
      ['belanjaonline', 'niche', ['belanja', 'online', 'checkout']],
      ['promo', 'broad', ['promo', 'diskon', 'sale']],
      ['diskon', 'broad', ['diskon', 'promo', 'sale', 'potongan']],
      // Says nothing about the content: the quality check warns, the list never suggests them.
      ['fyp', 'broad', [], 'generic'],
      ['foryou', 'broad', [], 'generic'],
      ['foryoupage', 'broad', [], 'generic'],
      ['viral', 'broad', [], 'generic'],
      ['trending', 'broad', [], 'generic'],
      ['explore', 'broad', [], 'generic'],
      ['explorepage', 'broad', [], 'generic'],
      ['love', 'broad', [], 'generic'],
      ['instagood', 'broad', [], 'generic'],
      ['instadaily', 'broad', [], 'generic'],
      ['photooftheday', 'broad', [], 'generic'],
      ['instagram', 'broad', [], 'generic'],
      ['reels', 'broad', [], 'generic'],
      ['reelsinstagram', 'broad', [], 'generic'],
      ['happy', 'broad', [], 'generic'],
      ['beautiful', 'broad', [], 'generic'],
      ['xyzbca', 'broad', [], 'generic'],
      // Engagement bait the platforms treat as spam: never suggested, flagged red.
      ['followforfollow', 'broad', [], 'blocked'],
      ['follow4follow', 'broad', [], 'blocked'],
      ['f4f', 'broad', [], 'blocked'],
      ['like4like', 'broad', [], 'blocked'],
      ['likeforlike', 'broad', [], 'blocked'],
      ['l4l', 'broad', [], 'blocked'],
      ['likes4likes', 'broad', [], 'blocked'],
      ['followback', 'broad', [], 'blocked'],
      ['followme', 'broad', [], 'blocked'],
      ['tagsforlikes', 'broad', [], 'blocked'],
      ['spam4spam', 'broad', [], 'blocked'],
      ['freefollowers', 'broad', [], 'blocked']
    ]
  }
}

export const SEED_HASHTAGS: (LibraryTag & { id: string })[] = Object.entries(NICHES).flatMap(([niche, { keywords, rows }]) =>
  rows.map(([tag, breadth, extra, status = 'recommended']) => ({
    id: `hashtag-${tag}`,
    tag,
    niche: niche as TagNiche,
    // Broad and niche tags inherit the niche's words; specific tags, and general affiliate tags that would otherwise
    // fit any caption saying "murah", fit only on their own words.
    keywords: [...new Set(status !== 'recommended' ? [] : breadth === 'specific' || niche === 'general' ? (extra ?? []) : [...keywords, ...(extra ?? [])])],
    breadth,
    status,
    platforms: []
  }))
)
