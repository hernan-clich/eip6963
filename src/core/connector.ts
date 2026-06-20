import {
  findByAccount,
  findByName,
  findByRdns,
  findByUuid,
  isBrowser,
  onAnnounce,
  requestProviders,
} from './discovery';
import {
  clearStoredWallet,
  type ConnectorStorage,
  defaultStorage,
  readStoredWallet,
  writeStoredWallet,
} from './storage';
import type {
  ConnectResult,
  Eip6963ProviderDetail,
  WalletState,
} from './types';

export interface ConnectorConfig {
  /**
   * Where to persist the last connected wallet for auto-reconnect.
   * Defaults to `localStorage` (falls back to no-op when unavailable).
   * Pass `null` to disable persistence entirely.
   */
  storage?: ConnectorStorage | null;
  /** Storage key for the persisted wallet. Defaults to `eip6963.wallet`. */
  storageKey?: string;
  /**
   * Re-connect to the last wallet on creation, without a permission prompt.
   * Defaults to `true`.
   */
  autoConnect?: boolean;
}

const DEFAULT_KEY = 'eip6963.wallet';

const INITIAL_STATE: WalletState = {
  providers: [],
  status: 'disconnected',
  activeProvider: null,
  account: null,
  chainId: null,
  error: null,
};

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const parseChainId = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof value === 'number') return value;
  return null;
};

export interface Connector {
  /** Current immutable state snapshot (stable reference until it changes). */
  getState: () => WalletState;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
  /**
   * Connect to a wallet, identified by its provider detail or stable `rdns`.
   * Prompts the user via `eth_requestAccounts`.
   */
  connect: (
    target: Eip6963ProviderDetail | string
  ) => Promise<ConnectResult>;
  /** Disconnect locally and forget the persisted wallet. */
  disconnect: () => void;
  /** Request the wallet switch to `chainId` (decimal). */
  switchChain: (chainId: number) => Promise<void>;
  /** Tear down all listeners. Call when the connector is no longer needed. */
  destroy: () => void;
}

/**
 * Create a framework-agnostic EIP-6963 wallet connector. It discovers injected
 * wallets, manages a single active connection, tracks account/chain changes,
 * and (by default) auto-reconnects on reload.
 */
