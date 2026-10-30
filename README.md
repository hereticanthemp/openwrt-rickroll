# openwrt-rickroll

[繁體中文](README.zh-TW.md)

An OpenWrt package that adds an open Wi-Fi network with a captive portal.
Phones that join the network show a "sign in" page. The page has one button.
The button plays a video that you upload. The network has no internet access.

- `rickroll` – the network, the portal and a dedicated DNS server
- `luci-app-rickroll` – a settings and status page in LuCI (Services → Rickroll)
- `tools/rickroll-media` – converts your video and copies it to the router

No video and no song lyrics ship with this repository. You supply your own video.

## Use it responsibly

- Enable the network only where you have permission to run a Wi-Fi network.
- Use only video that you have the right to play.
- The page has no input fields. Do not change it to collect data from guests.

## Requirements

- OpenWrt 25.12 or later (apk package manager, fw4/nftables).
- `uhttpd` and `dnsmasq` (or `dnsmasq-full`). Both are in the default image.
- A Wi-Fi radio. On a fresh install, radios are disabled (`wireless.radioN.disabled=1`).
- Free flash space for the video. A 60-second 360p video is about 4 MB.
- For `tools/rickroll-media`: bash 3.2 or later, ffmpeg with `libx264` or `libopenh264`, ssh and scp.

## Install

### Build the packages

Both packages are architecture independent (`noarch`). The build needs an
x86_64 Linux host, because the OpenWrt SDK runs only there. Run it as a normal
user, not as root.

```sh
git clone <this repository>
cd openwrt-rickroll
./scripts/build.sh          # downloads the SDK, then builds into dist/
```

`scripts/build.sh` uses the 25.12.5 mediatek/filogic SDK by default. Any target
SDK works, because the packages are `noarch`. Set `SDK_URL` and `SDK_SHA256` to
use another one. The SDK pins its feeds to fixed commits.

The `rickroll` package installs the repository `LICENSE` file, so build it from
a full checkout of this repository.

### Install on the router

```sh
scp -O dist/*.apk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'apk add --allow-untrusted /tmp/rickroll-*.apk /tmp/luci-app-rickroll-*.apk /tmp/luci-i18n-rickroll-*.apk'
```

The packages are not signed with an OpenWrt key, so `apk` needs `--allow-untrusted`.
The translation packages (`luci-i18n-rickroll-zh-tw`, `-zh-cn`) are optional.

After the install, the network is **disabled**. The install does not change
your network, wireless, DHCP or firewall settings.

## Upload a video

```sh
tools/rickroll-media my-video.mp4 root@192.168.1.1
tools/rickroll-media --duration 60 -i ~/.ssh/id_ed25519 my-video.mp4 root@192.168.1.1
tools/rickroll-media --output ./hls my-video.mp4      # convert only
```

The tool converts the video to HLS (MPEG-TS segments, H.264 video, AAC audio).
It copies the video when it is already H.264 and not taller than `--height`
(default 360). Otherwise it encodes it. It uploads to
`/etc/rickroll/media.new` and then swaps the directories. Run
`tools/rickroll-media --help` for all options.

To upload by hand, put `index.m3u8` and `seg000.ts` … `seg999.ts` in
`/etc/rickroll/media/`. The portal runs as user `nobody`, so the directory must
be mode 0755 and the files 0644.

Without a video, the button shows a short "You've been rickrolled!" animation.

## Enable and disable

```sh
uci set wireless.radio0.disabled=0          # if the radio is still disabled
uci set rickroll.main.enabled=1
uci commit
/etc/init.d/rickroll restart
```

Or use LuCI: Services → Rickroll.

**Check for other open Wi-Fi.** A fresh OpenWrt has an access point named
`OpenWrt` with no password, bridged to `lan`. It comes up when you enable the
radio, and then anyone in range can join your LAN. Disable it:

```sh
uci set wireless.default_radio0.disabled=1; uci commit wireless; wifi reload radio0
```

`apply` logs a warning for every other open access point on the same radio, and
the LuCI status page lists them.

To turn the network off, set `enabled=0` and restart the service.
`/etc/init.d/rickroll stop` and `disable` stop the portal, but they do not
remove the network: the open SSID stays up without a portal. This is on
purpose, so that a reboot does not rewrite the configuration in flash.

## Options

All options are in `/etc/config/rickroll`, section `main`. The file is mode
0600, because it can hold a Wi-Fi key.

