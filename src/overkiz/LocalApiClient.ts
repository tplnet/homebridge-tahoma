import { EventEmitter } from 'events';
import https from 'https';
import tls from 'tls';
import { OVERKIZ_ROOT_CA } from './OverkizRootCA.js';
import { HttpError, NETWORK_ERRORS, describeError, request } from './Http.js';
import { findGateway } from './Mdns.js';

export interface ApiLogger {
    debug(...args): void;
    info(...args): void;
    warn(...args): void;
    error(...args): void;
}

const IPV4_REGEXP = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/;
const PIN_REGEXP = /^[0-9]{4}-[0-9]{4}-[0-9]{4}$/;
const MDNS_TIMEOUT = 10 * 1000;
const REQUEST_TIMEOUT = 30 * 1000;

/**
 * HTTP client for the local API of a Somfy TaHoma gateway (Developer Mode).
 * https://github.com/Somfy-Developer/Somfy-TaHoma-Developer-Mode
 *
 * The gateway is addressed by its PIN (found via mDNS) or by its IPv4 address.
 * Authentication is a Bearer token generated in the TaHoma app. The API has no rate limits.
 */
export default class LocalApiClient extends EventEmitter {
    private readonly agent: https.Agent;
    private readonly headers: Record<string, string>;
    private readonly byPin: boolean;
    private baseUrl = '';
    private connectPromise?: Promise<void>;
    private isConnected = false;
    // Last IPv4 address the gateway answered on (PIN mode): used when mDNS does not find it again
    private lastKnownAddress?: string;
    // True while the gateway is unreachable, to log the outage once instead of on every retry
    private outage = false;

    constructor(private readonly log: ApiLogger, private readonly gateway: string, token: string, insecureTls = false) {
        super();
        if (!gateway || !token) {
            throw new Error('Missing gateway (PIN or IP) or token in configuration');
        }
        if (!IPV4_REGEXP.test(gateway) && !PIN_REGEXP.test(gateway)) {
            throw new Error('Invalid gateway "' + gateway + '". Please provide the gateway PIN (XXXX-XXXX-XXXX) or its IPv4 address');
        }
        this.byPin = PIN_REGEXP.test(gateway);
        this.headers = { 'Authorization': 'Bearer ' + token };

        if (insecureTls) {
            this.log.warn('TLS certificate verification of the gateway is disabled (tlsInsecure).');
            this.agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
        } else {
            // Trust the Overkiz root CA as recommended by Somfy. The gateway certificate is issued
            // for gateway-<pin>.local, so check the host name against that (we may connect by IP).
            const expectedHost = this.byPin ? 'gateway-' + gateway + '.local' : undefined;
            this.agent = new https.Agent({
                keepAlive: true,
                ca: OVERKIZ_ROOT_CA,
                servername: expectedHost,
                checkServerIdentity: (_host, cert) => expectedHost ? tls.checkServerIdentity(expectedHost, cert) : undefined,
            });
        }
    }

    public async connect() {
        if (this.connectPromise === undefined) {
            this.connectPromise = this.open();
            try {
                await this.connectPromise;
            } catch (error) {
                // Do not cache a failed connection, the next request tries again
                this.connectPromise = undefined;
                throw error;
            }
            if (!this.isConnected) {
                this.isConnected = true;
                this.emit('connect');
            }
        } else {
            await this.connectPromise;
        }
    }

    private async open(): Promise<void> {
        let host = this.gateway;
        if (this.byPin) {
            host = await findGateway(this.gateway, MDNS_TIMEOUT, this.log.debug).catch((error) => {
                if (this.lastKnownAddress) {
                    // Known gateway (e.g. restarting): keep trying its last address instead of the .local name,
                    // which many systems cannot resolve
                    this.log.debug('Gateway not found via mDNS (' + error + '), trying its last known address ' + this.lastKnownAddress);
                    return this.lastKnownAddress;
                }
                const fallback = 'gateway-' + this.gateway + '.local';
                this.log.warn('Gateway not found via mDNS (' + error + '), trying ' + fallback);
                this.log.warn('Please check the gateway PIN and that Developer Mode is enabled in the TaHoma app,'
                    + ' or use the gateway IP address instead of the PIN.');
                return fallback;
            });
        }
        this.baseUrl = 'https://' + host + ':8443/enduser-mobile-web/1/enduserAPI';
        // Validate the connection and the token
        const version = await this.send('GET', '/apiVersion');
        if (this.byPin && IPV4_REGEXP.test(host)) {
            this.lastKnownAddress = host;
        }
        if (!this.isConnected) {
            this.log.info('Connected to gateway ' + host + ' (API version ' + (version?.protocolVersion ?? '?') + ')');
        } else {
            this.log.debug('Reconnected to gateway ' + host);
        }
    }

    private send(method: string, path: string, body?: unknown) {
        this.log.debug(method, path);
        return request(this.agent, this.baseUrl + path, method, this.headers, body, REQUEST_TIMEOUT);
    }

    private async call(method: string, path: string, body?: unknown, retry = true): Promise<any> {
        try {
            await this.connect();
            const data = await this.send(method, path, body);
            if (this.outage) {
                this.outage = false;
                this.log.info('Gateway reachable again');
            }
            return data;
        } catch (error: any) {
            if (error instanceof HttpError && error.status === 401) {
                this.log.error('Token rejected by the gateway (401). Please check the token in the TaHoma app (Developer Mode).');
                this.connectPromise = undefined;
                if (this.isConnected) {
                    this.isConnected = false;
                    this.emit('disconnect');
                    if (retry) {
                        return this.call(method, path, body, false);
                    }
                }
            } else if (NETWORK_ERRORS.includes(error?.code)) {
                if (!this.outage) {
                    this.outage = true;
                    this.log.warn('Gateway not reachable (' + error.code + ') – it may be offline or restarting. Retrying...');
                }
                if (this.byPin) {
                    // The gateway IP may have changed (new DHCP lease): search it again on the next request
                    this.connectPromise = undefined;
                }
            }
            throw describeError(error);
        }
    }

    /** True while the gateway is known to be unreachable (the outage has already been logged) */
    public get unreachable(): boolean {
        return this.outage;
    }

    /** Closes the kept-alive connections (used by the settings page after a connection test) */
    public close() {
        this.agent.destroy();
    }

    public get(path: string, retry = true) {
        return this.call('GET', path, undefined, retry);
    }

    public post(path: string, data?: unknown, retry = true) {
        return this.call('POST', path, data, retry);
    }

    public delete(path: string, retry = true) {
        return this.call('DELETE', path, undefined, retry);
    }

    public put(path: string, data?: unknown, retry = true) {
        return this.call('PUT', path, data, retry);
    }
}
