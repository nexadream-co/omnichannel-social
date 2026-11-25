import type { CoreContext } from './context'
import { refreshNews } from './news/service'
import type { NewsRegion } from './services/news'
import { backfillStarterTemplates } from './templates/service'

export interface ContentSyncResult {
  /** Workspaces that received the starter templates this run. */
  templates: number | null
  /** Headlines stored per region; null = that region failed or the card is off. */
  news: Record<NewsRegion, number | null> | null
}

/**
 * Fills the content a live database would otherwise wait for: starter templates for workspaces made before they
 * existed, and a "Lagi rame" read right now instead of at the next hourly tick. Safe to run any time and as often as
 * wanted (`npm run content:sync`, every deploy build, the "Content sync" GitHub workflow).
 */
export async function syncContent(ctx: CoreContext, only: { templates?: boolean, news?: boolean } = {}): Promise<ContentSyncResult> {
  const templates = only.templates !== false ? await backfillStarterTemplates(ctx.db) : null
  const news = only.news !== false ? await refreshNews(ctx) : null
  return { templates, news }
}
