/**
 * Minimal EIP-1193 provider surface this library relies on.
 * @see https://eips.ethereum.org/EIPS/eip-1193
 */
export interface Eip1193Provider {
  request: (args: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => void;
}

/**
 * Wallet metadata announced via EIP-6963.
 * @see https://eips.ethereum.org/EIPS/eip-6963
 */
export interface Eip6963ProviderInfo {
  /** Globally unique id, regenerated per page load. */
  uuid: string;
  /** Human-readable wallet name, e.g. "MetaMask". */
  name: string;
  /** Data URI for the wallet icon. */
  icon: string;
  /** Reverse-DNS identifier, e.g. "io.metamask". Stable across loads. */
  rdns: string;
}

export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

export interface Eip6963AnnounceProviderEvent
  extends CustomEvent<Eip6963ProviderDetail> {
  type: 'eip6963:announceProvider';
}

export type WalletStatus =
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'connected';

/**
 * Immutable snapshot of connector state. A new object reference is produced
 * on every change so it can drive `useSyncExternalStore` directly.
 */
export interface WalletState {
  /** All wallets discovered via EIP-6963 so far. */
  providers: Eip6963ProviderDetail[];
  status: WalletStatus;
  /** The wallet that is currently connected (or being connected). */
  activeProvider: Eip6963ProviderDetail | null;
  /** Active account address, lowercased exactly as returned by the wallet. */
  account: string | null;
  /** Active chain id in decimal, or null when unknown. */
  chainId: number | null;
  /** Last error from connect / switchChain, cleared on the next attempt. */
  error: Error | null;
}

export interface ConnectResult {
  success: boolean;
  account?: string | null;
  error?: Error;
}
