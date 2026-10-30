// rpcd plugin "luci.rickroll": status of the rickroll service and its media,
// and the parts of other configs that the settings page needs.
// SPDX-License-Identifier: MIT

'use strict';

import { lsdir, lstat, unlink } from 'fs';
import { cursor } from 'uci';
import { connect } from 'ubus';

const MEDIA_DIR = '/etc/rickroll/media';

// The only files that the portal serves from MEDIA_DIR.
const MEDIA_FILE = /^(index\.m3u8|seg[0-9][0-9][0-9]\.ts)$/;
const SEGMENT_FILE = /^seg[0-9][0-9][0-9]\.ts$/;

// Regular media files in MEDIA_DIR. Symlinks and directories are not
// media files, so they are never followed, counted or deleted.
function media_files() {
	let files = [];

	for (let name in (lsdir(MEDIA_DIR) ?? [])) {
		if (!match(name, MEDIA_FILE))
			continue;

		let st = lstat(`${MEDIA_DIR}/${name}`);

		if (st?.type == 'file')
			push(files, { name, size: st.size });
	}

	return files;
}

function media_status() {
	let present = false, segments = 0, bytes = 0;

	for (let f in media_files()) {
		bytes += f.size;

		if (f.name == 'index.m3u8')
			present = f.size > 0;
		else if (match(f.name, SEGMENT_FILE))
			segments++;
	}

	return { present, segments, bytes };
}

function service_running(ubus) {
	let instances = ubus?.call('service', 'list', { name: 'rickroll' })?.rickroll?.instances;

	return {
		portal: instances?.portal?.running === true,
		dns: instances?.dns?.running === true
	};
}

// The wifi-iface "wireless.rickroll" as netifd reports it.
function wifi_iface(ubus) {
	let radios = ubus?.call('network.wireless', 'status');

	for (let radio, state in radios) {
		for (let iface in (state?.interfaces ?? [])) {
			if (iface?.section != 'rickroll')
				continue;

			let ifname = iface.ifname ?? null;

			return { up: state.up === true && ifname != null, ifname };
		}
	}

	return { up: false, ifname: null };
}

function client_count(ubus, ifname) {
	let clients = ifname ? ubus?.call(`hostapd.${ifname}`, 'get_clients')?.clients : null;

	return type(clients) == 'object' ? length(clients) : 0;
}

// Other enabled access points without a password on the rickroll radio. A
// fresh OpenWrt has one ("OpenWrt", bridged to lan) that appears as soon as
// the radio is enabled. Only name, SSID and network, so no key leaves wireless.
function open_ifaces(uci, radio) {
	let list = [];

	uci?.foreach('wireless', 'wifi-iface', function(s) {
		if (s['.name'] == 'rickroll' || s.device != radio || s.disabled == '1')
			return;
		if ((s.mode ?? 'ap') != 'ap' || (s.encryption ?? 'none') != 'none')
			return;

		let net = s.network;
		push(list, {
			name: s['.name'],
			ssid: s.ssid ?? '',
			network: type(net) == 'array' ? join(' ', net) : (net ?? '')
		});
	});

	return list;
}

const methods = {
	status: {
		call: function() {
			let ubus = connect();
			let uci = cursor();
			let main = uci?.get_all('rickroll', 'main') ?? {};
			let enabled = main.enabled == '1';
			let iface = wifi_iface(ubus);

			let result = {
				running: service_running(ubus),
				iface,
				clients: client_count(ubus, iface.ifname),
				media: media_status(),
				portal_url: enabled ? `http://${main.ipaddr ?? '192.168.56.1'}/` : null,
				open_ifaces: open_ifaces(uci, main.radio ?? 'radio0'),
				enabled
			};

			ubus?.disconnect();

			return result;
		}
	},

	// Radios for the radio choice. Only these options, so no key leaves wireless.
	radios: {
		call: function() {
			let radios = [];

			cursor()?.foreach('wireless', 'wifi-device', function(s) {
				push(radios, {
					name: s['.name'],
					band: s.band ?? null,
					channel: s.channel ?? null,
					disabled: s.disabled == '1'
				});
			});

			return { radios };
		}
	},

	// IPv4 addresses of the static interfaces, to find overlapping subnets.
	// "ipaddr" is "a.b.c.d" or "a.b.c.d/prefix"; "netmask" can be null.
	subnets: {
		call: function() {
			let subnets = [];

			cursor()?.foreach('network', 'interface', function(s) {
				if (s.proto != 'static')
					return;

				for (let addr in (type(s.ipaddr) == 'array' ? s.ipaddr : [ s.ipaddr ]))
					if (addr != null)
						push(subnets, { interface: s['.name'], ipaddr: addr, netmask: s.netmask ?? null });
			});

			return { subnets };
		}
	},

	delete_media: {
		call: function() {
			let deleted = 0, failed = 0;

			for (let f in media_files()) {
				if (unlink(`${MEDIA_DIR}/${f.name}`))
					deleted++;
				else
					failed++;
			}

			return { deleted, failed };
		}
	}
};

return { 'luci.rickroll': methods };
