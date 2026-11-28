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

/** Name of a configuration in the selection (several gateways or accounts) */
export function configLabel(config, index) {
    const name = typeof config?.name === 'string' && config.name.trim() !== '' ? config.name.trim() : 'Configuration ' + (index + 1);
    return name + ' – ' + serviceLabel(config);
}

/** Uses a found gateway in the configuration: local API with its IP address (recommended) or its PIN */
export function applyGateway(config, gateway, use = 'ip') {
    const result = { ...config, service: 'local', user: use === 'pin' ? gateway.pin : gateway.ip };
    delete result.gateway;
    return result;
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
    } else if (!user || !password) {
        return 'Enter the e-mail address and password of your Somfy account.';
    }
    return undefined;
}

/** Text of a connection test result for the page */
export function describeResult(result) {
    if (!result?.ok) {
        return { kind: 'danger', title: 'Connection failed', lines: [result?.message ?? 'Unknown error'] };
    }
    const lines = [result.message];
    if (result.devices) {
        lines.push(result.devices.length + ' devices will appear in Apple Home (without the ones hidden in the settings).');
    }
    return { kind: 'success', title: 'Connection works', lines };
}
