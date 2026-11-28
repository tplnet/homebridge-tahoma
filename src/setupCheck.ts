/**
 * Checks for the plugin settings page (Homebridge UI, homebridge-ui/server.js).
 * They run only on request in the settings page, never while the plugin runs.
 */
import LocalApiClient, { ApiLogger } from './overkiz/LocalApiClient.js';
import CloudApiClient from './overkiz/CloudApiClient.js';
import Device from './overkiz/models/Device.js';
import { discoverGateways, FoundGateway } from './overkiz/Mdns.js';
import { DEFAULT_EXCLUDE } from './defaultExclude.js';

export interface SetupConfig {
    service?: string;
    user?: string;
    password?: string;
    gateway?: string;
    token?: string;
    tlsInsecure?: boolean;
}

export interface DeviceSummary {
    id: string;
    label: string;
    uiClass: string;
    widget: string;
    protocol: string;
}

export interface CheckResult {
    ok: boolean;
    message: string;
    apiVersion?: string;
    devices?: DeviceSummary[];
}

const CLOUD_PAUSE_MS = 60 * 1000;
let cloudPausedUntil = 0;

/** Collects the log lines of the clients instead of writing them to the Homebridge log */
function collector(lines: string[]): ApiLogger {
    const add = (...args) => lines.push(args.map(String).join(' '));
    return { debug: () => undefined, info: add, warn: add, error: add };
}

const errorText = (error: unknown) => String((error as Error)?.message ?? error);

/** Devices as the plugin shows them: main devices only, without the internal components */
export function summarizeDevices(data: unknown[]): DeviceSummary[] {
    return data
        .map((raw) => Object.assign(new Device(), raw))
        .filter((device) => device.isMainDevice())
        .filter((device) => ![device.definition?.uiClass, device.definition?.widgetName, device.controllableName]
            .some((name) => DEFAULT_EXCLUDE.includes(name)))
        .map((device) => ({
            id: device.uuid,
            label: device.label,
            uiClass: device.definition?.uiClass ?? '',
            widget: device.definition?.widgetName ?? '',
            protocol: device.protocol,
        }));
}

/**
 * Tests the connection with the settings of one configuration.
 * Local API: connects, checks the token and reads the device list (the local API has no rate limit).
 * Somfy cloud: logs in once and out again; the device list is not read (limited per day by Somfy).
 * After a rejected cloud login further tests are paused, so that the account is not locked.
 */
export async function testConnection(config: SetupConfig): Promise<CheckResult> {
    const service = String(config.service ?? 'somfy_europe').toLowerCase();
    const user = config.user ?? config.gateway ?? '';
    const password = config.password ?? config.token ?? '';
    const lines: string[] = [];
    const log = collector(lines);

    if (service === 'local') {
        let api: LocalApiClient | undefined;
        try {
            api = new LocalApiClient(log, user, password, config.tlsInsecure === true);
            await api.connect();
            const version = (await api.get('/apiVersion', false))?.protocolVersion;
            const devices = summarizeDevices(await api.get('/setup/devices', false) ?? []);
            return { ok: true, message: lines.find((line) => line.startsWith('Connected')) ?? 'Connected', apiVersion: version, devices };
        } catch (error) {
            return { ok: false, message: errorText(error) };
        } finally {
            api?.close();
        }
    }

    const remaining = cloudPausedUntil - Date.now();
    if (remaining > 0) {
        return { ok: false, message: 'Test paused for ' + Math.ceil(remaining / 1000) + ' s after a rejected login, so that the '
            + 'Somfy account is not locked. Please check the account e-mail and password.' };
    }
    let api: CloudApiClient | undefined;
    try {
        api = new CloudApiClient(log, service, user, password);
        await api.connect();
        await api.post('/logout', undefined, false).catch(() => undefined);
        return { ok: true, message: 'Logged in to the Somfy cloud' };
    } catch (error) {
        if (lines.some((line) => line.includes('login rejected'))) {
            cloudPausedUntil = Date.now() + CLOUD_PAUSE_MS;
        }
        return { ok: false, message: errorText(error) };
    } finally {
        api?.close();
    }
}

export interface GatewayCheck extends CheckResult {
    label: string;
}

export interface InstallationCheck {
    gateways: GatewayCheck[];
    devices?: DeviceSummary[];
}

/**
 * Tests all gateways of a configuration: the first one (user/password) and, with the local API, the additional gateways.
 * The devices of all gateways are combined like the plugin does it (a device reported by several gateways counts once).
 */
export async function testInstallation(config: SetupConfig & { additionalGateways?: { gateway?: string; token?: string }[] })
    : Promise<InstallationCheck> {
    const local = String(config.service ?? 'somfy_europe').toLowerCase() === 'local';
    const first = local ? 'Gateway ' + (config.user ?? config.gateway ?? '') : 'Somfy cloud';
    const entries: { label: string; config: SetupConfig }[] = [{ label: first, config }];
    if (local) {
        for (const entry of config.additionalGateways ?? []) {
            const gateway = String(entry?.gateway ?? '').trim();
            if (gateway !== '' && !entries.some((e) => e.label === 'Gateway ' + gateway)) {
                const password = String(entry?.token ?? '').trim();
                const tlsInsecure = config.tlsInsecure;
                entries.push({ label: 'Gateway ' + gateway, config: { service: 'local', user: gateway, password, tlsInsecure } });
            }
        }
    }
    const gateways: GatewayCheck[] = [];
    for (const entry of entries) {
        gateways.push({ label: entry.label, ...await testConnection(entry.config) });
    }
    if (!local) {
        return { gateways };
    }
    const devices = new Map<string, DeviceSummary>();
    for (const gateway of gateways) {
        for (const device of gateway.devices ?? []) {
            if (!devices.has(device.id)) {
                devices.set(device.id, device);
            }
        }
    }
    return { gateways, devices: [...devices.values()] };
}

/** Searches the local network for TaHoma gateways with Developer Mode */
export function findGateways(timeout = 6000): Promise<FoundGateway[]> {
    return discoverGateways(timeout);
}
