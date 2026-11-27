# Build from the repository root: docker build -f apps/studio/Dockerfile -t formlens-studio:local .
FROM node:26-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/studio/package.json apps/studio/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci

FROM deps AS build
COPY apps/studio apps/studio
COPY packages/api-client packages/api-client
# The server environment is read when the container starts, not when the image is built, except the ceiling of the
# upload limit: next.config.ts fixes the request body limit at build time from FORMLENS_MAX_UPLOAD_MB. To accept larger
# documents, build with --build-arg FORMLENS_MAX_UPLOAD_MB=50 and also run the container with FORMLENS_MAX_UPLOAD_MB=50;
# at runtime the value can only lower the ceiling (a higher one is capped, with a warning in the log).
ARG FORMLENS_MAX_UPLOAD_MB=25
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_ENV_VALIDATION=true FORMLENS_MAX_UPLOAD_MB=$FORMLENS_MAX_UPLOAD_MB
RUN npm run build -w @form-lens/studio

FROM node:26-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# `standalone` holds server.js and the traced node_modules, laid out as in the repository.
COPY --from=build /repo/apps/studio/.next/standalone ./
COPY --from=build /repo/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=build /repo/apps/studio/public ./apps/studio/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/studio/server.js"]
