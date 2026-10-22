import type { WorkspaceWatermark } from '#shared/media/edit-spec'
import { SMALL_IMAGE_MAX_BYTES } from '#shared/utils/uploads'

/** The workspace logo (Pengaturan → Tanda air) that the media editor places with one tap. */
export function useWatermark() {
  const watermark = useState<WorkspaceWatermark | null | undefined>('workspace-watermark', () => undefined)
  const { t } = useI18n()

  async function load(force = false) {
    if (watermark.value !== undefined && !force) return watermark.value
    const settings = await apiFetch<{ watermark: WorkspaceWatermark | null }>('/api/app/settings')
    watermark.value = settings.watermark ?? null
    return watermark.value
  }

  /** Uploads the logo as it is (a transparent PNG stays transparent) and returns its URL. */
  async function uploadLogo(file: File) {
    if (file.size > SMALL_IMAGE_MAX_BYTES) throw new Error(t('mediaEditor.logo.tooBig'))
    const body = new FormData()
    body.append('file', file, file.name || 'logo.png')
    return (await apiFetch<{ url: string }>('/api/app/uploads', { method: 'POST', body })).url
  }

  async function save(value: WorkspaceWatermark | null) {
    const saved = await apiFetch<{ watermark: WorkspaceWatermark | null }>('/api/app/settings', { method: 'PATCH', body: { watermark: value } })
    watermark.value = saved.watermark ?? null
    return watermark.value
  }

  return { watermark, load, uploadLogo, save }
}
