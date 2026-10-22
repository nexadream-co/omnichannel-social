CREATE TYPE "public"."hashtag_breadth" AS ENUM('broad', 'niche', 'specific');--> statement-breakpoint
CREATE TYPE "public"."hashtag_research_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "public"."hashtag_status" AS ENUM('recommended', 'generic', 'blocked');--> statement-breakpoint
CREATE TABLE "hashtag_library" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"niche" text NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"breadth" "hashtag_breadth" DEFAULT 'niche' NOT NULL,
	"status" "hashtag_status" DEFAULT 'recommended' NOT NULL,
	"platforms" "platform"[] DEFAULT '{}'::platform[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtag_library_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "hashtag_research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"caption_hash" text NOT NULL,
	"platforms" "platform"[] DEFAULT '{}'::platform[] NOT NULL,
	"status" "hashtag_research_status" DEFAULT 'ready' NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtag_research_runs_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "hashtag_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtag_sets_workspaceId_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "hashtag_signals" (
	"platform" "platform" NOT NULL,
	"tag" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtag_signals_platform_tag_pk" PRIMARY KEY("platform","tag")
);
--> statement-breakpoint
ALTER TABLE "hashtag_research_runs" ADD CONSTRAINT "hashtag_research_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_sets" ADD CONSTRAINT "hashtag_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hashtag_library_niche_status_index" ON "hashtag_library" USING btree ("niche","status");--> statement-breakpoint
CREATE INDEX "hashtag_research_runs_workspace_id_created_at_index" ON "hashtag_research_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "hashtag_research_runs_workspace_id_caption_hash_created_at_index" ON "hashtag_research_runs" USING btree ("workspace_id","caption_hash","created_at");--> statement-breakpoint
CREATE INDEX "hashtag_sets_workspace_id_created_at_index" ON "hashtag_sets" USING btree ("workspace_id","created_at");--> statement-breakpoint
-- Reference data (docs/blueprint/19 §2): the starter tag list, staff permissions, the admin menu entry, the Threads
-- search switch and the research allowance per plan. Inserts and the plan update never overwrite admin edits.
INSERT INTO "hashtag_library" ("id", "tag", "niche", "keywords", "breadth", "status") VALUES
  ('hashtag-skincare', 'skincare', 'skincare', ARRAY['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori']::text[], 'broad', 'recommended'),
  ('hashtag-skincareindonesia', 'skincareindonesia', 'skincare', ARRAY['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori']::text[], 'niche', 'recommended'),
  ('hashtag-skincareroutine', 'skincareroutine', 'skincare', ARRAY['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori', 'rutin', 'routine', 'malam', 'pagi']::text[], 'niche', 'recommended'),
  ('hashtag-skincarereview', 'skincarereview', 'skincare', ARRAY['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori', 'review', 'ulasan']::text[], 'niche', 'recommended'),
  ('hashtag-reviewskincare', 'reviewskincare', 'skincare', ARRAY['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori', 'review', 'ulasan']::text[], 'niche', 'recommended'),
  ('hashtag-racunskincare', 'racunskincare', 'skincare', ARRAY['skincare', 'kulit', 'wajah', 'muka', 'serum', 'toner', 'sunscreen', 'sunblock', 'spf', 'moisturizer', 'pelembap', 'jerawat', 'acne', 'glowing', 'kusam', 'facial', 'cleanser', 'niacinamide', 'retinol', 'ceramide', 'centella', 'pori', 'racun']::text[], 'niche', 'recommended'),
  ('hashtag-skincaremurah', 'skincaremurah', 'skincare', ARRAY['murah', 'hemat', 'terjangkau']::text[], 'specific', 'recommended'),
  ('hashtag-skincarelokal', 'skincarelokal', 'skincare', ARRAY['lokal']::text[], 'specific', 'recommended'),
  ('hashtag-skincarepemula', 'skincarepemula', 'skincare', ARRAY['pemula', 'basic']::text[], 'specific', 'recommended'),
  ('hashtag-sunscreen', 'sunscreen', 'skincare', ARRAY['sunscreen', 'sunblock', 'spf', 'matahari']::text[], 'specific', 'recommended'),
  ('hashtag-sunscreenwajah', 'sunscreenwajah', 'skincare', ARRAY['sunscreen', 'sunblock', 'spf']::text[], 'specific', 'recommended'),
  ('hashtag-serumwajah', 'serumwajah', 'skincare', ARRAY['serum']::text[], 'specific', 'recommended'),
  ('hashtag-moisturizer', 'moisturizer', 'skincare', ARRAY['moisturizer', 'pelembap']::text[], 'specific', 'recommended'),
  ('hashtag-facialwash', 'facialwash', 'skincare', ARRAY['facial', 'wash', 'cleanser', 'sabun']::text[], 'specific', 'recommended'),
  ('hashtag-tonerwajah', 'tonerwajah', 'skincare', ARRAY['toner']::text[], 'specific', 'recommended'),
  ('hashtag-kulitberminyak', 'kulitberminyak', 'skincare', ARRAY['berminyak', 'minyak', 'oily']::text[], 'specific', 'recommended'),
  ('hashtag-kulitkering', 'kulitkering', 'skincare', ARRAY['kering', 'dry']::text[], 'specific', 'recommended'),
  ('hashtag-kulitsensitif', 'kulitsensitif', 'skincare', ARRAY['sensitif', 'sensitive', 'kemerahan']::text[], 'specific', 'recommended'),
  ('hashtag-jerawat', 'jerawat', 'skincare', ARRAY['jerawat', 'acne', 'breakout']::text[], 'specific', 'recommended'),
  ('hashtag-bekasjerawat', 'bekasjerawat', 'skincare', ARRAY['bekas', 'jerawat', 'noda']::text[], 'specific', 'recommended'),
  ('hashtag-glowingskin', 'glowingskin', 'skincare', ARRAY['glowing', 'cerah', 'glow']::text[], 'specific', 'recommended'),
  ('hashtag-makeup', 'makeup', 'makeup', ARRAY['makeup', 'lipstik', 'lipstick', 'lip', 'lipcream', 'tint', 'cushion', 'foundation', 'bedak', 'powder', 'maskara', 'mascara', 'eyeliner', 'blush', 'perona', 'alis', 'eyebrow', 'kosmetik', 'concealer']::text[], 'broad', 'recommended'),
  ('hashtag-makeupindonesia', 'makeupindonesia', 'makeup', ARRAY['makeup', 'lipstik', 'lipstick', 'lip', 'lipcream', 'tint', 'cushion', 'foundation', 'bedak', 'powder', 'maskara', 'mascara', 'eyeliner', 'blush', 'perona', 'alis', 'eyebrow', 'kosmetik', 'concealer']::text[], 'niche', 'recommended'),
  ('hashtag-makeuplokal', 'makeuplokal', 'makeup', ARRAY['lokal']::text[], 'specific', 'recommended'),
  ('hashtag-makeuppemula', 'makeuppemula', 'makeup', ARRAY['pemula', 'belajar']::text[], 'specific', 'recommended'),
  ('hashtag-makeupnatural', 'makeupnatural', 'makeup', ARRAY['natural', 'flawless', 'tipis']::text[], 'specific', 'recommended'),
  ('hashtag-makeuptutorial', 'makeuptutorial', 'makeup', ARRAY['makeup', 'lipstik', 'lipstick', 'lip', 'lipcream', 'tint', 'cushion', 'foundation', 'bedak', 'powder', 'maskara', 'mascara', 'eyeliner', 'blush', 'perona', 'alis', 'eyebrow', 'kosmetik', 'concealer', 'tutorial', 'cara', 'langkah']::text[], 'niche', 'recommended'),
  ('hashtag-racunmakeup', 'racunmakeup', 'makeup', ARRAY['makeup', 'lipstik', 'lipstick', 'lip', 'lipcream', 'tint', 'cushion', 'foundation', 'bedak', 'powder', 'maskara', 'mascara', 'eyeliner', 'blush', 'perona', 'alis', 'eyebrow', 'kosmetik', 'concealer', 'racun']::text[], 'niche', 'recommended'),
  ('hashtag-lipcream', 'lipcream', 'makeup', ARRAY['lipcream', 'lip', 'cream']::text[], 'specific', 'recommended'),
  ('hashtag-lipstiklokal', 'lipstiklokal', 'makeup', ARRAY['lipstik', 'lipstick', 'lokal']::text[], 'specific', 'recommended'),
  ('hashtag-cushion', 'cushion', 'makeup', ARRAY['cushion']::text[], 'specific', 'recommended'),
  ('hashtag-foundation', 'foundation', 'makeup', ARRAY['foundation']::text[], 'specific', 'recommended'),
  ('hashtag-maskara', 'maskara', 'makeup', ARRAY['maskara', 'mascara', 'bulu', 'mata']::text[], 'specific', 'recommended'),
  ('hashtag-kecantikan', 'kecantikan', 'makeup', ARRAY['makeup', 'lipstik', 'lipstick', 'lip', 'lipcream', 'tint', 'cushion', 'foundation', 'bedak', 'powder', 'maskara', 'mascara', 'eyeliner', 'blush', 'perona', 'alis', 'eyebrow', 'kosmetik', 'concealer', 'cantik', 'kecantikan', 'beauty']::text[], 'broad', 'recommended'),
  ('hashtag-fashion', 'fashion', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse']::text[], 'broad', 'recommended'),
  ('hashtag-ootd', 'ootd', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse']::text[], 'broad', 'recommended'),
  ('hashtag-ootdindo', 'ootdindo', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse']::text[], 'niche', 'recommended'),
  ('hashtag-ootdhijab', 'ootdhijab', 'fashion', ARRAY['hijab', 'kerudung', 'jilbab']::text[], 'specific', 'recommended'),
  ('hashtag-hijabstyle', 'hijabstyle', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse']::text[], 'niche', 'recommended'),
  ('hashtag-hijabinstan', 'hijabinstan', 'fashion', ARRAY['hijab', 'instan', 'bergo']::text[], 'specific', 'recommended'),
  ('hashtag-fashionmuslim', 'fashionmuslim', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse', 'muslim', 'syari']::text[], 'niche', 'recommended'),
  ('hashtag-fashionwanita', 'fashionwanita', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse', 'wanita', 'cewek', 'perempuan']::text[], 'niche', 'recommended'),
  ('hashtag-fashionpria', 'fashionpria', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse', 'pria', 'cowok', 'laki']::text[], 'niche', 'recommended'),
  ('hashtag-fashionlokal', 'fashionlokal', 'fashion', ARRAY['lokal', 'brand']::text[], 'specific', 'recommended'),
  ('hashtag-outfitkuliah', 'outfitkuliah', 'fashion', ARRAY['kuliah', 'kampus']::text[], 'specific', 'recommended'),
  ('hashtag-outfitkerja', 'outfitkerja', 'fashion', ARRAY['kerja', 'kantor', 'formal']::text[], 'specific', 'recommended'),
  ('hashtag-outfitharian', 'outfitharian', 'fashion', ARRAY['harian', 'daily', 'santai']::text[], 'specific', 'recommended'),
  ('hashtag-racunbaju', 'racunbaju', 'fashion', ARRAY['baju', 'outfit', 'ootd', 'dress', 'gamis', 'hijab', 'kerudung', 'jilbab', 'kemeja', 'kaos', 'celana', 'rok', 'jaket', 'hoodie', 'sepatu', 'sneakers', 'sandal', 'tas', 'dompet', 'fashion', 'pakaian', 'style', 'atasan', 'blouse', 'racun']::text[], 'niche', 'recommended'),
  ('hashtag-bajumurah', 'bajumurah', 'fashion', ARRAY['murah', 'baju', 'hemat']::text[], 'specific', 'recommended'),
  ('hashtag-dresswanita', 'dresswanita', 'fashion', ARRAY['dress']::text[], 'specific', 'recommended'),
  ('hashtag-gamis', 'gamis', 'fashion', ARRAY['gamis']::text[], 'specific', 'recommended'),
  ('hashtag-sneakers', 'sneakers', 'fashion', ARRAY['sneakers', 'sepatu']::text[], 'specific', 'recommended'),
  ('hashtag-sepatuwanita', 'sepatuwanita', 'fashion', ARRAY['sepatu', 'heels', 'flatshoes']::text[], 'specific', 'recommended'),
  ('hashtag-taswanita', 'taswanita', 'fashion', ARRAY['tas', 'bag', 'totebag', 'slingbag']::text[], 'specific', 'recommended'),
  ('hashtag-gadget', 'gadget', 'gadget', ARRAY['hp', 'handphone', 'smartphone', 'gadget', 'earphone', 'headset', 'tws', 'earbuds', 'powerbank', 'charger', 'kabel', 'casing', 'case', 'smartwatch', 'laptop', 'keyboard', 'mouse', 'speaker', 'kamera', 'tablet', 'ipad', 'iphone', 'android', 'samsung', 'xiaomi', 'baterai']::text[], 'broad', 'recommended'),
  ('hashtag-gadgetindonesia', 'gadgetindonesia', 'gadget', ARRAY['hp', 'handphone', 'smartphone', 'gadget', 'earphone', 'headset', 'tws', 'earbuds', 'powerbank', 'charger', 'kabel', 'casing', 'case', 'smartwatch', 'laptop', 'keyboard', 'mouse', 'speaker', 'kamera', 'tablet', 'ipad', 'iphone', 'android', 'samsung', 'xiaomi', 'baterai']::text[], 'niche', 'recommended'),
  ('hashtag-reviewgadget', 'reviewgadget', 'gadget', ARRAY['hp', 'handphone', 'smartphone', 'gadget', 'earphone', 'headset', 'tws', 'earbuds', 'powerbank', 'charger', 'kabel', 'casing', 'case', 'smartwatch', 'laptop', 'keyboard', 'mouse', 'speaker', 'kamera', 'tablet', 'ipad', 'iphone', 'android', 'samsung', 'xiaomi', 'baterai', 'review', 'ulasan']::text[], 'niche', 'recommended'),
  ('hashtag-racungadget', 'racungadget', 'gadget', ARRAY['hp', 'handphone', 'smartphone', 'gadget', 'earphone', 'headset', 'tws', 'earbuds', 'powerbank', 'charger', 'kabel', 'casing', 'case', 'smartwatch', 'laptop', 'keyboard', 'mouse', 'speaker', 'kamera', 'tablet', 'ipad', 'iphone', 'android', 'samsung', 'xiaomi', 'baterai', 'racun']::text[], 'niche', 'recommended'),
  ('hashtag-gadgetmurah', 'gadgetmurah', 'gadget', ARRAY['murah', 'hemat']::text[], 'specific', 'recommended'),
  ('hashtag-reviewhp', 'reviewhp', 'gadget', ARRAY['hp', 'handphone', 'smartphone', 'review']::text[], 'specific', 'recommended'),
  ('hashtag-hpmurah', 'hpmurah', 'gadget', ARRAY['hp', 'handphone', 'murah']::text[], 'specific', 'recommended'),
  ('hashtag-twsmurah', 'twsmurah', 'gadget', ARRAY['tws', 'earbuds', 'earphone', 'murah']::text[], 'specific', 'recommended'),
  ('hashtag-powerbank', 'powerbank', 'gadget', ARRAY['powerbank', 'baterai', 'charger']::text[], 'specific', 'recommended'),
  ('hashtag-smartwatch', 'smartwatch', 'gadget', ARRAY['smartwatch', 'jam']::text[], 'specific', 'recommended'),
  ('hashtag-aksesorishp', 'aksesorishp', 'gadget', ARRAY['casing', 'case', 'kabel', 'charger', 'holder', 'aksesoris']::text[], 'specific', 'recommended'),
  ('hashtag-laptopmurah', 'laptopmurah', 'gadget', ARRAY['laptop', 'notebook', 'murah']::text[], 'specific', 'recommended'),
  ('hashtag-setupmeja', 'setupmeja', 'gadget', ARRAY['setup', 'meja', 'desk', 'keyboard', 'monitor']::text[], 'specific', 'recommended'),
  ('hashtag-techreview', 'techreview', 'gadget', ARRAY['hp', 'handphone', 'smartphone', 'gadget', 'earphone', 'headset', 'tws', 'earbuds', 'powerbank', 'charger', 'kabel', 'casing', 'case', 'smartwatch', 'laptop', 'keyboard', 'mouse', 'speaker', 'kamera', 'tablet', 'ipad', 'iphone', 'android', 'samsung', 'xiaomi', 'baterai', 'review', 'tech']::text[], 'niche', 'recommended'),
  ('hashtag-homedecor', 'homedecor', 'home', ARRAY['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas']::text[], 'broad', 'recommended'),
  ('hashtag-homedecorindonesia', 'homedecorindonesia', 'home', ARRAY['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas']::text[], 'niche', 'recommended'),
  ('hashtag-dekorasirumah', 'dekorasirumah', 'home', ARRAY['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas', 'hiasan']::text[], 'niche', 'recommended'),
  ('hashtag-rumahminimalis', 'rumahminimalis', 'home', ARRAY['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas', 'minimalis', 'minimalist']::text[], 'niche', 'recommended'),
  ('hashtag-perabotrumah', 'perabotrumah', 'home', ARRAY['perabot', 'furniture', 'meja', 'kursi', 'lemari']::text[], 'specific', 'recommended'),
  ('hashtag-peralatandapur', 'peralatandapur', 'home', ARRAY['dapur', 'panci', 'wajan', 'pisau', 'spatula']::text[], 'specific', 'recommended'),
  ('hashtag-alatdapur', 'alatdapur', 'home', ARRAY['dapur', 'panci', 'wajan']::text[], 'specific', 'recommended'),
  ('hashtag-racunrumahtangga', 'racunrumahtangga', 'home', ARRAY['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas', 'racun', 'tangga']::text[], 'niche', 'recommended'),
  ('hashtag-rumahtangga', 'rumahtangga', 'home', ARRAY['rumah', 'dapur', 'kamar', 'dekorasi', 'decor', 'perabot', 'furniture', 'rak', 'organizer', 'panci', 'wajan', 'kompor', 'blender', 'magicom', 'sprei', 'bantal', 'lampu', 'karpet', 'gorden', 'tanaman', 'sapu', 'pel', 'bersih', 'kulkas', 'kipas', 'tangga']::text[], 'niche', 'recommended'),
  ('hashtag-organizerrumah', 'organizerrumah', 'home', ARRAY['organizer', 'rak', 'penyimpanan', 'kotak', 'rapi']::text[], 'specific', 'recommended'),
  ('hashtag-kamartidur', 'kamartidur', 'home', ARRAY['kamar', 'tidur', 'sprei', 'bantal', 'kasur']::text[], 'specific', 'recommended'),
  ('hashtag-bersihbersih', 'bersihbersih', 'home', ARRAY['bersih', 'sapu', 'pel', 'cleaning', 'beres']::text[], 'specific', 'recommended'),
  ('hashtag-tanamanhias', 'tanamanhias', 'home', ARRAY['tanaman', 'pot', 'bunga']::text[], 'specific', 'recommended'),
  ('hashtag-kuliner', 'kuliner', 'food', ARRAY['makan', 'makanan', 'masak', 'masakan', 'resep', 'cemilan', 'camilan', 'snack', 'keripik', 'kue', 'kopi', 'teh', 'minuman', 'frozen', 'sambal', 'bumbu', 'mie', 'enak', 'lezat', 'kuliner', 'jajan', 'jajanan']::text[], 'broad', 'recommended'),
  ('hashtag-foodie', 'foodie', 'food', ARRAY['makan', 'makanan', 'masak', 'masakan', 'resep', 'cemilan', 'camilan', 'snack', 'keripik', 'kue', 'kopi', 'teh', 'minuman', 'frozen', 'sambal', 'bumbu', 'mie', 'enak', 'lezat', 'kuliner', 'jajan', 'jajanan', 'food']::text[], 'broad', 'recommended'),
  ('hashtag-kulinerindonesia', 'kulinerindonesia', 'food', ARRAY['makan', 'makanan', 'masak', 'masakan', 'resep', 'cemilan', 'camilan', 'snack', 'keripik', 'kue', 'kopi', 'teh', 'minuman', 'frozen', 'sambal', 'bumbu', 'mie', 'enak', 'lezat', 'kuliner', 'jajan', 'jajanan']::text[], 'niche', 'recommended'),
  ('hashtag-makananenak', 'makananenak', 'food', ARRAY['makan', 'makanan', 'masak', 'masakan', 'resep', 'cemilan', 'camilan', 'snack', 'keripik', 'kue', 'kopi', 'teh', 'minuman', 'frozen', 'sambal', 'bumbu', 'mie', 'enak', 'lezat', 'kuliner', 'jajan', 'jajanan', 'nikmat']::text[], 'niche', 'recommended'),
  ('hashtag-jajanan', 'jajanan', 'food', ARRAY['makan', 'makanan', 'masak', 'masakan', 'resep', 'cemilan', 'camilan', 'snack', 'keripik', 'kue', 'kopi', 'teh', 'minuman', 'frozen', 'sambal', 'bumbu', 'mie', 'enak', 'lezat', 'kuliner', 'jajan', 'jajanan']::text[], 'niche', 'recommended'),
  ('hashtag-cemilan', 'cemilan', 'food', ARRAY['cemilan', 'camilan', 'snack', 'keripik']::text[], 'specific', 'recommended'),
  ('hashtag-snackmurah', 'snackmurah', 'food', ARRAY['snack', 'cemilan', 'murah']::text[], 'specific', 'recommended'),
  ('hashtag-resepmudah', 'resepmudah', 'food', ARRAY['resep', 'mudah', 'gampang']::text[], 'specific', 'recommended'),
  ('hashtag-resepmasakan', 'resepmasakan', 'food', ARRAY['resep', 'masakan', 'masak']::text[], 'specific', 'recommended'),
  ('hashtag-masakrumahan', 'masakrumahan', 'food', ARRAY['masak', 'rumahan', 'rumah']::text[], 'specific', 'recommended'),
  ('hashtag-frozenfood', 'frozenfood', 'food', ARRAY['frozen', 'beku', 'nugget', 'sosis']::text[], 'specific', 'recommended'),
  ('hashtag-kopisusu', 'kopisusu', 'food', ARRAY['kopi', 'susu']::text[], 'specific', 'recommended'),
  ('hashtag-makanansehat', 'makanansehat', 'food', ARRAY['sehat', 'diet', 'healthy']::text[], 'specific', 'recommended'),
  ('hashtag-parenting', 'parenting', 'mom_baby', ARRAY['bayi', 'baby', 'anak', 'balita', 'mpasi', 'popok', 'diapers', 'menyusui', 'asi', 'stroller', 'mainan', 'ibu', 'mama', 'bunda', 'parenting', 'kids', 'toddler']::text[], 'broad', 'recommended'),
  ('hashtag-momlife', 'momlife', 'mom_baby', ARRAY['bayi', 'baby', 'anak', 'balita', 'mpasi', 'popok', 'diapers', 'menyusui', 'asi', 'stroller', 'mainan', 'ibu', 'mama', 'bunda', 'parenting', 'kids', 'toddler', 'mom']::text[], 'niche', 'recommended'),
  ('hashtag-ibudananak', 'ibudananak', 'mom_baby', ARRAY['bayi', 'baby', 'anak', 'balita', 'mpasi', 'popok', 'diapers', 'menyusui', 'asi', 'stroller', 'mainan', 'ibu', 'mama', 'bunda', 'parenting', 'kids', 'toddler']::text[], 'niche', 'recommended'),
  ('hashtag-perlengkapanbayi', 'perlengkapanbayi', 'mom_baby', ARRAY['bayi', 'baby', 'perlengkapan']::text[], 'specific', 'recommended'),
  ('hashtag-perlengkapananak', 'perlengkapananak', 'mom_baby', ARRAY['anak', 'perlengkapan']::text[], 'specific', 'recommended'),
  ('hashtag-mpasi', 'mpasi', 'mom_baby', ARRAY['mpasi', 'makan', 'bayi']::text[], 'specific', 'recommended'),
  ('hashtag-popokbayi', 'popokbayi', 'mom_baby', ARRAY['popok', 'diapers', 'pampers']::text[], 'specific', 'recommended'),
  ('hashtag-mainananak', 'mainananak', 'mom_baby', ARRAY['mainan', 'anak', 'toys']::text[], 'specific', 'recommended'),
  ('hashtag-mainanedukasi', 'mainanedukasi', 'mom_baby', ARRAY['mainan', 'edukasi', 'belajar']::text[], 'specific', 'recommended'),
  ('hashtag-ibumenyusui', 'ibumenyusui', 'mom_baby', ARRAY['menyusui', 'asi', 'pumping']::text[], 'specific', 'recommended'),
  ('hashtag-bajuanak', 'bajuanak', 'mom_baby', ARRAY['baju', 'anak', 'kids']::text[], 'specific', 'recommended'),
  ('hashtag-olahraga', 'olahraga', 'health_sport', ARRAY['olahraga', 'gym', 'workout', 'fitness', 'yoga', 'lari', 'running', 'sepeda', 'gowes', 'diet', 'sehat', 'kesehatan', 'vitamin', 'protein', 'matras', 'dumbbell', 'badan', 'stretching']::text[], 'broad', 'recommended'),
  ('hashtag-hidupsehat', 'hidupsehat', 'health_sport', ARRAY['olahraga', 'gym', 'workout', 'fitness', 'yoga', 'lari', 'running', 'sepeda', 'gowes', 'diet', 'sehat', 'kesehatan', 'vitamin', 'protein', 'matras', 'dumbbell', 'badan', 'stretching', 'healthy']::text[], 'niche', 'recommended'),
  ('hashtag-gymindonesia', 'gymindonesia', 'health_sport', ARRAY['olahraga', 'gym', 'workout', 'fitness', 'yoga', 'lari', 'running', 'sepeda', 'gowes', 'diet', 'sehat', 'kesehatan', 'vitamin', 'protein', 'matras', 'dumbbell', 'badan', 'stretching']::text[], 'niche', 'recommended'),
  ('hashtag-olahragadirumah', 'olahragadirumah', 'health_sport', ARRAY['rumah', 'home', 'workout']::text[], 'specific', 'recommended'),
  ('hashtag-alatolahraga', 'alatolahraga', 'health_sport', ARRAY['alat', 'matras', 'dumbbell', 'skipping']::text[], 'specific', 'recommended'),
  ('hashtag-dietsehat', 'dietsehat', 'health_sport', ARRAY['diet', 'sehat', 'kalori']::text[], 'specific', 'recommended'),
  ('hashtag-yogaindonesia', 'yogaindonesia', 'health_sport', ARRAY['yoga', 'matras']::text[], 'specific', 'recommended'),
  ('hashtag-larisehat', 'larisehat', 'health_sport', ARRAY['lari', 'running', 'jogging']::text[], 'specific', 'recommended'),
  ('hashtag-gowes', 'gowes', 'health_sport', ARRAY['sepeda', 'gowes', 'bike']::text[], 'specific', 'recommended'),
  ('hashtag-rekomendasibuku', 'rekomendasibuku', 'hobby', ARRAY['buku', 'novel', 'baca']::text[], 'specific', 'recommended'),
  ('hashtag-bacabuku', 'bacabuku', 'hobby', ARRAY['buku', 'novel', 'baca', 'game', 'gaming', 'alat', 'tulis', 'stationery', 'kucing', 'anjing', 'hewan', 'peliharaan', 'kamera', 'foto', 'jahit', 'rajut', 'lukis']::text[], 'niche', 'recommended'),
  ('hashtag-gamingindonesia', 'gamingindonesia', 'hobby', ARRAY['buku', 'novel', 'baca', 'game', 'gaming', 'alat', 'tulis', 'stationery', 'kucing', 'anjing', 'hewan', 'peliharaan', 'kamera', 'foto', 'jahit', 'rajut', 'lukis', 'gamer']::text[], 'niche', 'recommended'),
  ('hashtag-alattulis', 'alattulis', 'hobby', ARRAY['alat', 'tulis', 'pulpen', 'pensil', 'stationery', 'buku']::text[], 'specific', 'recommended'),
  ('hashtag-perlengkapankucing', 'perlengkapankucing', 'hobby', ARRAY['kucing', 'cat', 'pasir']::text[], 'specific', 'recommended'),
  ('hashtag-makanankucing', 'makanankucing', 'hobby', ARRAY['kucing', 'makanan', 'cat']::text[], 'specific', 'recommended'),
  ('hashtag-pecintakucing', 'pecintakucing', 'hobby', ARRAY['buku', 'novel', 'baca', 'game', 'gaming', 'alat', 'tulis', 'stationery', 'kucing', 'anjing', 'hewan', 'peliharaan', 'kamera', 'foto', 'jahit', 'rajut', 'lukis', 'cat', 'anabul']::text[], 'niche', 'recommended'),
  ('hashtag-racunshopee', 'racunshopee', 'general', ARRAY['racun', 'shopee']::text[], 'niche', 'recommended'),
  ('hashtag-racuntiktok', 'racuntiktok', 'general', ARRAY['racun', 'tiktok']::text[], 'niche', 'recommended'),
  ('hashtag-shopeehaul', 'shopeehaul', 'general', ARRAY['shopee', 'haul']::text[], 'niche', 'recommended'),
  ('hashtag-shopeefinds', 'shopeefinds', 'general', ARRAY['shopee', 'finds', 'temuan']::text[], 'niche', 'recommended'),
  ('hashtag-rekomendasi', 'rekomendasi', 'general', ARRAY['rekomendasi', 'rekomen', 'recommended']::text[], 'broad', 'recommended'),
  ('hashtag-rekomendasibarang', 'rekomendasibarang', 'general', ARRAY['rekomendasi', 'barang']::text[], 'niche', 'recommended'),
  ('hashtag-barangunik', 'barangunik', 'general', ARRAY['unik', 'barang', 'lucu']::text[], 'specific', 'recommended'),
  ('hashtag-barangmurah', 'barangmurah', 'general', ARRAY['murah', 'barang', 'hemat']::text[], 'specific', 'recommended'),
  ('hashtag-reviewjujur', 'reviewjujur', 'general', ARRAY['review', 'jujur', 'ulasan']::text[], 'specific', 'recommended'),
  ('hashtag-reviewproduk', 'reviewproduk', 'general', ARRAY['review', 'produk', 'ulasan']::text[], 'niche', 'recommended'),
  ('hashtag-belanjaonline', 'belanjaonline', 'general', ARRAY['belanja', 'online', 'checkout']::text[], 'niche', 'recommended'),
  ('hashtag-promo', 'promo', 'general', ARRAY['promo', 'diskon', 'sale']::text[], 'broad', 'recommended'),
  ('hashtag-diskon', 'diskon', 'general', ARRAY['diskon', 'promo', 'sale', 'potongan']::text[], 'broad', 'recommended'),
  ('hashtag-fyp', 'fyp', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-foryou', 'foryou', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-foryoupage', 'foryoupage', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-viral', 'viral', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-trending', 'trending', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-explore', 'explore', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-explorepage', 'explorepage', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-love', 'love', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-instagood', 'instagood', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-instadaily', 'instadaily', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-photooftheday', 'photooftheday', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-instagram', 'instagram', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-reels', 'reels', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-reelsinstagram', 'reelsinstagram', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-happy', 'happy', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-beautiful', 'beautiful', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-xyzbca', 'xyzbca', 'general', '{}'::text[], 'broad', 'generic'),
  ('hashtag-followforfollow', 'followforfollow', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-follow4follow', 'follow4follow', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-f4f', 'f4f', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-like4like', 'like4like', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-likeforlike', 'likeforlike', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-l4l', 'l4l', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-likes4likes', 'likes4likes', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-followback', 'followback', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-followme', 'followme', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-tagsforlikes', 'tagsforlikes', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-spam4spam', 'spam4spam', 'general', '{}'::text[], 'broad', 'blocked'),
  ('hashtag-freefollowers', 'freefollowers', 'general', '{}'::text[], 'broad', 'blocked')
ON CONFLICT ("tag") DO NOTHING;
--> statement-breakpoint
INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  (gen_random_uuid()::text, 'hashtags.read', 'hashtags', 'Lihat daftar tagar'),
  (gen_random_uuid()::text, 'hashtags.write', 'hashtags', 'Ubah daftar tagar')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.role_id, p.id
FROM (VALUES ('role-superadmin', 'hashtags.read'), ('role-superadmin', 'hashtags.write'), ('role-admin', 'hashtags.read'), ('role-admin', 'hashtags.write'), ('role-support', 'hashtags.read')) AS r (role_id, key)
JOIN "permissions" p ON p.key = r.key
JOIN "roles" ON "roles"."id" = r.role_id
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "menus" ("id", "parent_id", "label", "slug", "path", "icon", "permission_key", "order")
SELECT 'menu-hashtags', 'menu-content', 'Daftar tagar', 'hashtags', '/admin/hashtags', 'i-lucide-hash', 'hashtags.read', 5
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id" = 'menu-content')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value", "group", "type", "label")
VALUES ('channels.hashtags.threadsSearchEnabled', 'false', 'channels', 'boolean', 'Riset tagar memakai pencarian Threads')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "plans" SET "limits" = "limits" || jsonb_build_object('tagResearchPerMonth', CASE "id" WHEN 'plan-kreator' THEN 100 WHEN 'plan-pro' THEN -1 ELSE 0 END)
WHERE NOT ("limits" ? 'tagResearchPerMonth');
