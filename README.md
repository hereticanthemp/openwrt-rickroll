# openwrt-rickroll

An OpenWrt package that adds an open Wi-Fi network with a captive portal.
Phones that join it get a "login" page with a **Connect** button.
The button plays a video of your choice. There is no internet on this network.

Work in progress. See the plan in the issue tracker before using it.

- `rickroll/` – the package (portal, isolated network, dedicated DNS)
- `luci-app-rickroll/` – LuCI settings page
- `tools/rickroll-media` – convert your own video to HLS and copy it to the router

No video or lyrics ship with this repository. You supply your own media.

License: MIT. `hls.js` is Apache-2.0.
