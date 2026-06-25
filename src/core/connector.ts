import {
  findByAccount,
  findByName,
  findByRdns,
  findByUuid,
  isBrowser,
  onAnnounce,
  requestProviders,
} from "./discovery";
import { toWalletError, WalletError } from "./errors";
import {
  type ConnectorStorage,
  clearStoredWallet,
  defaultStorage,
  readStoredWallet,
  writeStoredWallet,
} from "./storage";
import type {
  AddEthereumChainParameter,
  ConnectResult,
  Eip6963ProviderDetail,
  WalletState,
} from "./types";

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

const DEFAULT_KEY = "eip6963.wallet";

const INITIAL_STATE: WalletState = {
  account: null,
  activeProvider: null,
  chainId: null,
  error: null,
  providers: [],
  status: "disconnected",
};

const parseChainId = (value: unknown): number | null => {
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof value === "number") return value;
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
  connect: (target: Eip6963ProviderDetail | string) => Promise<ConnectResult>;
  /** Disconnect locally and forget the persisted wallet. */
  disconnect: () => void;
  /**
   * Request the wallet switch to `chainId` (decimal). If the wallet doesn't
   * recognize the chain (EIP-1193 error `4902`) and `addChainParams` are
   * supplied, the chain is added via `wallet_addEthereumChain` and the switch
   * is retried. On failure throws a {@link WalletError} carrying the
   * provider's `code`.
   */
  switchChain: (
    chainId: number,
    addChainParams?: AddEthereumChainParameter
  ) => Promise<void>;
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
      ? { getItem: () => null, removeItem: () => {}, setItem: () => {} }
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

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    providerCleanup = () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  };

  /** Read account + chain from a freshly connected provider. */
  const syncState = async (detail: Eip6963ProviderDetail) => {
    try {
      const chainId = parseChainId(
        await detail.provider.request({ method: "eth_chainId" })
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
      typeof target === "string" ? findByRdns(state.providers, target) : target;

    if (!detail) {
      const error = new WalletError(
        typeof target === "string"
          ? `No wallet found with rdns "${target}"`
          : "Invalid wallet provider"
      );
      setState({ error, status: "disconnected" });
      return { error, success: false };
    }

    setState({ error: null, status: "connecting" });
    try {
      const accounts = (await detail.provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts || accounts.length === 0) {
        const error = new WalletError("Wallet returned no accounts");
        setState({ error, status: "disconnected" });
        return { error, success: false };
      }

      bindProvider(detail);
      setState({
        account: accounts[0],
        activeProvider: detail,
        error: null,
        status: "connected",
      });
      writeStoredWallet(storage, storageKey, {
        account: accounts[0],
        name: detail.info.name,
        rdns: detail.info.rdns,
        uuid: detail.info.uuid,
      });
      void syncState(detail);
      return { account: accounts[0], success: true };
    } catch (err) {
      const error = toWalletError(err, "Failed to connect wallet");
      setState({ error, status: "disconnected" });
      return { error, success: false };
    }
  };

  const disconnect = () => {
    unbindProvider();
    clearStoredWallet(storage, storageKey);
    setState({
      account: null,
      activeProvider: null,
      chainId: null,
      status: "disconnected",
    });
  };

  const switchChain = async (
    chainId: number,
    addChainParams?: AddEthereumChainParameter
  ) => {
    if (!state.activeProvider) {
      throw new WalletError("No wallet connected");
    }
    const { provider } = state.activeProvider;
    const hexChainId = `0x${chainId.toString(16)}`;
    setState({ error: null });

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
      // chainChanged will update state; set optimistically as a fallback.
      setState({ chainId });
      return;
    } catch (err) {
      const error = toWalletError(err, "Failed to switch chain");

      // 4902 = the wallet doesn't recognize the chain. Add it (if the caller
      // gave us the params) and retry the switch; otherwise surface the error
      // with its code intact so the caller can decide what to do.
      if (error.code !== 4902 || !addChainParams) {
        setState({ error });
        throw error;
      }

      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hexChainId, ...addChainParams }],
        });
        // Some wallets switch automatically after adding; ensure we land on
        // the target chain regardless.
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: hexChainId }],
        });
        setState({ chainId });
      } catch (addErr) {
        const addError = toWalletError(addErr, "Failed to add chain");
        setState({ error: addError });
        throw addError;
      }
    }
  };

  // ---- reconnect --------------------------------------------------------

  const reconnect = async () => {
    const stored = readStoredWallet(storage, storageKey);
    if (!stored) return;

    setState({ status: "reconnecting" });

    const detail =
      findByUuid(state.providers, stored.uuid) ??
      findByRdns(state.providers, stored.rdns) ??
      findByName(state.providers, stored.name) ??
      (await findByAccount(state.providers, stored.account));

    if (!detail) {
      // Provider not (yet) present; stay disconnected without clearing —
      // discovery may announce it later and a future reconnect can match.
      if (state.status === "reconnecting") setState({ status: "disconnected" });
      return;
    }

    try {
      const accounts = (await detail.provider.request({
        method: "eth_accounts",
      })) as string[];

      const match = accounts?.some(
        (a) => a.toLowerCase() === stored.account.toLowerCase()
      );

      if (match) {
        bindProvider(detail);
        setState({
          account: accounts[0],
          activeProvider: detail,
          status: "connected",
        });
        void syncState(detail);
      } else {
        // Authorization was revoked in the wallet.
        clearStoredWallet(storage, storageKey);
        setState({ status: "disconnected" });
      }
    } catch {
      // Transient error — keep stored data, just stay disconnected.
      if (state.status === "reconnecting") setState({ status: "disconnected" });
    }
  };

  // ---- init -------------------------------------------------------------

  let stopAnnounce: (() => void) | null = null;
  let didAttemptReconnect = false;

  if (isBrowser()) {
    stopAnnounce = onAnnounce((detail) => {
      addProvider(detail);
      // Try reconnect once the wallets start showing up.
      if (
        autoConnect &&
        !didAttemptReconnect &&
        readStoredWallet(storage, storageKey)
      ) {
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

  return { connect, destroy, disconnect, getState, subscribe, switchChain };
};
