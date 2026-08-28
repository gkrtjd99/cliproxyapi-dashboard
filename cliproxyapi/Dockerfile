# Build the exact CLIProxyAPI release used by the Homebrew installation.
# Keeping the version pinned prevents a dashboard update from silently
# changing proxy behavior or OAuth compatibility.
FROM golang:1.26-bookworm AS builder

ARG CLI_PROXY_VERSION=7.2.138
ARG VERSION=${CLI_PROXY_VERSION}
ARG COMMIT=local-docker
ARG BUILD_DATE=unknown

WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends git build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git clone --depth 1 --branch "v${CLI_PROXY_VERSION}" \
       https://github.com/router-for-me/CLIProxyAPI.git .

RUN go mod download
RUN CGO_ENABLED=1 GOOS=linux go build -buildvcs=false \
    -ldflags="-s -w -X 'main.Version=${VERSION}' -X 'main.Commit=${COMMIT}' -X 'main.BuildDate=${BUILD_DATE}'" \
    -o /out/CLIProxyAPI ./cmd/server/

FROM debian:bookworm

ARG TZ=Asia/Seoul

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && mkdir -p /CLIProxyAPI/logs /CLIProxyAPI/plugins

COPY --from=builder /out/CLIProxyAPI /CLIProxyAPI/CLIProxyAPI
COPY --from=builder /src/config.example.yaml /CLIProxyAPI/config.example.yaml

WORKDIR /CLIProxyAPI
EXPOSE 8317

ENTRYPOINT ["/CLIProxyAPI/CLIProxyAPI"]
