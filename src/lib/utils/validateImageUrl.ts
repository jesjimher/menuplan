import { error } from '@sveltejs/kit';

// Rangos de IP privadas/reservadas que no deben ser accesibles desde el exterior
const BLOCKED_CIDRS: [number, number, number][] = [
	[0x00000000, 0xff000000, 8],      // 0.0.0.0/8
	[0x7f000000, 0xff000000, 8],      // 127.0.0.0/8
	[0x0a000000, 0xff000000, 8],      // 10.0.0.0/8
	[0xac100000, 0xfff00000, 12],     // 172.16.0.0/12
	[0xc0a80000, 0xffff0000, 16],     // 192.168.0.0/16
	[0xa9fe0000, 0xffff0000, 16],     // 169.254.0.0/16 (link-local)
	[0xe0000000, 0xf0000000, 4],      // 224.0.0.0/4 (multicast)
	[0xf0000000, 0xf0000000, 4],      // 240.0.0.0/4 (reserved)
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', '::1', '0:0:0:0:0:0:0:1']);

function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	let val = 0;
	for (const part of parts) {
		const n = parseInt(part, 10);
		if (isNaN(n) || n < 0 || n > 255) return null;
		val = (val << 8) | n;
	}
	return val >>> 0;
}

function isBlockedIpv4(hostname: string): boolean {
	const ip = ipv4ToInt(hostname);
	if (ip === null) return false;
	for (const [net, mask] of BLOCKED_CIDRS) {
		if ((ip & mask) === net) return true;
	}
	return false;
}

export function validateImageUrl(rawUrl: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		throw error(400, 'URL inválida');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw error(400, 'Solo se permiten URLs http/https');
	}

	const hostname = parsed.hostname.toLowerCase();

	if (BLOCKED_HOSTNAMES.has(hostname)) {
		throw error(400, 'URL no permitida');
	}

	// Bloquear IPs literales privadas/reservadas
	if (isBlockedIpv4(hostname)) {
		throw error(400, 'URL no permitida');
	}

	// IPv6 link-local / loopback (simplificado)
	if (hostname.startsWith('[') && (hostname.includes('::1') || hostname.startsWith('[fe80') || hostname.startsWith('[fc') || hostname.startsWith('[fd'))) {
		throw error(400, 'URL no permitida');
	}

	return parsed;
}
