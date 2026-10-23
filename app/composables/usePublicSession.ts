/**
 * Whether a creator is signed in, for public pages. Checked in the browser after load (the public layout calls
 * `check` on mount), so the server-rendered HTML stays the same for everyone and can be cached.
 */
export function usePublicSession() {
  const signedIn = useState<boolean>('public:signedIn', () => false)

  async function check(): Promise<void> {
    const res = await $fetch<{ signedIn: boolean }>('/api/public/session').catch(() => null)
    signedIn.value = Boolean(res?.signedIn)
  }

  return { signedIn, check }
}
