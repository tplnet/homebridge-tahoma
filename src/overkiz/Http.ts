import https from 'https';

/** HTTP error response of the gateway or cloud (status code and parsed JSON body). */
export class HttpError extends Error {
    constructor(public readonly status: number, public readonly data: any) {
        super('Error ' + status
            + (data?.error ? ' ' + data.error : '')
            + (data?.errorCode ? ' (' + data.errorCode + ')' : ''));
    }
}

export interface RequestOptions {
    /** Send the body as application/x-www-form-urlencoded instead of JSON (cloud login) */
    form?: boolean;
    /** Receives the response headers (e.g. to read the session cookie) */
    onHeaders?: (headers: Record<string, string | string[] | undefined>) => void;
}

/**
 * Minimal JSON-over-HTTPS client, enough for the few endpoints of the gateway and the Somfy cloud.
 * Network errors are rejected with the Node.js error (error.code e.g. ECONNREFUSED).
 */
export function request(
    agent: https.Agent, url: string, method: string, headers: Record<string, string>, body: unknown, timeout: number,
    options: RequestOptions = {},
): Promise<any> {
    return new Promise((resolve, reject) => {
        let payload: string | undefined;
        let contentType: string | undefined;
        if (body !== undefined) {
            if (options.form) {
                payload = new URLSearchParams(body as Record<string, string>).toString();
                contentType = 'application/x-www-form-urlencoded';
            } else {
                payload = JSON.stringify(body);
                contentType = 'application/json';
            }
        }
        const req = https.request(url, {
            method,
            agent,
            timeout,
            headers: {
                ...headers,
                'Accept': 'application/json',
                ...(payload !== undefined ? { 'Content-Type': contentType!, 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
        }, (res) => {
            options.onHeaders?.(res.headers);
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let data: any = text;
                try {
                    data = text.length > 0 ? JSON.parse(text) : undefined;
                } catch {
                    // keep plain text
                }
                const status = res.statusCode ?? 0;
                if (status >= 200 && status < 300) {
                    resolve(data);
                } else {
                    reject(new HttpError(status, data));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy(Object.assign(new Error('Request timeout after ' + timeout / 1000 + ' s'), { code: 'ETIMEDOUT' }));
        });
        req.on('error', reject);
        req.end(payload);
    });
}

/** Network errors that mean "not reachable right now" (retry later) */
export const NETWORK_ERRORS = ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'];

/**
 * Short, readable error message for HTTP, TLS and network errors.
 */
export function describeError(error: any): string {
    if (error instanceof HttpError) {
        return error.message;
    }
    if (typeof error?.code === 'string' && /CERT|SELF_SIGNED|ALTNAME|SIGNATURE/.test(error.code)) {
        return 'TLS error ' + error.code + ': ' + error.message
            + ' – if your gateway certificate is not accepted, set "tlsInsecure": true';
    }
    if (error?.message) {
        return error.code && !error.message.includes(error.code) ? error.code + ': ' + error.message : error.message;
    }
    return String(error);
}
