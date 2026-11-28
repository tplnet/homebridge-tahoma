// Helpers of the settings page (no DOM access, tested in test/settings-page.mjs)

export const PLATFORM = 'Tahoma';
export const DEFAULT_NAME = 'TaHoma';

const SERVICE_LABELS = {
    local: 'Local API',
    somfy_europe: 'Somfy cloud (Europe)',
    somfy_australia: 'Somfy cloud (Australia)',
    somfy_north_america: 'Somfy cloud (North America)',
};

export function serviceOf(config) {
    return String(config?.service ?? 'somfy_europe').toLowerCase();
}

export function serviceLabel(config) {
    return SERVICE_LABELS[serviceOf(config)] ?? serviceOf(config);
}

/** Name of a configuration in the selection (only shown with several configurations from the JSON editor) */
export function configLabel(config, index) {
    const name = typeof config?.name === 'string' && config.name.trim() !== '' ? config.name.trim() : 'Configuration ' + (index + 1);
    return name + ' – ' + serviceLabel(config);
}

const additionalOf = (config) => (Array.isArray(config?.additionalGateways) ? config.additionalGateways : [])
    .filter((entry) => typeof entry?.gateway === 'string' && entry.gateway.trim() !== '');

/** The gateways of a configuration: the first one and, with the local API, the additional ones */
export function gatewaysOf(config) {
    const first = config?.user ?? config?.gateway ?? '';
    if (serviceOf(config) !== 'local') {
        return [{ role: 'cloud', address: first, label: 'Somfy cloud' }];
    }
    return [
        { role: 'first', address: first, label: 'Gateway ' + first },
        ...additionalOf(config).map((entry) => ({ role: 'additional', address: entry.gateway.trim(), label: 'Gateway ' + entry.gateway.trim() })),
    ];
}

/** True if a found gateway (PIN and IP) is already used by the configuration */
export function isUsed(config, found) {
    return serviceOf(config) === 'local' && gatewaysOf(config).some((gateway) => [found.ip, found.pin].includes(gateway.address));
}

/** Uses a found gateway as the first gateway (local API) with its IP address (recommended) or its PIN */
export function applyGateway(config, gateway, use = 'ip') {
    const result = { ...config, service: 'local', user: use === 'pin' ? gateway.pin : gateway.ip };
    delete result.gateway;
    return result;
}

/** Adds a found gateway as an additional gateway (local API); the token has to be entered in the form */
export function addAdditionalGateway(config, gateway, use = 'ip') {
    if (isUsed(config, gateway)) {
        return config;
    }
    const entries = Array.isArray(config?.additionalGateways) ? config.additionalGateways.filter((entry) => entry?.gateway || entry?.token) : [];
    return { ...config, service: 'local', additionalGateways: [...entries, { gateway: use === 'pin' ? gateway.pin : gateway.ip, token: '' }] };
}

/** What is missing before a connection test makes sense, or undefined */
export function missingSettings(config) {
    const user = config?.user ?? config?.gateway;
    const password = config?.password ?? config?.token;
    if (serviceOf(config) === 'local') {
        if (!user) {
            return 'Enter the gateway PIN or IP address (or search for gateways below).';
        }
        if (!password) {
            return 'Enter the token from the TaHoma app (Developer Mode).';
        }
        const withoutToken = additionalOf(config).find((entry) => !String(entry.token ?? '').trim());
        if (withoutToken) {
            return 'Enter the token of the additional gateway ' + withoutToken.gateway.trim() + ' in the settings.';
        }
    } else if (!user || !password) {
        return 'Enter the e-mail address and password of your Somfy account.';
    }
    return undefined;
}

/** Text of the test result of one gateway */
export function describeResult(result) {
    if (!result?.ok) {
        return { kind: 'danger', text: result?.message ?? 'Unknown error' };
    }
    const devices = result.devices ? ' – ' + result.devices.length + ' devices' : '';
    return { kind: 'success', text: result.message + devices };
}

/** Summary of a test of all gateways */
export function describeInstallation(check) {
    const failed = (check?.gateways ?? []).filter((gateway) => !gateway.ok).length;
    if (failed > 0) {
        return { kind: 'danger', title: failed === 1 ? 'One gateway failed' : failed + ' gateways failed' };
    }
    const count = check?.devices ? ' – ' + check.devices.length + ' devices will appear in Apple Home (without the ones hidden in the settings)' : '';
    return { kind: 'success', title: 'Connection works' + count };
}
