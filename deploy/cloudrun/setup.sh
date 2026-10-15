#!/usr/bin/env bash
# Google Cloud Run (tier 1). Region next to Neon Singapore. Run once per environment; re-run "deploy" steps per release.
# Secrets live in Secret Manager: create each name below with `gcloud secrets create <NAME> --data-file=-`.
set -euo pipefail
PROJECT=${PROJECT:?set PROJECT}
REGION=${REGION:-asia-southeast1}
REPO=${REPO:-socialz}
SITE_URL=${SITE_URL:?set SITE_URL, e.g. https://socialz.id}
IMG="$REGION-docker.pkg.dev/$PROJECT/$REPO"

gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --project="$PROJECT" 2>/dev/null || true
gcloud builds submit --project="$PROJECT" --tag "$IMG/app" --file deploy/docker/Dockerfile .
gcloud builds submit --project="$PROJECT" --tag "$IMG/media" --file services/media-processor/Dockerfile .

SECRETS="DATABASE_URL=DATABASE_URL:latest,BETTER_AUTH_SECRET=BETTER_AUTH_SECRET:latest,SETTINGS_SECRET=SETTINGS_SECRET:latest,CRON_SECRET=CRON_SECRET:latest,INTERNAL_SIGNING_SECRET=INTERNAL_SIGNING_SECRET:latest,MEDIA_PROCESSOR_SECRET=MEDIA_PROCESSOR_SECRET:latest,META_APP_SECRET=META_APP_SECRET:latest,INSTAGRAM_APP_SECRET=INSTAGRAM_APP_SECRET:latest,THREADS_APP_SECRET=THREADS_APP_SECRET:latest,META_WEBHOOK_VERIFY_TOKEN=META_WEBHOOK_VERIFY_TOKEN:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest"

# Media processor: scales to zero, one job per instance (ffmpeg uses every core), long timeout for video.
gcloud run deploy socialz-media --project="$PROJECT" --region="$REGION" --image "$IMG/media" \
  --concurrency=1 --max-instances=5 --min-instances=0 --cpu=2 --memory=2Gi --timeout=900 \
  --allow-unauthenticated --set-secrets "MEDIA_PROCESSOR_SECRET=MEDIA_PROCESSOR_SECRET:latest" # every request is HMAC-verified
MEDIA_URL=$(gcloud run services describe socialz-media --project="$PROJECT" --region="$REGION" --format='value(status.url)')

# App: /api/internal/** needs >= 60 s (the tick runs inside a 45 s budget).
gcloud run deploy socialz-app --project="$PROJECT" --region="$REGION" --image "$IMG/app" \
  --allow-unauthenticated --timeout=120 --concurrency=80 --min-instances=0 --max-instances=20 \
  --set-env-vars "NUXT_PUBLIC_SITE_URL=$SITE_URL,NUXT_PUBLIC_APP_ENV=production,MEDIA_PROCESSOR_DRIVER=http,MEDIA_PROCESSOR_URL=$MEDIA_URL" \
  --env-vars-file deploy/cloudrun/env.yaml \
  --set-secrets "$SECRETS"

# The one cron entry: Cloud Scheduler → tick every minute.
gcloud scheduler jobs create http socialz-tick --project="$PROJECT" --location="$REGION" \
  --schedule="* * * * *" --uri="$SITE_URL/api/internal/tick" --http-method=GET \
  --headers="Authorization=Bearer $(gcloud secrets versions access latest --secret=CRON_SECRET --project="$PROJECT")" \
  --attempt-deadline=60s 2>/dev/null || echo "scheduler job exists (update it with: gcloud scheduler jobs update http socialz-tick ...)"
