# License: see repository LICENSE (NapCat Limited Redistribution License).
# Maintainer: kadidalax.
# Source code and bundled QQ remain under their respective mixed licenses.

# Verified multiarchitecture Node 22.22.0 / Debian bookworm image index.
FROM --platform=$BUILDPLATFORM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS builder
WORKDIR /src
RUN npm install --global --ignore-scripts pnpm@9.15.9
COPY . .
RUN pnpm install --frozen-lockfile
ARG NAPCAT_VERSION=4.18.42
ARG NAPCAT_REPOSITORY=kadidalax/NapCatQQ-Clasic
ARG NAPCAT_REVISION=
ENV NAPCAT_VERSION=$NAPCAT_VERSION \
    NAPCAT_REPOSITORY=$NAPCAT_REPOSITORY \
    NAPCAT_REVISION=$NAPCAT_REVISION \
    CI=true
RUN pnpm run build:artifacts -- --target shell --version "$NAPCAT_VERSION"

# Extraction happens on the build platform; no FUSE or target-CPU AppImage run.
FROM --platform=$BUILDPLATFORM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS qq-assets
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates squashfs-tools \
    && rm -rf /var/lib/apt/lists/*
COPY docker/fetch-qq.mjs docker/qq-manifest.json /tools/
ARG TARGETARCH
RUN node /tools/fetch-qq.mjs "$TARGETARCH" /opt/QQ

FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runtime
ARG NAPCAT_VERSION=4.18.42
ARG NAPCAT_REPOSITORY=kadidalax/NapCatQQ-Clasic
ARG NAPCAT_REVISION=
LABEL org.opencontainers.image.title="NapCatQQ-clasic" \
      org.opencontainers.image.authors="kadidalax" \
      org.opencontainers.image.version="$NAPCAT_VERSION" \
      org.opencontainers.image.revision="$NAPCAT_REVISION" \
      org.opencontainers.image.source="https://github.com/$NAPCAT_REPOSITORY" \
      org.opencontainers.image.description="Frozen source-built Shell with a SHA256-pinned Tencent QQ runtime" \
      org.opencontainers.image.licenses="LicenseRef-NapCat-Limited-Redistribution AND MIT AND Apache-2.0 AND LicenseRef-Tencent-QQ"
# QQ's ELF dependencies, headless Electron display, and media utilities.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates tini xvfb xauth dbus \
      libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libcairo2 libgtk-3-0 libpango-1.0-0 libdrm2 libgbm1 \
      libx11-6 libx11-xcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
      libxrandr2 libxcb1 libxkbcommon0 libxss1 libxtst6 libasound2 libatspi2.0-0 \
      libudev1 libexpat1 libuuid1 libunwind8 libsecret-1-0 libnotify4 libvips42 libopengl0 libgl1 libegl1 \
      ffmpeg fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && groupmod --new-name napcat node \
    && usermod --login napcat --home /home/napcat --move-home --shell /bin/sh node
COPY --from=qq-assets /opt/QQ /opt/QQ
COPY --from=builder /src/dist/shell /app/shell
COPY docker/*.mjs docker/entrypoint.sh /usr/local/lib/napcatqq-clasic/
COPY docker/qq-manifest.json /usr/local/lib/napcatqq-clasic/qq-manifest.json
RUN node /usr/local/lib/napcatqq-clasic/patch-qq.mjs /opt/QQ /app/shell \
    && chmod 755 /usr/local/lib/napcatqq-clasic/entrypoint.sh /opt/QQ/qq \
    && mkdir -p /app/napcat/config /app/napcat/logs /app/napcat/plugins /app/napcat/cache \
                /home/napcat/.config/QQ /home/napcat/.cache /home/napcat/.local/share /AstrBot/data \
    && cp -a /app/shell/config/. /app/napcat/config/ \
    && cp -a /app/shell/plugins/. /app/napcat/plugins/ \
    && cp /app/shell/LICENSE /app/shell/THIRD_PARTY_NOTICES.md /app/shell/pnpm-lock.yaml /app/napcat/ \
    && cp -a /app/shell/licenses /app/shell/packages /app/napcat/ \
    && chown -R 1000:1000 /app/napcat /home/napcat \
    && node /usr/local/lib/napcatqq-clasic/verify-runtime.mjs
ENV HOME=/home/napcat \
    NAPCAT_WORKDIR=/app/napcat \
    NAPCAT_QQ_DATA_DIR=/home/napcat/.config/QQ \
    NAPCAT_MAIN_PATH=/app/shell/napcat.mjs \
    NAPCAT_WRAPPER_PATH=/opt/QQ/resources/app/wrapper.node \
    NAPCAT_QQ_PACKAGE_INFO_PATH=/opt/QQ/resources/app/package.json \
    NAPCAT_QQ_VERSION_CONFIG_PATH=/opt/QQ/resources/app/napcatqq-clasic-version.json \
    NAPCAT_DISABLE_MULTI_PROCESS=1 \
    NAPCAT_DISABLE_PIPE=1 \
    LD_LIBRARY_PATH=/opt/QQ:/opt/QQ/resources/app:/opt/QQ/resources/app/sharp-lib:/opt/QQ/usr/lib \
    XDG_CONFIG_HOME=/home/napcat/.config \
    XDG_CACHE_HOME=/home/napcat/.cache \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe
WORKDIR /app/napcat
USER 1000:1000
EXPOSE 6099
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
    CMD ["node", "/usr/local/lib/napcatqq-clasic/healthcheck.mjs"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/lib/napcatqq-clasic/entrypoint.sh"]
CMD []
