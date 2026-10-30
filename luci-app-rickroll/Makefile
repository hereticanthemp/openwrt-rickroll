include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for rickroll captive portal
LUCI_DEPENDS:=+luci-base +rickroll
LUCI_PKGARCH:=all

PKG_VERSION:=0.1.0
PKG_RELEASE:=1
# luci.mk derives versions from git or file dates; pin them to the release.
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Gin Pan <hereticanthemp@gmail.com>

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
