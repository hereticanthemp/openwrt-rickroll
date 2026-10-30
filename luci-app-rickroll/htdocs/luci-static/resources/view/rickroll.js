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

const RESERVED_PORTS = [ 53, 80 ];

function badge(ok, text) {
	return E('span', { 'class': ok ? 'label success' : 'label warning' }, text);
}

function mediaText(media) {
	if (!media?.present)
		return _('No video. Upload one with tools/rickroll-media.');

	return _('%d segments, %1024.2mB').format(media.segments, media.bytes);
}

function statusRows(st) {
	const rows = [
		[ _('Enabled'), badge(st.enabled, st.enabled ? _('Yes') : _('No')) ],
		[ _('Portal web server'), badge(st.running?.portal, st.running?.portal ? _('Running') : _('Not running')) ],
		[ _('Portal DNS server'), badge(st.running?.dns, st.running?.dns ? _('Running') : _('Not running')) ],
		[ _('Wi-Fi interface'), badge(st.iface?.up, st.iface?.up ? _('Up (%s)').format(st.iface.ifname) : _('Down')) ],
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

function portValidator(otherOption) {
	return function(section_id, value) {
		if (!/^[1-9][0-9]*$/.test(value) || +value > 65535)
			return _('Expecting a port number from 1 to 65535');

		if (RESERVED_PORTS.indexOf(+value) >= 0)
			return _('Ports 53 and 80 are used by the router; choose another port');

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
			uci.load([ 'rickroll', 'wireless' ])
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
		uci.sections('wireless', 'wifi-device', function(dev) {
			const band = BANDS[dev.band] ?? dev.band ?? '?';
			const channel = (dev.channel == null || dev.channel == 'auto') ? _('auto') : dev.channel;

			o.value(dev['.name'], _('%s (%s, channel %s)').format(dev['.name'], band, channel));
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

		o = s.taboption('network', form.Value, 'netmask', _('Netmask'));
		o.datatype = 'ip4addr("nomask")';
		o.placeholder = '255.255.255.0';
		o.rmempty = false;

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
