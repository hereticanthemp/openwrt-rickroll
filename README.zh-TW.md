# openwrt-rickroll

[English](README.md)

這是一個 OpenWrt 套件，會建立一個開放的 Wi-Fi 網路和 captive portal。
手機連上之後，會顯示「登入」頁面。頁面上有一個按鈕，按下後播放你上傳的影片。
這個網路沒有網際網路連線。

- `rickroll`：網路、portal 頁面和專用的 DNS 伺服器
- `luci-app-rickroll`：LuCI 的設定與狀態頁面（Services → Rickroll）
- `tools/rickroll-media`：在電腦上轉換影片並複製到路由器

這個 repo 不附任何影片或歌詞。影片要由你自己提供。

## 負責任地使用

- 只在你有權架設 Wi-Fi 網路的地方啟用。
- 只使用你有權播放的影片。
- 頁面沒有任何輸入欄位。不要把它改成向訪客收集資料。

## 需求

- OpenWrt 25.12 以上（apk 套件管理員、fw4／nftables）。
- `uhttpd` 和 `dnsmasq`（或 `dnsmasq-full`）。預設映像檔都有。
- 一個 Wi-Fi radio。新裝的系統預設停用所有 radio（`wireless.radioN.disabled=1`）。
- 放影片的 flash 空間。60 秒的 360p 影片約 4 MB。
- `tools/rickroll-media` 需要：bash 3.2 以上、含 `libx264` 或 `libopenh264` 的 ffmpeg、ssh 和 scp。

## 安裝

### 建置套件

兩個套件都和硬體架構無關（`noarch`）。OpenWrt SDK 只能在 x86_64 的 Linux 上執行，
所以建置也要在 x86_64 的 Linux 上做。請用一般帳號執行，不要用 root。

```sh
git clone https://github.com/hereticanthemp/openwrt-rickroll.git
cd openwrt-rickroll
./scripts/build.sh          # 下載 SDK，建置結果放在 dist/
```

`scripts/build.sh` 預設使用 25.12.5 mediatek/filogic 的 SDK。套件是 `noarch`，
所以任何 target 的 SDK 都可以用。要換 SDK 時，設定 `SDK_URL` 和 `SDK_SHA256`。
SDK 的 feeds 固定在指定的 commit。

`rickroll` 套件會安裝 repo 根目錄的 `LICENSE`，所以要用完整的 repo 建置。

### 安裝到路由器

```sh
scp -O dist/*.apk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'apk add --allow-untrusted /tmp/rickroll-*.apk /tmp/luci-app-rickroll-*.apk /tmp/luci-i18n-rickroll-*.apk'
```

這些套件沒有 OpenWrt 的簽章，所以 `apk` 需要 `--allow-untrusted`。
翻譯套件（`luci-i18n-rickroll-zh-tw`、`-zh-cn`）可以不裝。

裝完之後，這個網路是**停用**的。安裝不會改動你的 network、wireless、DHCP 和 firewall 設定。

## 上傳影片

```sh
tools/rickroll-media my-video.mp4 root@192.168.1.1
tools/rickroll-media --duration 60 -i ~/.ssh/id_ed25519 my-video.mp4 root@192.168.1.1
tools/rickroll-media --output ./hls my-video.mp4      # 只轉換，不上傳
```

這個工具把影片轉成 HLS（MPEG-TS 片段、H.264 影像、AAC 聲音）。
影片已經是 H.264，而且高度不超過 `--height`（預設 360）時，直接複製；否則重新編碼。
它先上傳到 `/etc/rickroll/media.new`，全部完成後才替換目錄。
執行 `tools/rickroll-media --help` 可以看所有選項。

若要手動上傳，把 `index.m3u8` 和 `seg000.ts` … `seg999.ts` 放進 `/etc/rickroll/media/`。
portal 以 `nobody` 帳號執行，所以目錄權限要是 0755，檔案要是 0644。

沒有影片時，按下按鈕會顯示一段「你被 Rickroll 了！」的文字動畫。

## 啟用與停用

```sh
uci set wireless.radio0.disabled=0          # 若 radio 還是停用狀態
uci set rickroll.main.enabled=1
uci commit
/etc/init.d/rickroll restart
```

也可以在 LuCI 的 Services → Rickroll 設定。

**檢查有沒有其他開放的 Wi-Fi。** 新裝的 OpenWrt 有一個名為 `OpenWrt` 的 AP，
沒有密碼，而且接到 `lan`。你一開啟 radio，它就會跟著上線，範圍內的任何人都能連進你的區域網路。
請停用它：

```sh
uci set wireless.default_radio0.disabled=1; uci commit wireless; wifi reload radio0
```

`apply` 會為同一個 radio 上每個其他的開放 AP 寫一筆警告到 log，LuCI 的狀態頁也會列出它們。

要關閉這個網路，請設定 `enabled=0` 再重啟服務。
`/etc/init.d/rickroll stop` 和 `disable` 只會停止 portal，不會移除網路：開放的 SSID 會留著，
但沒有 portal。這是刻意的設計，避免每次重開機都改寫 flash 上的設定。

## 選項

所有選項都在 `/etc/config/rickroll` 的 `main` 區段。這個檔案的權限是 0600，因為裡面可能有 Wi-Fi 密碼。

