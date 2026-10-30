#!/usr/bin/env bash
# Build the rickroll and luci-app-rickroll packages with the OpenWrt SDK.
#
# Needs an x86_64 Linux host with the usual OpenWrt build dependencies.
# Both packages are architecture independent, so any target SDK works.
# Run as a normal user: the OpenWrt build system refuses to run as root.
#
# Environment:
#   SDK_URL     SDK tarball to download (default: 25.12.5 mediatek/filogic)
#   SDK_SHA256  expected sha256 of the tarball
#   SDK_DIR     where the SDK lives (default: build/sdk in the repository)
#   OUT         where the .apk files go (default: dist in the repository)
set -euo pipefail
# Package files keep their modes; a umask of 002 would make directories 0775.
umask 022

REPO=$(cd "$(dirname "$0")/.." && pwd)
SDK_URL=${SDK_URL:-https://downloads.openwrt.org/releases/25.12.5/targets/mediatek/filogic/openwrt-sdk-25.12.5-mediatek-filogic_gcc-14.3.0_musl.Linux-x86_64.tar.zst}
SDK_SHA256=${SDK_SHA256:-ff4a38a397caa2cfe1c39e18f84ddede14878221b3593c3f2c4cfe24e3ec4c25}
SDK_DIR=${SDK_DIR:-$REPO/build/sdk}
OUT=${OUT:-$REPO/dist}

log() { printf '==> %s\n' "$*"; }
die() { printf 'build.sh: error: %s\n' "$*" >&2; exit 1; }

[[ $(id -u) -ne 0 ]] || die "do not run as root"
[[ $(uname -m) == x86_64 ]] || die "the OpenWrt SDK needs an x86_64 host"

if [[ ! -x $SDK_DIR/scripts/feeds ]]; then
	tarball=$(dirname "$SDK_DIR")/$(basename "$SDK_URL")
	mkdir -p "$SDK_DIR"
	log "downloading $(basename "$SDK_URL")"
	curl -sSfL -o "$tarball" "$SDK_URL"
	echo "$SDK_SHA256  $tarball" | sha256sum -c --quiet - || die "SDK checksum mismatch"
	log "extracting SDK"
	tar --zstd -xf "$tarball" -C "$SDK_DIR" --strip-components=1
	rm -f "$tarball"
fi

cd "$SDK_DIR"

log "updating feeds (base, luci)"
./scripts/feeds update base luci >/dev/null
./scripts/feeds install luci-base >/dev/null

log "linking packages"
ln -sfn "$REPO/rickroll" package/rickroll
ln -sfn "$REPO/luci-app-rickroll" package/luci-app-rickroll

make defconfig >/dev/null

# bin/ keeps the output of earlier builds; drop it so dist gets this build only.
find bin/packages -name '*.apk' \( -name 'rickroll-*' -o -name 'luci-app-rickroll-*' \
	-o -name 'luci-i18n-rickroll-*' \) -delete 2>/dev/null || true

log "building"
targets=(package/rickroll/compile package/luci-app-rickroll/compile)
if ! make -j"$(nproc)" "${targets[@]}"; then
	log "build failed, running again with V=s"
	make -j1 V=s "${targets[@]}"
	exit 1
fi

mkdir -p "$OUT"
rm -f "$OUT"/*.apk
find bin/packages -name '*.apk' \( -name 'rickroll-*' -o -name 'luci-app-rickroll-*' \
	-o -name 'luci-i18n-rickroll-*' \) -exec cp -t "$OUT" {} +

log "packages in $OUT:"
ls -l "$OUT"
