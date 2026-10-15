import { describe, expect, it } from 'vitest'
import { isBlockedAddress, safeFetch } from '../../server/core/net/safe-fetch'
import { parsePrice, unfurlHtml } from '../../server/core/net/unfurl'

describe('parsePrice', () => {
  it('reads rupiah in machine and display formats', () => {
    for (const [input, expected] of [['125000', 125000], ['125000.00', 125000], ['Rp 125.000', 125000], ['Rp125.000,00', 125000], ['125,000', 125000], ['Rp 1.250.000', 1250000], [49000, 49000], ['', null], ['gratis', null]] as const) {
      expect(parsePrice(input), String(input)).toBe(expected)
    }
  })
})

describe('unfurlHtml', () => {
  it('prefers OpenGraph, falls back to JSON-LD Product, absolutizes https images only', () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Serum Vitamin C &amp; E 30ml">
      <meta property="og:image" content="/img/serum.jpg">
      <script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":"89000.00"}}</script></head></html>`
    expect(unfurlHtml(html, 'https://shopee.co.id/p/1')).toEqual({ title: 'Serum Vitamin C & E 30ml', imageUrl: 'https://shopee.co.id/img/serum.jpg', priceIdr: 89000 })
    expect(unfurlHtml('<meta property="og:image" content="http://x.id/a.jpg">', 'https://x.id').imageUrl).toBeNull()
  })
})

describe('safe-fetch guard', () => {
  it('blocks private, loopback, link-local, metadata and mapped addresses', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'not-an-ip']) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('::ffff:808:808')).toBe(false)
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
  })
  it('refuses http and private hosts before connecting', async () => {
    await expect(safeFetch('http://example.com')).rejects.toMatchObject({ reason: 'scheme' })
    await expect(safeFetch('https://127.0.0.1/')).rejects.toMatchObject({ reason: 'blocked_address' })
    await expect(safeFetch('https://[::1]/')).rejects.toMatchObject({ reason: 'blocked_address' })
    await expect(safeFetch('https://localhost/')).rejects.toMatchObject({ reason: 'blocked_address' })
  })
})
