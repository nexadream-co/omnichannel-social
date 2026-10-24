import { sparkAt } from '~/utils/spark'

/**
 * v-spark: a burst on click. `v-spark.manual` only marks the element so code can call sparkAt(el) after a success.
 * Universal like v-reveal: nothing is rendered on the server (getSSRProps), so the landing page stays SSR-safe.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('spark', {
    getSSRProps: () => ({}),
    mounted(el: HTMLElement & { _sparkClick?: (event: MouseEvent) => void }, binding) {
      if (binding.modifiers.manual) {
        el.dataset.spark = 'manual'
        return
      }
      el._sparkClick = event => sparkAt(event)
      el.addEventListener('click', el._sparkClick)
    },
    unmounted(el: HTMLElement & { _sparkClick?: (event: MouseEvent) => void }) {
      if (el._sparkClick) el.removeEventListener('click', el._sparkClick)
    }
  })
})
