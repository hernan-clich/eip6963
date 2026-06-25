"use client";

// Re-export core types so React consumers need only one import path.
export type {
  AddEthereumChainParameter,
  Connector,
  ConnectorConfig,
  ConnectorStorage,
  ConnectResult,
  Eip1193Provider,
  Eip6963ProviderDetail,
  Eip6963ProviderInfo,
  StoredWallet,
  WalletState,
  WalletStatus,
} from "../core";
export { WalletError } from "../core";
export { ConnectorContext } from "./context";
export {
  type UseWalletReturn,
  useAccount,
  useChainId,
  useConnect,
  useConnector,
  useDisconnect,
  useProviders,
  useSwitchChain,
  useWallet,
  useWalletState,
  useWalletStatus,
} from "./hooks";
export { WalletProvider, type WalletProviderProps } from "./WalletProvider";
