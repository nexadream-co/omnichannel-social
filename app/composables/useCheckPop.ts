/** A short "saved" state for a button: trigger() flips `done` on, then off after `ms`. */
export function useCheckPop(ms = 1200) {
  const done = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function trigger() {
    done.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      done.value = false
    }, ms)
  }

  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer))
  return { done, trigger }
}
