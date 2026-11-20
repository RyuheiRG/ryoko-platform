FROM node:22-alpine AS build

RUN npm install -g pnpm@12.6.0

WORKDIR /app

COPY apps/admin/package.json apps/admin/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY apps/admin/ ./

ARG VITE_CONTENT_API_URL=
ARG VITE_WEBHOOK_API_URL=/webhook-api
ARG VITE_METRICS_API_URL=/metrics-api/graphql
ENV VITE_CONTENT_API_URL=$VITE_CONTENT_API_URL
ENV VITE_WEBHOOK_API_URL=$VITE_WEBHOOK_API_URL
ENV VITE_METRICS_API_URL=$VITE_METRICS_API_URL

RUN pnpm build

FROM nginx:1.27-alpine

COPY infra/nginx/admin.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
