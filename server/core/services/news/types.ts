/** One headline as a news source lists it, in its order (rank 1 = top). Provider vocabulary stays in the driver. */
export interface NewsHeadline {
  externalId: string
  title: string
  source: string | null
  url: string
  publishedAt: Date | null
  rank: number
}

export type NewsRegion = 'id' | 'world'

export interface NewsSource {
  name: string
  topHeadlines(region: NewsRegion): Promise<NewsHeadline[]>
}
