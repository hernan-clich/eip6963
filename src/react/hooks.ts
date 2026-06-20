'use client';

import { useContext, useSyncExternalStore } from 'react';

import type {
  Connector,
  Eip6963ProviderDetail,
  WalletState,
  WalletStatus,
} from '../core';
import { ConnectorContext } from './context';

/** Access the underlying connector instance. Throws outside a WalletProvider. */
export const useConnector = (): Connector => {
  const connector = useContext(ConnectorContext);
  if (!connector) {
    throw new Error('useConnector must be used within a <WalletProvider>');
  }
  return connector;
};

/** Subscribe to the full connector state. Re-renders on any state change. */
export const useWalletState = (): WalletState => {
  const connector = useConnector();
  return useSyncExternalStore(
    connector.subscribe,
    connector.getState,
    connector.getState
  );
};

export interface UseWalletReturn extends WalletState {
  connect: Connector['connect'];
  disconnect: Connector['disconnect'];
  switchChain: Connector['switchChain'];
  /** Convenience flag: `status === 'connected'`. */
  isConnected: boolean;
  /** Convenience flag: `status === 'connecting' || 'reconnecting'`. */
  isConnecting: boolean;
}

/** Primary hook: full wallet state plus connect/disconnect/switchChain. */
export const useWallet = (): UseWalletReturn => {
  const connector = useConnector();
  const state = useWalletState();
  return {
    ...state,
    connect: connector.connect,
    disconnect: connector.disconnect,
    switchChain: connector.switchChain,
    isConnected: state.status === 'connected',
    isConnecting:
      state.status === 'connecting' || state.status === 'reconnecting',
  };
};

/** Wallets discovered via EIP-6963. */
export const useProviders = (): Eip6963ProviderDetail[] =>
  useWalletState().providers;

/** The connected account address, or null. */
export const useAccount = (): string | null => useWalletState().account;

/** The active chain id (decimal), or null. */
export const useChainId = (): number | null => useWalletState().chainId;

/** Connection status plus derived booleans. */
export const useWalletStatus = (): {
  status: WalletStatus;
  isConnected: boolean;
  isConnecting: boolean;
} => {
  const { status } = useWalletState();
  return {
    status,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting' || status === 'reconnecting',
  };
};

/** The connect action (stable reference). */
export const useConnect = (): Connector['connect'] => useConnector().connect;

/** The disconnect action (stable reference). */
export const useDisconnect = (): Connector['disconnect'] =>
  useConnector().disconnect;

/** The switchChain action (stable reference). */
export const useSwitchChain = (): Connector['switchChain'] =>
  useConnector().switchChain;