| Option | Default | Notes |
|---|---|---|
| `enabled` | `0` | `1` creates the network and starts the portal |
| `ssid` | `Free Public WiFi` | Up to 32 characters |
| `radio` | `radio0` | A `wifi-device` section |
| `encryption` | `none` | `none`, `psk2`, `sae` or `sae-mixed` |
| `key` | – | 8 to 63 characters; needed when encryption is not `none` |
| `isolate` | `1` | Guests cannot reach each other |
| `ipaddr` | `192.168.56.1` | Router address on the network; not the network or broadcast address |
| `netmask` | `255.255.255.0` | `/16` to `/24`; DHCP gives out hosts 100 to 249 |
| `portal_port` | `8080` | 1024 to 65535; must differ from `dns_port` |
| `dns_port` | `5300` | 1024 to 65535 |
| `dns_answer` | `198.18.0.1` | Must not be private, loopback, link-local or multicast (see below) |
| `lang` | `auto` | `auto`, `en`, `zh-Hant`, `zh-Hans`, `ja` |
| `title`, `button` | empty | Page title and button text; empty uses the language default |

The subnet must not overlap another interface with `proto static`. The check
does not see addresses from DHCP or WireGuard, so choose a subnet that no other
network uses.

When `enabled=1` and a setting is not valid, the service removes the network and
logs the reason. It does not leave an open network without a portal.

## How it works

The package creates these UCI sections and owns them. It overwrites sections
with the same names, and removes them when you disable or remove the package:

- `network.rickroll_dev` (bridge `br-rickroll`), `network.rickroll`
- `wireless.rickroll`
- `dhcp.rickroll`
- `firewall.rickroll` (zone), `firewall.rickroll_dhcp` (rule),
  `firewall.rickroll_dnat_dns`, `firewall.rickroll_dnat_http` (redirects)

Traffic on the network:

- The zone rejects input and forwarding. It has no forwarding to any other zone,
  so guests cannot reach the internet, the LAN, LuCI or SSH.
- TCP port 80 to **any** address goes to the portal web server
  (`uhttpd` on `portal_port`, user `nobody`).
- TCP and UDP port 53 to any address goes to a dedicated `dnsmasq` on
  `dns_port`. It has no upstream server and reads no hosts file or leases. It
  answers every name with `dns_answer`. Guests cannot see the names of your LAN
  devices.
- Direct connections to `portal_port` and `dns_port` are rejected. All other
  traffic is rejected.
- The network has no IPv6.

Phones check the network with a plain HTTP request. The portal answers it with a
redirect, so the phone shows the sign-in page.

**Why `dns_answer` is a public address.** Android treats a private DNS answer
for its check address as "no internet" and does not show the portal. The default
`198.18.0.1` is in the benchmarking range (RFC 2544). Guests never reach it,
because port 80 goes to the portal and everything else is rejected.

The page plays the video with native HLS on iOS and with the included `hls.js`
in other browsers. `uhttpd` does not support HTTP Range requests, which iOS needs
for mp4, so the video is HLS. A tap on the button is a user gesture, so the
video can play with sound.

From the LAN, the portal is also at `http://<router-lan-ip>:<portal_port>/`.

## Known limits

- `uhttpd` (LuCI) uses ports 80 and 443 on the router; the portal uses another port.
- If `dnsmasq` has more than one instance, or the main instance has an
  `interface` list, guests may get no DHCP address.
- `apply` commits the whole config file. Uncommitted `uci` changes that you made
  on the command line in the same file are committed with it.
- `apk` keeps files under `/etc` that you changed, and writes the new version as
  `*.apk-new`. Do not edit `/etc/init.d/rickroll` by hand.

## Remove and upgrade

```sh
apk del luci-i18n-rickroll-zh-tw luci-i18n-rickroll-zh-cn luci-app-rickroll rickroll
```

The removal deletes all UCI sections that the package created. It keeps:

- `/etc/config/rickroll` if you changed it (a new install then uses it again,
  including `enabled=1`)
- `/etc/rickroll/media` (your video)

A system upgrade with "keep settings" keeps `/etc/rickroll/media`. The video is
then part of the backup, which is in RAM during the upgrade.

If you upgrade to an image without this package, the UCI sections stay, and the
open SSID comes up without a portal. Disable the package before the upgrade, or
remove the sections by hand:

```sh
for s in network.rickroll_dev network.rickroll wireless.rickroll dhcp.rickroll \
	firewall.rickroll firewall.rickroll_dhcp firewall.rickroll_dnat_dns \
	firewall.rickroll_dnat_http; do uci -q delete "$s"; done
uci commit; /etc/init.d/network reload; /etc/init.d/firewall reload; wifi reload
```

## Troubleshooting

```sh
logread -e rickroll
ubus call service list '{"name":"rickroll"}'
/usr/libexec/rickroll/apply check       # validates the settings, changes nothing
```

The LuCI page shows the service, the Wi-Fi interface, connected devices, other
open Wi-Fi on the radio and the video.

## License

MIT, see [LICENSE](LICENSE). The build downloads
[hls.js](https://github.com/video-dev/hls.js) 1.7.4 from npm (Apache-2.0) and
checks its hash. hls.js is not stored in this repository. Its license is
installed in `/usr/share/licenses/rickroll/`.
