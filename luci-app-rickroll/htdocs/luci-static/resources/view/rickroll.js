'use strict';
'require view';
'require form';
'require poll';
'require rpc';
'require uci';
'require ui';

const callStatus = rpc.declare({
	object: 'luci.rickroll',
	method: 'status',
	expect: { '': {} }
});

const callRadios = rpc.declare({
	object: 'luci.rickroll',
	method: 'radios',
	expect: { radios: [] }
});

const callSubnets = rpc.declare({
	object: 'luci.rickroll',
	method: 'subnets',
	expect: { subnets: [] }
});

const callDeleteMedia = rpc.declare({
	object: 'luci.rickroll',
	method: 'delete_media',
	expect: { '': {} }
});

// Default page texts of the portal (rickroll/files/usr/share/rickroll/www/index.html).
// They are shown in the language of the portal page, not of LuCI.
const PAGE_DEFAULTS = {
	'en': { title: 'Free Wi-Fi', button: 'Connect' },
	'zh-Hant': { title: '免費 Wi-Fi', button: '連線' },
	'zh-Hans': { title: '免费 Wi-Fi', button: '连接' },
	'ja': { title: '無料 Wi-Fi', button: '接続' }
};

const BANDS = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz' };

// The DHCP range is host 100 to 249 (rickroll/files/usr/libexec/rickroll/apply).
const NETMASKS = [ 16, 17, 18, 19, 20, 21, 22, 23, 24 ].map(function(prefix) {
	return [ prefixToInt(prefix), prefix ];
});

function badge(ok, text) {
	return E('span', { 'class': ok ? 'label success' : 'label warning' }, text);
}

function mediaText(media) {
	if (!media?.present)
		return _('No video. Upload one with tools/rickroll-media.');

	return _('%d segments, %1024.2mB').format(media.segments, media.bytes);
}

// Other open access points on the same radio, as a warning.
function openIfacesText(list) {
	if (!list?.length)
		return badge(true, _('None'));

	return E('span', {}, list.map(function(i) {
		return E('div', {}, badge(false,
			_('"%s" has no password and joins network "%s"').format(i.ssid, i.network)));
	}));
}

function statusRows(st) {
	const rows = [
		[ _('Enabled'), badge(st.enabled, st.enabled ? _('Yes') : _('No')) ],
		[ _('Portal web server'), badge(st.running?.portal, st.running?.portal ? _('Running') : _('Not running')) ],
		[ _('Portal DNS server'), badge(st.running?.dns, st.running?.dns ? _('Running') : _('Not running')) ],
		[ _('Wi-Fi interface'), badge(st.iface?.up, st.iface?.up ? _('Up (%s)').format(st.iface.ifname) : _('Down')) ],
		[ _('Other open Wi-Fi on this radio'), openIfacesText(st.open_ifaces) ],
		[ _('Connected devices'), String(st.clients ?? 0) ],
		[ _('Video'), badge(st.media?.present, mediaText(st.media)) ],
		[ _('Portal address'), st.portal_url
			? E('a', { 'href': st.portal_url, 'target': '_blank', 'rel': 'noreferrer' }, st.portal_url)
			: '-' ]
	];

	return rows.map(function(r) {
		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td left', 'width': '33%' }, r[0]),
			E('td', { 'class': 'td left' }, r[1])
		]);
	});
}

// An IPv4 address as an unsigned 32-bit number, or null. Like the apply
// script and netifd, refuse octets with leading zeros.
function ip4ToInt(value) {
	const m = /^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$/.exec(value ?? '');

	if (!m || m.slice(1).some(function(o) { return +o > 255; }))
		return null;

	return ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0;
}

function prefixToInt(prefix) {
	return prefix == 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
}

function intToIp4(n) {
	return [ n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255 ].join('.');
}

// A netmask from /16 to /24 as a number, or null.
function netmaskToInt(value) {
	const n = ip4ToInt(value);

	return NETMASKS.some(function(m) { return m[0] === n; }) ? n : null;
}

// The subnet of an address of another interface, or null.
function otherSubnet(s) {
	const parts = String(s.ipaddr).split('/');
	const addr = ip4ToInt(parts[0]);
	let mask;

	if (parts.length == 2)
		mask = /^[0-9]{1,2}$/.test(parts[1]) && +parts[1] <= 32 ? prefixToInt(+parts[1]) : null;
	else
		mask = (s.netmask == null) ? 0xFFFFFFFF : ip4ToInt(s.netmask);

	return (addr == null || mask == null) ? null : { addr, mask };
}

