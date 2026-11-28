/**
 * Device types the plugin never shows in Apple Home (internal components of the gateway, unsupported sensors).
 * Shared by the platform and the settings page, so both count the same devices.
 */
export const DEFAULT_EXCLUDE: readonly string[] = [
    'Pod', 'ConfigurationComponent', 'NetworkComponent', 'ProtocolGateway', 'ConsumptionSensor',
    'OnOffHeatingSystem', 'Wifi', 'RemoteController',
    // AtlanticElectricalTowelDryer bad sensors
    'io:LightIOSystemDeviceSensor', 'io:RelativeHumidityIOSystemDeviceSensor', 'enocean:EnOceanHumidityComfortSensor',
    'WeatherForecastSensor',
];
