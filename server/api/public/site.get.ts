import { getAllSettings } from '../../core/settings'

/** Small on purpose: every public footer reads it (docs/blueprint/14 §3). Never secrets. */
export default defineEventHandler(async () => {
  const s = await getAllSettings()
  return {
    company: {
      name: s['company.name'], tagline: s['company.tagline'], legalName: s['company.legalName'], email: s['company.email'],
      phone: s['company.phone'], address: s['company.address'], whatsapp: s['company.whatsapp'],
      instagram: s['company.instagram'], threads: s['company.threads'], tiktok: s['company.tiktok'], youtube: s['company.youtube']
    },
    privacy: {
      contactEmail: s['privacy.dataProtectionOfficer'] || s['company.email'],
      deleteRequestSlaDays: Number(s['privacy.deleteRequestSlaDays']),
      auditRetentionDays: Number(s['privacy.auditRetentionDays']),
      backupRetentionDays: Number(s['privacy.backupRetentionDays']),
      financialRetentionYears: Number(s['privacy.financialRetentionYears'])
    }
  }
})