| 選項 | 預設值 | 說明 |
|---|---|---|
| `enabled` | `0` | `1` 會建立網路並啟動 portal |
| `ssid` | `Free Public WiFi` | 最多 32 個字元 |
| `radio` | `radio0` | 一個 `wifi-device` 區段 |
| `encryption` | `none` | `none`、`psk2`、`sae` 或 `sae-mixed` |
| `key` | – | 8 到 63 個字元；encryption 不是 `none` 時必填 |
| `isolate` | `1` | 訪客之間不能互連 |
| `ipaddr` | `192.168.56.1` | 路由器在這個網路的位址；不能是網路位址或廣播位址 |
| `netmask` | `255.255.255.0` | `/16` 到 `/24`；DHCP 發放 100 到 249 號 |
| `portal_port` | `8080` | 1024 到 65535；不能和 `dns_port` 相同 |
| `dns_port` | `5300` | 1024 到 65535 |
| `dns_answer` | `198.18.0.1` | 不能是私有、loopback、link-local 或 multicast 位址（原因見下方） |
| `lang` | `auto` | `auto`、`en`、`zh-Hant`、`zh-Hans`、`ja` |
| `title`、`button` | 空白 | 頁面標題和按鈕文字；空白時使用該語言的預設文字 |

這個網段不能和其他 `proto static` 的介面重疊。這項檢查看不到 DHCP 或 WireGuard 取得的位址，
所以請選一個沒有其他網路在用的網段。

`enabled=1` 但設定不合法時，服務會移除這個網路，並把原因寫到 log。它不會留下一個沒有 portal 的開放網路。

## 運作方式

這個套件會建立並擁有以下 UCI 區段。同名的區段會被覆寫；停用或移除套件時，這些區段會被刪除：

- `network.rickroll_dev`（bridge `br-rickroll`）、`network.rickroll`
- `wireless.rickroll`
- `dhcp.rickroll`
- `firewall.rickroll`（zone）、`firewall.rickroll_dhcp`（rule）、
  `firewall.rickroll_dnat_dns`、`firewall.rickroll_dnat_http`（redirect）

這個網路上的流量：

- zone 拒絕 input 和 forward，也沒有任何往其他 zone 的 forwarding。所以訪客連不到網際網路、區域網路、LuCI 或 SSH。
- 送往**任何**位址的 TCP 80，都會轉到 portal 網頁伺服器（`portal_port` 上的 `uhttpd`，以 `nobody` 執行）。
- 送往任何位址的 TCP 和 UDP 53，都會轉到 `dns_port` 上的專用 `dnsmasq`。
  它沒有上游伺服器，也不讀 hosts 檔和租約，所有名稱都回答 `dns_answer`。
  所以訪客查不到你區域網路裡設備的名稱。
- 直接連 `portal_port` 和 `dns_port` 會被拒絕，其他流量也一律拒絕。
- 這個網路沒有 IPv6。

手機會用一般的 HTTP 請求檢查網路。portal 回應一個導向，手機就會顯示登入頁面。

**為什麼 `dns_answer` 是公共位址。** Android 檢查網路時，若檢查網址的 DNS 回答是私有 IP，
會判定成「沒有網際網路」，不會顯示 portal。預設的 `198.18.0.1` 屬於 RFC 2544 的測試用位址。
訪客永遠連不到它：port 80 會轉到 portal，其他流量一律拒絕。

頁面在 iOS 上用原生 HLS 播放影片，在其他瀏覽器上用內附的 `hls.js`。
`uhttpd` 不支援 HTTP Range 請求，而 iOS 播 mp4 需要 Range，所以影片用 HLS。
按下按鈕算是使用者手勢，所以影片可以帶聲音播放。

從區域網路也可以用 `http://<路由器的 LAN IP>:<portal_port>/` 開啟 portal。

## 已知限制

- 路由器上的 `uhttpd`（LuCI）佔用 port 80 和 443，portal 用的是另一個 port。
- `dnsmasq` 有多個 instance，或主 instance 設了 `interface` 清單時，訪客可能拿不到 DHCP 位址。
- `apply` 會 commit 整個設定檔。你在命令列對同一個檔案做的、還沒 commit 的 `uci` 變更，會一起被 commit。
- `apk` 會保留你改過的 `/etc` 檔案，新版寫成 `*.apk-new`。請不要手動修改 `/etc/init.d/rickroll`。

## 移除與升級

```sh
apk del luci-i18n-rickroll-zh-tw luci-i18n-rickroll-zh-cn luci-app-rickroll rickroll
```

移除會刪掉套件建立的所有 UCI 區段，但會保留：

- 你改過的 `/etc/config/rickroll`（重新安裝時會再用它，包括 `enabled=1`）
- `/etc/rickroll/media`（你的影片）

用「保留設定」升級系統時，會保留 `/etc/rickroll/media`。影片會變成備份的一部分，而升級期間備份放在 RAM 裡。

若升級成不含這個套件的映像檔，UCI 區段會留下來，開放的 SSID 會在沒有 portal 的狀態下上線。
請在升級前停用套件，或用下面的指令手動移除區段：

```sh
for s in network.rickroll_dev network.rickroll wireless.rickroll dhcp.rickroll \
	firewall.rickroll firewall.rickroll_dhcp firewall.rickroll_dnat_dns \
	firewall.rickroll_dnat_http; do uci -q delete "$s"; done
uci commit; /etc/init.d/network reload; /etc/init.d/firewall reload; wifi reload
```

## 疑難排解

```sh
logread -e rickroll
ubus call service list '{"name":"rickroll"}'
/usr/libexec/rickroll/apply check       # 只檢查設定，不做任何修改
```

LuCI 頁面會顯示服務狀態、Wi-Fi 介面、連線中的設備數、同一個 radio 上的其他開放 Wi-Fi，以及影片狀態。

## 授權

MIT，見 [LICENSE](LICENSE)。建置時會從 npm 下載 [hls.js](https://github.com/video-dev/hls.js) 1.7.4（Apache-2.0），並檢查它的 hash。
這個 repo 不包含 hls.js。它的授權檔會安裝到 `/usr/share/licenses/rickroll/`。
