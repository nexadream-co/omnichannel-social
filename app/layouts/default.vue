<script setup lang="ts">
interface Site { company: { name: string, tagline: string, legalName: string, email: string, phone: string, address: string, whatsapp: string, instagram: string, threads: string, tiktok: string, youtube: string } }

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { data: site } = await useFetch<Site>('/api/public/site')

// lang + hreflang alternates for id/en (docs/blueprint/14 §6).
const localeHead = useLocaleHead({ seo: true })
useHead(() => ({ htmlAttrs: { lang: localeHead.value.htmlAttrs?.lang }, link: localeHead.value.link, meta: localeHead.value.meta }))

const onLanding = computed(() => route.path === localePath('/'))
const sections = computed(() => [
  { id: 'fitur', label: t('landing.nav.features') },
  { id: 'cara-kerja', label: t('landing.nav.how') },
  { id: 'harga', label: t('landing.nav.pricing') },
  { id: 'faq', label: t('landing.nav.faq') },
  { id: 'kontak', label: t('landing.nav.contact') }
])
const sectionLink = (id: string) => (onLanding.value ? `#${id}` : `${localePath('/')}#${id}`)
const menuOpen = ref(false)
watch(() => route.fullPath, () => {
  menuOpen.value = false
})

// A signed-in creator gets one way back into the app instead of "Masuk / Coba gratis".
const { signedIn, check: checkSession } = usePublicSession()
onMounted(checkSession)

// Highlight the landing section in view, so the nav shows where the reader is.
const activeSection = ref<string | null>(null)
let sectionObserver: IntersectionObserver | null = null
function observeSections() {
  sectionObserver?.disconnect()
  activeSection.value = null
  if (!onLanding.value) return
  sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) activeSection.value = entry.target.id
    }
  }, { rootMargin: '-45% 0px -50% 0px' })
  for (const s of sections.value) {
    const el = document.getElementById(s.id)
    if (el) sectionObserver.observe(el)
  }
}
onMounted(() => {
  observeSections()
  watch(onLanding, () => nextTick(observeSections))
})
onBeforeUnmount(() => sectionObserver?.disconnect())

