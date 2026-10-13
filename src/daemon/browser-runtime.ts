import {
  BrowserDriverError,
  BrowserSessionRegistry,
  CdpDriver,
  DEFAULT_ORIGIN_POLICY,
  ExtensionDriver,
  ExtensionServer,
  type BrowserDriver,
  type BrowserListenerHealth,
  type ConnectOptions,
  type OriginPolicyConfig,
  type RegistryStatus,
} from '../vendor.js';
import type { PairingStore } from './pairing-store.js';

export interface BrowserRuntimeDeps {
  store: PairingStore;
  /** Extension WebSocket port. 0 picks a free one (tests). */
  wsPort: number;
  /** Used when `browser_connect` asks for CDP without a port. */
  cdpPort?: number;
  /** This daemon's own listener ports; the agent must never be able to browse to them. */
  localPorts?: number[];
  /** Pairing HTTP port, quoted in `browser_status` guidance. */
  pairPort?: number;
  /** Env var named in the "port in use" hint. */
  wsPortEnv?: string;
  createDriver?: (options: ConnectOptions) => Promise<BrowserDriver>;
}

export type BrowserStatus = RegistryStatus & {
  listener: BrowserListenerHealth;
  activeProfileName: string | null;
  extensionSocketAuthenticated: boolean;
};

type Driver = BrowserDriver;
type Arg<K extends 'tabs' | 'navigate' | 'snapshot' | 'read' | 'act' | 'logs'> = Parameters<
  Driver[K]
>;

const LISTEN_CODES = ['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL'];

/**
 * Owns the extension WebSocket server, the session registry and the drivers.
 * A port of aevra's worker `BrowserRuntime` and `browser-dispatch`, with the
 * pairing registry read from the local store instead of pushed in by Core.
 */
export class BrowserRuntime {
  private server: ExtensionServer | null = null;
  private boundPort: number;
  private listener: BrowserListenerHealth;
  private readonly registry: BrowserSessionRegistry;

  constructor(private readonly deps: BrowserRuntimeDeps) {
    this.boundPort = deps.wsPort;
    this.listener = this.health('stopped', deps.wsPort, null);
    this.registry = new BrowserSessionRegistry({
      createDriver: (options) => this.createDriver(options),
      extensionPaired: () => Boolean(this.server?.peer()),
      // An epoch bump drops the socket; keep listening so a revoked extension
      // can learn it must pair again instead of retrying a closed port.
      teardownExtension: () => this.restartServer(),
    });
  }

  private health(
    state: BrowserListenerHealth['state'],
    port: number,
    errorCode: string | null,
  ): BrowserListenerHealth {
    return { state, port, errorCode, changedAt: new Date().toISOString() };
  }

  private async createDriver(options: ConnectOptions): Promise<Driver> {
    if (this.deps.createDriver) return this.deps.createDriver(options);
    if (options.transport === 'cdp') return new CdpDriver();
    return new ExtensionDriver(await this.ensureServer());
  }

  private async ensureServer(): Promise<ExtensionServer> {
    if (this.server) return this.server;
    const { store } = this.deps;
    const server = new ExtensionServer({
      secret: store.key(),
      pairings: () => store.pairings(),
      epoch: () => store.epoch(),
    });
    try {
      const address = await server.start({ port: this.boundPort });
      this.boundPort = address.port;
    } catch (error) {
      const code = String((error as { code?: string }).code ?? 'BROWSER_LISTENER_FAILED');
      this.listener = this.health(
        'failed',
        this.boundPort,
        LISTEN_CODES.includes(code) ? code : 'BROWSER_LISTENER_FAILED',
      );
      throw this.listenError(code);
    }
    this.server = server;
    this.listener = this.health('listening', this.boundPort, null);
    return server;
  }

  private listenError(code: string): BrowserDriverError {
    const env = this.deps.wsPortEnv ?? 'AEVRA_BROWSER_WS_PORT';
    if (code === 'EADDRINUSE') {
      return new BrowserDriverError(
        'BROWSER_LISTENER_FAILED',
        `port ${this.boundPort} in use (set ${env}) [EADDRINUSE]`,
      );
    }
    return new BrowserDriverError(
      'BROWSER_LISTENER_FAILED',
      `cannot listen on port ${this.boundPort} (set ${env}) [${code}]`,
    );
  }

  private async stopServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.listener = this.health('stopped', this.boundPort, null);
    if (server) await server.stop();
  }

  private async restartServer(): Promise<void> {
    await this.stopServer();
    try {
      await this.ensureServer();
    } catch {
      // The failure is recorded in `listener`; status reports it.
    }
  }

  /** Eagerly starts the extension listener so a paired extension can attach. */
  async start(): Promise<{ wsUrl: string; port: number }> {
    await this.registry.setEpoch(this.deps.store.epoch());
    await this.ensureServer();
    return { wsUrl: `ws://127.0.0.1:${this.boundPort}`, port: this.boundPort };
  }

  wsPort(): number {
    return this.boundPort;
  }

  pairPort(): number {
    return this.deps.pairPort ?? 47841;
  }

  pairedCount(): number {
    return this.deps.store.pairings().length;
  }

  /** Aevra's own ports, plus this daemon's, are never drivable. */
  originPolicy(): Partial<OriginPolicyConfig> {
    const own = (this.deps.localPorts ?? []).filter((port) => port > 0);
    return { aevraPorts: [...DEFAULT_ORIGIN_POLICY.aevraPorts, ...own] };
  }

  async connect(options: ConnectOptions) {
    await this.registry.setEpoch(this.deps.store.epoch());
    const resolved: ConnectOptions =
      options.transport === 'cdp' && options.cdpPort === undefined && this.deps.cdpPort
        ? { ...options, cdpPort: this.deps.cdpPort }
        : options;
    return this.registry.connect(resolved);
  }

  disconnect(): Promise<void> {
    return this.registry.disconnect();
  }

  /** Re-checks the live socket against the store after any pairing change. */
  async onPairingsChanged(): Promise<void> {
    const pairings = this.deps.store.pairings();
    const server = this.server;
    const stillAllowed = server?.activePairingStillAllowed(pairings) ?? true;
    server?.pruneStandby(pairings);
    if (!stillAllowed) {
      await this.registry.disconnect();
      server?.rejectPeer();
    }
    await this.registry.setEpoch(this.deps.store.epoch());
  }

  async status(): Promise<BrowserStatus> {
    const base = await this.registry.status();
    return {
      ...base,
      listener: { ...this.listener },
      activeProfileName: this.server?.activeProfile()?.profileName ?? null,
      extensionSocketAuthenticated: Boolean(this.server?.peer()),
    };
  }

  tabs(...args: Arg<'tabs'>) {
    return this.registry.run((driver) => driver.tabs(...args));
  }

  navigate(...args: Arg<'navigate'>) {
    return this.registry.run((driver) => driver.navigate(...args));
  }

  snapshot(...args: Arg<'snapshot'>) {
    return this.registry.run((driver) => driver.snapshot(...args));
  }

  read(...args: Arg<'read'>) {
    return this.registry.run((driver) => driver.read(...args));
  }

  act(...args: Arg<'act'>) {
    return this.registry.run((driver) => driver.act(...args));
  }

  logs(...args: Arg<'logs'>) {
    return this.registry.run((driver) => driver.logs(...args));
  }

  async shutdown(): Promise<void> {
    await this.registry.disconnect();
    await this.stopServer();
  }
}
