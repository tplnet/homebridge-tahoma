import multicastDns from 'multicast-dns';

const SERVICE = '_kizboxdev._tcp.local';
const IPV4_REGEXP = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Find the IPv4 address of a TaHoma gateway in the local network by its PIN.
 * The gateway announces the service _kizboxdev._tcp with the TXT record gateway_pin
 * (Somfy: host and service names are not reliable, the TXT record has to match).
 */
export function findGateway(pin: string, timeout: number, debug: (...args) => void): Promise<string> {
    const mdns = multicastDns();
    const pins = new Map<string, string>();     // service instance -> gateway_pin
    const targets = new Map<string, string>();  // service instance -> host name
    const addresses = new Map<string, string>(); // host name -> IPv4
    const asked = new Set<string>();             // host names already queried for their A record

    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (error?: string, ip?: string) => {
            if (done) {
                return;
            }
            done = true;
            clearTimeout(timer);
            clearInterval(retry);
            mdns.destroy();
            if (ip) {
                resolve(ip);
            } else {
                reject(error);
            }
        };

        mdns.on('response', (response) => {
            for (const record of [...response.answers, ...(response.additionals ?? [])]) {
                if (record.type === 'PTR' && record.name === SERVICE && !targets.has(String(record.data))) {
                    // Ask the instance for its SRV, TXT and A records
                    mdns.query([{ name: String(record.data), type: 'SRV' }, { name: String(record.data), type: 'TXT' }]);
                } else if (record.type === 'TXT') {
                    const entries = (Array.isArray(record.data) ? record.data : [record.data]).map((x) => x.toString());
                    const entry = entries.find((x) => x.startsWith('gateway_pin='));
                    if (entry) {
                        pins.set(record.name, entry.substring('gateway_pin='.length));
                    }
                } else if (record.type === 'SRV') {
                    targets.set(record.name, record.data.target);
                } else if (record.type === 'A' && IPV4_REGEXP.test(String(record.data))) {
                    addresses.set(record.name, String(record.data));
                }
            }
            for (const [instance, host] of targets) {
                const txtPin = pins.get(instance);
                if (txtPin ? txtPin !== pin : !instance.includes(pin)) {
                    continue;
                }
                const ip = addresses.get(host);
                if (ip) {
                    debug('Gateway ' + instance + ' found at ' + ip);
                    finish(undefined, ip);
                    return;
                }
                if (!asked.has(host)) {
                    asked.add(host);
                    mdns.query(host, 'A');
                }
            }
        });
        mdns.on('error', (error) => finish('mDNS error: ' + error.message));

        const query = () => mdns.query(SERVICE, 'PTR');
        const retry = setInterval(query, 2000);
        const timer = setTimeout(() => finish('timeout after ' + timeout / 1000 + ' seconds'), timeout);
        debug('Looking for gateway with PIN ' + pin);
        query();
    });
}
