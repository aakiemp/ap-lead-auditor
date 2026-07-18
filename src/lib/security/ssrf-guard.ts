import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF guard for any server-side request to a user-supplied URL.
 *
 * Checks the target hostname (and, on redirects, each subsequent hop)
 * against a blocklist of private, loopback, link-local, and other
 * reserved IP ranges before a connection is attempted. This is a
 * DNS-time check, not a connection-time IP pin — there is a narrow
 * DNS-rebinding gap (the resolved address could theoretically change
 * between this check and the actual fetch a few milliseconds later).
 * That gap is accepted for this internal, single-user MVP and
 * documented as a future hardening item; see CLAUDE.md.
 */

export type SsrfGuardResult =
  | { status: "safe" }
  | { status: "dns_failure" }
  | { status: "blocked"; reason: string };

const BLOCKED_IPV4_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16", // includes the 169.254.169.254 cloud metadata endpoint
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

const BLOCKED_IPV6_RANGES = [
  "::1/128", // loopback
  "::/128", // unspecified
  "fe80::/10", // link-local
  "fc00::/7", // unique local
  "2001:db8::/32", // documentation range
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inIpv4Range(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_RANGES.some((cidr) => inIpv4Range(ip, cidr));
}

function expandIpv6(ip: string): string {
  const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, undefined];
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  const missing = Math.max(8 - headParts.length - tailParts.length, 0);
  const zeros = new Array(missing).fill("0");
  const allParts = [...headParts, ...zeros, ...tailParts].map((part) => part.padStart(4, "0"));
  while (allParts.length < 8) allParts.push("0000");
  return allParts.slice(0, 8).join(":");
}

function ipv6ToBigInt(ip: string): bigint {
  const expanded = expandIpv6(ip);
  return expanded
    .split(":")
    .reduce(
      (acc, group) => (acc << BigInt(16)) | BigInt(parseInt(group || "0", 16)),
      BigInt(0),
    );
}

function inIpv6Range(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = BigInt(Number(bitsStr));
  const fullMask = (BigInt(1) << BigInt(128)) - BigInt(1);
  const mask =
    bits === BigInt(0) ? BigInt(0) : (fullMask << (BigInt(128) - bits)) & fullMask;
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(base) & mask);
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return BLOCKED_IPV6_RANGES.some((cidr) => inIpv6Range(normalized, cidr));
}

export async function checkUrlIsSafe(url: URL): Promise<SsrfGuardResult> {
  const hostname = url.hostname.toLowerCase();

  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { status: "blocked", reason: "target host is localhost" };
  }

  const literalFamily = isIP(hostname);

  let addresses: { address: string; family: number }[];
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      return { status: "dns_failure" };
    }
  }

  if (addresses.length === 0) {
    return { status: "dns_failure" };
  }

  for (const { address, family } of addresses) {
    if (family === 4 && isBlockedIpv4(address)) {
      return { status: "blocked", reason: "target resolves to a private or reserved IPv4 address" };
    }
    if (family === 6 && isBlockedIpv6(address)) {
      return { status: "blocked", reason: "target resolves to a private or reserved IPv6 address" };
    }
  }

  return { status: "safe" };
}
