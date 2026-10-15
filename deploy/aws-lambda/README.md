# AWS Lambda (tier 1)

Region `ap-southeast-1` (same as Neon Singapore).

1. Build: `NITRO_PRESET=aws-lambda npm run build` → `.output/server/index.mjs` exports `handler`.
2. Create the function (Node 24, arm64, 1024 MB, timeout **60 s**) behind a Lambda Function URL or API Gateway HTTP API;
   set every variable from `.env.example` (secrets via Secrets Manager or SSM + the Parameters extension).
   Upload `.output/server` as the deployment package; serve `.output/public` from S3 + CloudFront, or let the function serve it.
3. Tick: EventBridge **Scheduler** with schedule `rate(1 minute)` targeting an **API destination**
   (`GET https://<site>/api/internal/tick`) whose connection uses API-key auth with header `Authorization`
   and value `Bearer <CRON_SECRET>`. Add an external pinger as backup.
4. Media processor: push `services/media-processor/Dockerfile` to ECR and run it as a Lambda container image
   (timeout 15 min, memory 2–3 GB, reserved concurrency ≈ 5) behind a Function URL, or as an ECS Fargate service.
   Set `MEDIA_PROCESSOR_URL` on the app.
5. `waitUntil`: the aws-lambda preset awaits deferred work before the invocation ends, so clicks and kicks are not lost.
