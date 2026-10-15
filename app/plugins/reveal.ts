/**
 * v-reveal: fade-up on scroll (docs/blueprint/14 §2). Universal, not .client: SSR renders the element
 * normally (getSSRProps), and content is only hidden once the runtime class is on <html>, so a JS failure
 * never leaves it invisible. Honours prefers-reduced-motion.
 */
export default defineNuxtPlugin((nuxtApp) => {
  let observer: IntersectionObserver | null = null
  const motionOk = () => import.meta.client && window.matchMedia('(prefers-reduced-motion: no-preference)').matches

  if (import.meta.client && motionOk()) {
    document.documentElement.classList.add('reveal-ready')
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('revealed')
        observer?.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -10% 0px' })
  }

  nuxtApp.vueApp.directive('reveal', {
    getSSRProps: () => ({}),
    mounted(el: HTMLElement) {
      if (!observer) return
      el.classList.add('reveal')
      observer.observe(el)
    },
    unmounted(el: HTMLElement) {
      observer?.unobserve(el)
    }
  })
})