const socials = computed(() => {
  const c = site.value?.company
  if (!c) return []
  const handle = (v: string) => v.replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '')
  return [
    c.instagram && { icon: 'i-simple-icons-instagram', label: 'Instagram', to: `https://instagram.com/${handle(c.instagram)}` },
    c.threads && { icon: 'i-simple-icons-threads', label: 'Threads', to: `https://threads.net/@${handle(c.threads)}` },
    c.tiktok && { icon: 'i-simple-icons-tiktok', label: 'TikTok', to: `https://tiktok.com/@${handle(c.tiktok)}` },
    c.youtube && { icon: 'i-simple-icons-youtube', label: 'YouTube', to: c.youtube.startsWith('http') ? c.youtube : `https://youtube.com/@${handle(c.youtube)}` },
    c.whatsapp && { icon: 'i-simple-icons-whatsapp', label: 'WhatsApp', to: `https://wa.me/${c.whatsapp.replace(/\D/g, '')}` }
  ].filter(Boolean) as { icon: string, label: string, to: string }[]
})
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-default">
    <header class="sticky top-0 z-40 border-b border-default bg-default/90 backdrop-blur">
      <UContainer class="h-16 flex items-center justify-between gap-4">
        <NuxtLink
          :to="localePath('/')"
          class="font-bold text-lg text-primary shrink-0"
        >
          {{ site?.company.name || t('app.name') }}
        </NuxtLink>
        <nav class="hidden lg:flex items-center gap-1">
          <UButton
            v-for="s in sections"
            :key="s.id"
            :to="sectionLink(s.id)"
            :color="activeSection === s.id ? 'primary' : 'neutral'"
            variant="ghost"
            :label="s.label"
          />
        </nav>
        <div class="flex items-center gap-1">
          <LocaleSwitch />
          <UColorModeButton />
          <UButton
            v-if="signedIn"
            :to="localePath('/app')"
            :label="t('landing.ctaApp')"
          />
          <template v-else>
            <UButton
              :to="localePath('/app/auth/login')"
              variant="ghost"
              color="neutral"
              :label="t('landing.ctaLogin')"
              class="hidden sm:inline-flex"
            />
            <UButton
              :to="localePath('/app/auth/register')"
              :label="t('landing.ctaRegister')"
              class="hidden sm:inline-flex"
            />
          </template>
          <UButton
            class="lg:hidden"
            color="neutral"
            variant="ghost"
            icon="i-lucide-menu"
            :aria-label="t('nav.more')"
            @click="menuOpen = true"
          />
        </div>
      </UContainer>
    </header>
    <USlideover
      v-model:open="menuOpen"
      side="right"
      :title="site?.company.name || t('app.name')"
    >
      <template #body>
        <nav class="flex flex-col gap-1">
          <UButton
            v-for="s in sections"
            :key="s.id"
            :to="sectionLink(s.id)"
            color="neutral"
            variant="ghost"
            size="lg"
            block
            class="justify-start"
            :label="s.label"
            @click="menuOpen = false"
          />
        </nav>
        <div class="mt-6 grid gap-2">
          <UButton
            v-if="signedIn"
            :to="localePath('/app')"
            size="lg"
            block
            :label="t('landing.ctaApp')"
          />
          <template v-else>
            <UButton
              :to="localePath('/app/auth/register')"
              size="lg"
              block
              :label="t('landing.ctaRegister')"
            />
            <UButton
              :to="localePath('/app/auth/login')"
              size="lg"
              block
              color="neutral"
              variant="outline"
              :label="t('landing.ctaLogin')"
            />
          </template>
        </div>
      </template>
    </USlideover>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-default py-10 text-sm">
      <UContainer class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div class="space-y-2 lg:col-span-2">
          <p class="font-bold text-primary text-base">
            {{ site?.company.name || t('app.name') }}
          </p>
          <p class="text-muted max-w-sm">
            {{ site?.company.tagline }}
          </p>
          <p
            v-if="site?.company.legalName || site?.company.address"
            class="text-xs text-dimmed whitespace-pre-line"
          >
            {{ [site?.company.legalName, site?.company.address].filter(Boolean).join('\n') }}
          </p>
          <div
            v-if="socials.length"
            class="flex gap-3 pt-2"
          >
            <a
              v-for="s in socials"
              :key="s.label"
              :href="s.to"
              target="_blank"
              rel="noopener"
              :aria-label="s.label"
              class="text-muted hover:text-default"
            >
              <UIcon
                :name="s.icon"
                class="size-5"
              />
            </a>
          </div>
        </div>
        <div class="space-y-2">
          <p class="font-medium text-highlighted">
            {{ t('landing.footer.product') }}
          </p>
          <NuxtLink
            :to="localePath('/harga')"
            class="block text-muted hover:text-default"
          >
            {{ t('landing.nav.pricing') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/page/bantuan')"
            class="block text-muted hover:text-default"
          >
            {{ t('landing.footer.help') }}
          </NuxtLink>
          <NuxtLink
            :to="sectionLink('kontak')"
            class="block text-muted hover:text-default"
          >
            {{ t('landing.nav.contact') }}
          </NuxtLink>
        </div>
        <div class="space-y-2">
          <p class="font-medium text-highlighted">
            {{ t('landing.footer.legal') }}
          </p>
          <NuxtLink
            :to="localePath('/privacy')"
            class="block text-muted hover:text-default"
          >
            {{ t('auth.privacy') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/terms')"
            class="block text-muted hover:text-default"
          >
            {{ t('auth.terms') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/page/kebijakan-pembayaran')"
            class="block text-muted hover:text-default"
          >
            {{ t('landing.footer.paymentPolicy') }}
          </NuxtLink>
          <NuxtLink
            :to="localePath('/hapus-akun')"
            class="block text-muted hover:text-default"
          >
            {{ t('legal.deleteShort') }}
          </NuxtLink>
        </div>
      </UContainer>
      <UContainer class="mt-8 pt-6 border-t border-default text-xs text-dimmed">
        © {{ new Date().getFullYear() }} {{ site?.company.legalName || site?.company.name || t('app.name') }}
      </UContainer>
    </footer>
  </div>
</template>
