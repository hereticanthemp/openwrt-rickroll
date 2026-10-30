// rpcd plugin "luci.rickroll": status of the rickroll service and its media.
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

const methods = {
	status: {
		call: function() {
			let ubus = connect();
			let main = cursor()?.get_all('rickroll', 'main') ?? {};
			let enabled = main.enabled == '1';
			let iface = wifi_iface(ubus);

			let result = {
				running: service_running(ubus),
				iface,
				clients: client_count(ubus, iface.ifname),
				media: media_status(),
				portal_url: enabled
					? `http://${main.ipaddr ?? '192.168.56.1'}:${main.portal_port ?? '8080'}/`
					: null,
				enabled
			};

			ubus?.disconnect();

			return result;
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
