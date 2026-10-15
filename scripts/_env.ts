/** Loads .env for scripts (Nuxt loads it for the app). Missing file is fine (CI passes real env). */
export function loadDotEnv(file = '.env') {
  try {
    process.loadEnvFile(file)
  } catch {
    // no .env — rely on the environment
  }
}
