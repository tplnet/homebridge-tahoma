import { EventEmitter } from 'events';
import https from 'https';
import { HttpError, NETWORK_ERRORS, describeError, request } from './Http.js';
import type { ApiLogger } from './LocalApiClient.js';

/** Somfy cloud servers per service (the old service names are kept as aliases) */
export const CLOUD_HOSTS: Record<string, string> = {
    somfy_europe: 'ha101-1.overkiz.com',
    tahoma: 'ha101-1.overkiz.com',
    tahoma_switch: 'ha101-1.overkiz.com',
    connexoon: 'ha101-1.overkiz.com',
    somfy_australia: 'ha201-1.overkiz.com',
    connexoon_rts: 'ha201-1.overkiz.com',
    somfy_north_america: 'ha401-1.overkiz.com',
};

const REQUEST_TIMEOUT = 30 * 1000;
// Back-off after a rejected login (seconds), multiplied by 4 after each further rejection
const FIRST_LOCKDOWN = 60;

/**
 * HTTP client for the Somfy cloud (Overkiz enduser API): login with the account e-mail and password,
 * session cookie, re-login once when the session expired.
 *
 * Rate limits of the cloud are per session. A 429 is reported, but never answered with a new login:
 * that would only circumvent the quota and risks an account lock.
 */
export default class CloudApiClient extends EventEmitter {
    private readonly agent = new https.Agent({ keepAlive: true });
    private readonly baseUrl: string;
    private cookie?: string;
    private connectPromise?: Promise<void>;
    private isConnected = false;
    private lockedUntil = 0;
    private lockdown = FIRST_LOCKDOWN;
    // True while the cloud is unreachable, to log the outage once instead of on every retry
    private outage = false;

    constructor(private readonly log: ApiLogger, service: string, private readonly user: string, private readonly password: string) {
        super();
        const host = CLOUD_HOSTS[service];
        if (!host) {
            throw new Error('Unknown service "' + service + '"');
        }
        if (!user || !password) {
            throw new Error('Missing user (account e-mail) or password in configuration');
        }
        this.baseUrl = 'https://' + host + '/enduser-mobile-web/enduserAPI';
    }

    public async connect() {
        if (this.connectPromise === undefined) {
            this.connectPromise = this.login();
            try {
                await this.connectPromise;
            } catch (error) {
                // Do not cache a failed login, the next request tries again (after the lockdown)
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

    private async login(): Promise<void> {
        if (Date.now() < this.lockedUntil) {
            throw 'Login paused for ' + Math.ceil((this.lockedUntil - Date.now()) / 1000) + ' s after a rejected login.'
                + ' Please check your Somfy account e-mail and password.';
        }
        this.cookie = undefined;
        let cookie: string | undefined;
        try {
            await request(this.agent, this.baseUrl + '/login', 'POST', {}, { userId: this.user, userPassword: this.password },
                REQUEST_TIMEOUT, {
                    form: true,
                    onHeaders: (headers) => {
                        const setCookie = headers['set-cookie'];
                        const cookies = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
                        cookie = cookies.find((c) => c.startsWith('JSESSIONID'))?.split(';')[0];
                    },
                });
        } catch (error: any) {
            if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
                this.lockedUntil = Date.now() + this.lockdown * 1000;
                this.log.error('Somfy cloud login rejected (' + error.message + '). Next login attempt in '
                    + CloudApiClient.duration(this.lockdown) + ' – please check your account e-mail and password.');
                this.lockdown = Math.min(this.lockdown * 4, 24 * 3600);
            }
            throw describeError(error);
        }
        if (!cookie) {
            throw 'Somfy cloud login did not return a session';
        }
        this.cookie = cookie;
        this.lockdown = FIRST_LOCKDOWN;
        this.log.info(this.isConnected ? 'Logged in to the Somfy cloud again' : 'Logged in to the Somfy cloud');
    }

    private static duration(seconds: number) {
        if (seconds >= 3600) {
            return Math.round(seconds / 3600) + ' h';
        }
        return seconds >= 60 ? Math.round(seconds / 60) + ' min' : seconds + ' s';
    }

    private async call(method: string, path: string, body?: unknown, retry = true): Promise<any> {
        let session: string | undefined;
        try {
            await this.connect();
            session = this.cookie;
            this.log.debug(method, path);
            const data = await request(this.agent, this.baseUrl + path, method, session ? { Cookie: session } : {}, body,
                REQUEST_TIMEOUT);
            if (this.outage) {
                this.outage = false;
                this.log.info('Somfy cloud reachable again');
            }
            return data;
        } catch (error: any) {
            if (error instanceof HttpError && error.status === 401) {
                // Session expired: log in again once. Only the request that used the current session discards it –
                // parallel requests that fail with the same session then wait for that one login instead of starting more.
                if (session !== undefined && session === this.cookie) {
                    this.connectPromise = undefined;
                    this.cookie = undefined;
                    if (this.isConnected) {
                        this.isConnected = false;
                        this.log.debug('Session expired:', error.message);
                        this.emit('disconnect');
                    }
                }
                if (retry) {
                    return this.call(method, path, body, false);
                }
            } else if (error instanceof HttpError && error.status === 429) {
                this.log.warn('Somfy cloud rate limit reached (' + method + ' ' + path + '): ' + error.message);
            } else if (NETWORK_ERRORS.includes(error?.code) && !this.outage) {
                this.outage = true;
                this.log.warn('Somfy cloud not reachable (' + error.code + '). Retrying...');
            }
            throw typeof error === 'string' ? error : describeError(error);
        }
    }

    /** True while the Somfy cloud is known to be unreachable (the outage has already been logged) */
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
