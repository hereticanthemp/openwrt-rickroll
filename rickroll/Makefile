include $(TOPDIR)/rules.mk

PKG_NAME:=rickroll
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

HLSJS_VERSION:=1.7.4
PKG_SOURCE:=hls.js-$(HLSJS_VERSION).tgz
PKG_SOURCE_URL:=https://registry.npmjs.org/hls.js/-/
PKG_HASH:=e4ab3d5d13f7cca9ef241d098f39686e19fd451831ba07dc9943482fd5ff75c7

PKG_MAINTAINER:=Gin Pan <hereticanthemp@gmail.com>
PKG_LICENSE:=MIT Apache-2.0

include $(INCLUDE_DIR)/package.mk

define Package/rickroll
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Open Wi-Fi with a captive portal that plays your video
  DEPENDS:=+uhttpd +dnsmasq
  PKGARCH:=all
endef

define Package/rickroll/description
  Adds an open Wi-Fi network (SSID "Free Public WiFi" by default) on an
  isolated network with no internet access. All HTTP and DNS requests from
  this network go to a captive portal page on the router. The page shows a
  "Connect" button that plays a video. No video ships with this package:
  you must supply your own video as HLS in /etc/rickroll/media.
  The network is disabled until you set rickroll.main.enabled=1.
endef

define Package/rickroll/conffiles
/etc/config/rickroll
endef

# The npm tarball has one top directory, "package/".
define Build/Prepare
	$(HOST_TAR) -C $(PKG_BUILD_DIR) --strip-components=1 -xzf $(DL_DIR)/$(PKG_SOURCE)
endef

define Build/Compile
endef

define Package/rickroll/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/rickroll $(1)/etc/config/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/rickroll $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./files/lib/upgrade/keep.d/rickroll $(1)/lib/upgrade/keep.d/
	$(INSTALL_DIR) $(1)/usr/libexec/rickroll
	$(INSTALL_BIN) ./files/usr/libexec/rickroll/apply $(1)/usr/libexec/rickroll/
	$(INSTALL_DIR) $(1)/usr/share/rickroll
	$(INSTALL_DATA) ./files/usr/share/rickroll/dnsmasq.conf $(1)/usr/share/rickroll/
	$(INSTALL_DIR) $(1)/usr/share/rickroll/www
	$(INSTALL_DATA) ./files/usr/share/rickroll/www/index.html $(1)/usr/share/rickroll/www/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/dist/hls.min.js $(1)/usr/share/rickroll/www/
	$(INSTALL_DIR) $(1)/usr/share/rickroll/www/cgi-bin
	$(INSTALL_BIN) ./files/usr/share/rickroll/www/cgi-bin/config $(1)/usr/share/rickroll/www/cgi-bin/
	$(INSTALL_BIN) ./files/usr/share/rickroll/www/cgi-bin/playlist.m3u8 $(1)/usr/share/rickroll/www/cgi-bin/
	$(INSTALL_BIN) ./files/usr/share/rickroll/www/cgi-bin/portal $(1)/usr/share/rickroll/www/cgi-bin/
	$(INSTALL_BIN) ./files/usr/share/rickroll/www/cgi-bin/ts $(1)/usr/share/rickroll/www/cgi-bin/
	$(INSTALL_DIR) $(1)/usr/share/licenses/rickroll
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/LICENSE $(1)/usr/share/licenses/rickroll/hls.js.LICENSE
endef

# default_postinst has already enabled and started the service.
# With enabled=0 the service creates no network configuration.
define Package/rickroll/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || [ "$$(uci -q get rickroll.main.enabled)" = 1 ] ||
	echo "rickroll: disabled. Copy your HLS video to /etc/rickroll/media," \
		"then run: uci set rickroll.main.enabled=1; uci commit rickroll;" \
		"/etc/init.d/rickroll restart"
endef

# default_prerm has already stopped the service. Remove the UCI sections.
define Package/rickroll/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /usr/libexec/rickroll/apply down
endef

$(eval $(call BuildPackage,rickroll))