// Check the router address and netmask like the apply script does.
// Returns true or an error message.
function checkSubnet(ipaddr, netmask, subnets) {
	const ip = ip4ToInt(ipaddr);
	const mask = netmaskToInt(netmask);

	if (ip == null || mask == null)
		return true;

	const host = (ip & ~mask) >>> 0;

	if (host == 0 || host == (~mask >>> 0))
		return _('The router address must not be the network or broadcast address');

	for (const s of subnets) {
		const other = s.interface != 'rickroll' ? otherSubnet(s) : null;
		const both = other ? (other.mask & mask) >>> 0 : 0;

		if (other && ((other.addr & both) >>> 0) == ((ip & both) >>> 0))
			return _('This subnet overlaps the subnet of the interface "%s"').format(s.interface);
	}

	return true;
}

function portValidator(otherOption) {
	return function(section_id, value) {
		if (!/^[1-9][0-9]*$/.test(value) || +value < 1024 || +value > 65535)
			return _('Expecting a port number from 1024 to 65535');

		const other = this.map.lookupOption(otherOption, section_id)?.[0];

		if (other && other.formvalue(section_id) == value)
			return _('The portal port and the DNS port must be different');

		return true;
	};
}

return view.extend({
	load() {
		return Promise.all([
			callStatus(),
			callRadios(),
			callSubnets(),
			uci.load('rickroll')
		]);
	},

	updateStatus(st) {
		const table = document.getElementById('rickroll-status');
		const media = document.getElementById('rickroll-media');

		if (table)
			table.replaceChildren(...statusRows(st));

		if (media)
			media.textContent = mediaText(st.media);
	},

	handleDeleteMedia() {
		if (!confirm(_('Delete the video from the router? The portal page then has no video.')))
			return;

		return callDeleteMedia().then(L.bind(function(res) {
			if (res.failed > 0)
				ui.addNotification(null, E('p', _('Deleted %d files. Could not delete %d files.').format(res.deleted, res.failed)), 'warning');
			else
				ui.addNotification(null, E('p', _('Deleted %d files.').format(res.deleted)), 'info');

			return callStatus().then(L.bind(this.updateStatus, this));
		}, this));
	},

	render(data) {
		const status = data[0];
		const radios = data[1];
		const subnets = data[2];
		const view = this;
		let m, s, o;

		m = new form.Map('rickroll');

		s = m.section(form.NamedSection, 'main', 'rickroll');
		s.addremove = false;

		s.tab('general', _('General Settings'));
		s.tab('network', _('Network'));
		s.tab('page', _('Page'));
		s.tab('media', _('Video'));

		/* General */

		o = s.taboption('general', form.Flag, 'enabled', _('Enable'),
			_('Create the Wi-Fi network and start the portal.'));
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'ssid', _('Network name (SSID)'));
		o.datatype = 'maxlength(32)';
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'radio', _('Radio'),
			_('The radio that sends the network.'));
		radios.forEach(function(dev) {
			const band = BANDS[dev.band] ?? dev.band ?? '?';
			const channel = (dev.channel == null || dev.channel == 'auto') ? _('auto') : dev.channel;

			o.value(dev.name, _('%s (%s, channel %s)').format(dev.name, band, channel));
		});
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'encryption', _('Encryption'));
		o.value('none', _('No encryption (open network)'));
		o.value('psk2', _('WPA2-PSK'));
		o.value('sae', _('WPA3-SAE'));
		o.value('sae-mixed', _('WPA2-PSK/WPA3-SAE mixed mode'));
		o.default = 'none';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'key', _('Key'));
		o.password = true;
		o.datatype = 'rangelength(8,63)';
		o.rmempty = false;
		o.depends('encryption', 'psk2');
		o.depends('encryption', 'sae');
		o.depends('encryption', 'sae-mixed');

		o = s.taboption('general', form.Flag, 'isolate', _('Isolate clients'),
			_('Devices on this network cannot reach each other.'));
		o.default = o.enabled;
		o.rmempty = false;

		/* Network */

		o = s.taboption('network', form.Value, 'ipaddr', _('Router address'),
			_('IPv4 address of the router on this network. Use a subnet that no other network uses.'));
		o.datatype = 'ip4addr("nomask")';
		o.placeholder = '192.168.56.1';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (ip4ToInt(value) == null)
				return _('Expecting an IPv4 address without leading zeros');

			const netmask = this.map.lookupOption('netmask', section_id)?.[0]?.formvalue(section_id);

			return checkSubnet(value, netmask, subnets);
		};

		// A free value with choices: an existing netmask outside the list stays
		// visible, so the validation error explains it.
		o = s.taboption('network', form.Value, 'netmask', _('Netmask'),
			_('From /16 to /24. Devices get the host numbers 100 to 249 of this subnet.'));
		NETMASKS.forEach(function(m) {
			o.value(intToIp4(m[0]), '%s (/%d)'.format(intToIp4(m[0]), m[1]));
		});
		o.placeholder = '255.255.255.0';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (netmaskToInt(value) == null)
				return _('Expecting a netmask from 255.255.0.0 (/16) to 255.255.255.0 (/24)');

			const ipaddr = this.map.lookupOption('ipaddr', section_id)?.[0]?.formvalue(section_id);

			return checkSubnet(ipaddr, value, subnets);
		};

		o = s.taboption('network', form.Value, 'portal_port', _('Portal port'),
			_('The router sends HTTP requests (port 80) from this network to this port.'));
		o.datatype = 'port';
		o.placeholder = '8080';
		o.rmempty = false;
		o.validate = portValidator('dns_port');

		o = s.taboption('network', form.Value, 'dns_port', _('DNS port'),
			_('The router sends DNS requests (port 53) from this network to this port.'));
		o.datatype = 'port';
		o.placeholder = '5300';
		o.rmempty = false;
		o.validate = portValidator('portal_port');

		/* Page */

		o = s.taboption('page', form.ListValue, 'lang', _('Page language'));
		o.value('auto', _('Automatic (browser language)'));
		o.value('en', 'English');
		o.value('zh-Hant', '繁體中文');
		o.value('zh-Hans', '简体中文');
		o.value('ja', '日本語');
		o.default = 'auto';
		o.onchange = function(ev, section_id, value) {
			const texts = PAGE_DEFAULTS[value] ?? PAGE_DEFAULTS.en;

			[ 'title', 'button' ].forEach(function(name) {
				const input = this.map.lookupOption(name, section_id)?.[0]
					?.getUIElement(section_id)?.node?.querySelector('input');

				if (input)
					input.placeholder = texts[name];
			}, this);
		};

		const pageTexts = PAGE_DEFAULTS[uci.get('rickroll', 'main', 'lang')] ?? PAGE_DEFAULTS.en;

		o = s.taboption('page', form.Value, 'title', _('Page title'),
			_('Leave empty to use the default text of the page language.'));
		o.placeholder = pageTexts.title;

		o = s.taboption('page', form.Value, 'button', _('Button text'),
			_('Leave empty to use the default text of the page language.'));
		o.placeholder = pageTexts.button;

		/* Video */

		o = s.taboption('media', form.DummyValue, '_media_state', _('Video'));
		o.renderWidget = function() {
			return E('span', { 'id': 'rickroll-media' }, mediaText(status.media));
		};

		o = s.taboption('media', form.DummyValue, '_media_help', _('Upload'));
		o.renderWidget = function() {
			return E('div', [
				E('p', _('This package contains no video. Convert your own video to HLS and copy it to /etc/rickroll/media on the router with the tools/rickroll-media script from the source repository, for example:')),
				E('pre', 'tools/rickroll-media my-video.mp4 root@192.168.1.1'),
				E('p', _('Use only a video that you have the right to show.'))
			]);
		};

		o = s.taboption('media', form.Button, '_media_delete', _('Delete video'));
		o.inputtitle = _('Delete video');
		o.inputstyle = 'remove';
		o.onclick = L.bind(this.handleDeleteMedia, this);

		return m.render().then(function(mapEl) {
			poll.add(function() {
				return callStatus().then(L.bind(view.updateStatus, view));
			}, 5);

			return E([], [
				E('h2', _('Rickroll captive portal')),
				E('div', { 'class': 'cbi-map-descr' }, [
					E('p', _('Creates an open Wi-Fi network that has no internet access. Every web page on this network shows a portal page. Its button plays the video that you uploaded.')),
					E('p', E('strong', _('Enable it only where you have permission to run a Wi-Fi network.')))
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', _('Status')),
					E('table', { 'class': 'table', 'id': 'rickroll-status' }, statusRows(status))
				]),
				mapEl
			]);
		});
	}
});
