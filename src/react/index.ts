'use client';

export { ConnectorContext } from './context';
export {
  useAccount,
  useChainId,
  useConnect,
  useConnector,
  useDisconnect,
  useProviders,
  useSwitchChain,
  useWallet,
  type UseWalletReturn,
  useWalletState,
  useWalletStatus,
} from './hooks';
export { WalletProvider, type WalletProviderProps } from './WalletProvider';

// Re-export core types so React consumers need only one import path.
export type {
  ConnectResult,
  Connector,
  ConnectorConfig,
  ConnectorStorage,
  Eip1193Provider,
  Eip6963ProviderDetail,
  Eip6963ProviderInfo,
  StoredWallet,
  WalletState,
  WalletStatus,
} from '../core';
