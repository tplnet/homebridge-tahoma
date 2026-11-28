/**
 * Server part of the plugin settings page (Homebridge UI custom UI).
 * Runs only while the settings of the plugin are open in the Homebridge UI, and acts only when asked by the page:
 * - /discover: search the local network for TaHoma gateways with Developer Mode (mDNS)
 * - /test: test the connection of all gateways of one configuration (local gateways or Somfy cloud)
 * Connections go only to the TaHoma gateway in the local network or to the Somfy cloud server of the selected region.
 */
import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';

import { findGateways, testInstallation } from '../dist/setupCheck.js';

class UiServer extends HomebridgePluginUiServer {
    constructor() {
        super();
        this.onRequest('/discover', () => findGateways());
        this.onRequest('/test', (config) => testInstallation(config ?? {}));
        this.ready();
    }
}

(() => new UiServer())();