export const createConnector = (config: ConnectorConfig = {}): Connector => {
  const storage: ConnectorStorage =
    config.storage === null
      ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      : (config.storage ?? defaultStorage());
  const storageKey = config.storageKey ?? DEFAULT_KEY;
  const autoConnect = config.autoConnect ?? true;

  let state: WalletState = INITIAL_STATE;
  const listeners = new Set<() => void>();
  /** Listeners bound to the active provider, removed on disconnect. */
  let providerCleanup: (() => void) | null = null;
  let destroyed = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (patch: Partial<WalletState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const addProvider = (detail: Eip6963ProviderDetail) => {
    if (state.providers.some((p) => p.info.uuid === detail.info.uuid)) return;
    setState({ providers: [...state.providers, detail] });
  };

  // ---- active-provider event wiring -------------------------------------

  const unbindProvider = () => {
    providerCleanup?.();
    providerCleanup = null;
  };

  const bindProvider = (detail: Eip6963ProviderDetail) => {
    unbindProvider();
    const { provider } = detail;
    if (!provider.on || !provider.removeListener) return;

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      if (!accounts || accounts.length === 0) {
        // Wallet locked / disconnected from the dapp.
        disconnect();
      } else {
        setState({ account: accounts[0] });
      }
    };
    const onChain = (...args: unknown[]) => {
      setState({ chainId: parseChainId(args[0]) });
    };

    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    providerCleanup = () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  };

  /** Read account + chain from a freshly connected provider. */
  const syncState = async (detail: Eip6963ProviderDetail) => {
    try {
      const chainId = parseChainId(
        await detail.provider.request({ method: 'eth_chainId' })
      );
      setState({ chainId });
    } catch {
      // Non-fatal: chain stays null until a chainChanged event.
    }
  };

  // ---- public API -------------------------------------------------------

  const connect = async (
    target: Eip6963ProviderDetail | string
  ): Promise<ConnectResult> => {
    const detail =
      typeof target === 'string'
        ? findByRdns(state.providers, target)
        : target;

    if (!detail) {
      const error = new Error(
        typeof target === 'string'
          ? `No wallet found with rdns "${target}"`
          : 'Invalid wallet provider'
      );
      setState({ error, status: 'disconnected' });
      return { success: false, error };
    }

    setState({ status: 'connecting', error: null });
    try {
      const accounts = (await detail.provider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        const error = new Error('Wallet returned no accounts');
        setState({ status: 'disconnected', error });
        return { success: false, error };
      }

      bindProvider(detail);
      setState({
        status: 'connected',
        activeProvider: detail,
        account: accounts[0],
        error: null,
      });
      writeStoredWallet(storage, storageKey, {
        account: accounts[0],
        uuid: detail.info.uuid,
        name: detail.info.name,
        rdns: detail.info.rdns,
      });
      void syncState(detail);
      return { success: true, account: accounts[0] };
    } catch (err) {
      const error = toError(err);
      setState({ status: 'disconnected', error });
      return { success: false, error };
    }
  };

  const disconnect = () => {
    unbindProvider();
    clearStoredWallet(storage, storageKey);
    setState({
      status: 'disconnected',
      activeProvider: null,
      account: null,
      chainId: null,
    });
  };

  const switchChain = async (chainId: number) => {
    if (!state.activeProvider) {
      throw new Error('No wallet connected');
    }
    setState({ error: null });
    try {
      await state.activeProvider.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      // chainChanged will update state; set optimistically as a fallback.
      setState({ chainId });
    } catch (err) {
      const error = toError(err);
      setState({ error });
      throw error;
    }
  };

  // ---- reconnect --------------------------------------------------------

  const reconnect = async () => {
    const stored = readStoredWallet(storage, storageKey);
    if (!stored) return;

    setState({ status: 'reconnecting' });

    const detail =
      findByUuid(state.providers, stored.uuid) ??
      findByRdns(state.providers, stored.rdns) ??
      findByName(state.providers, stored.name) ??
      (await findByAccount(state.providers, stored.account));

    if (!detail) {
      // Provider not (yet) present; stay disconnected without clearing —
      // discovery may announce it later and a future reconnect can match.
      if (state.status === 'reconnecting') setState({ status: 'disconnected' });
      return;
    }

    try {
      const accounts = (await detail.provider.request({
        method: 'eth_accounts',
      })) as string[];

      const match = accounts?.some(
        (a) => a.toLowerCase() === stored.account.toLowerCase()
      );

      if (match) {
        bindProvider(detail);
        setState({
          status: 'connected',
          activeProvider: detail,
          account: accounts[0],
        });
        void syncState(detail);
      } else {
        // Authorization was revoked in the wallet.
        clearStoredWallet(storage, storageKey);
        setState({ status: 'disconnected' });
      }
    } catch {
      // Transient error — keep stored data, just stay disconnected.
      if (state.status === 'reconnecting') setState({ status: 'disconnected' });
    }
  };

  // ---- init -------------------------------------------------------------

  let stopAnnounce: (() => void) | null = null;
  let didAttemptReconnect = false;

  if (isBrowser()) {
    stopAnnounce = onAnnounce((detail) => {
      addProvider(detail);
      // Try reconnect once the wallets start showing up.
      if (autoConnect && !didAttemptReconnect && readStoredWallet(storage, storageKey)) {
        didAttemptReconnect = true;
        void reconnect();
      }
    });
    requestProviders();
  }

  const getState = () => state;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    unbindProvider();
    stopAnnounce?.();
    listeners.clear();
  };

  return { getState, subscribe, connect, disconnect, switchChain, destroy };
};
