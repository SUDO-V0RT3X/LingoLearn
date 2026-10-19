// Express's `trust proxy` setting decides whether req.ip comes from the socket
// or from the X-Forwarded-For header. Trusting every hop (`true`) lets any
// client name its own IP, which defeats the per-IP rate limits, so the default
// is off and a deployment behind a proxy opts in through TRUST_PROXY.

export type TrustProxySetting = false | number | string;

/**
 * Turns TRUST_PROXY into a safe `trust proxy` value:
 *   unset, '', 'false', '0'      -> false (req.ip is the socket address)
 *   a positive whole number      -> that many proxy hops
 *   anything else                -> passed through: 'loopback', 'uniquelocal',
 *                                   or a comma-separated list of addresses/subnets
 * 'true' is refused (treated as off), because trusting every hop is exactly the
 * spoofing hole this setting closes.
 */
export function trustProxySetting(raw: string | undefined): TrustProxySetting {
    const value = raw?.trim() ?? '';
    if (value === '' || value === 'false' || value === '0' || value === 'true') return false;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
}
