'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { type ConnectorConfig, createConnector } from '../core';
import { ConnectorContext } from './context';

export interface WalletProviderProps extends ConnectorConfig {
  children: ReactNode;
}

/**
 * Provides a single EIP-6963 {@link createConnector} instance to the React
 * tree. Config props are read once when the connector is created; changing
 * them later has no effect (remount the provider to apply new config).
 */
export const WalletProvider = ({
  children,
  storage,
  storageKey,
  autoConnect,
}: WalletProviderProps) => {
  const [connector] = useState(() =>
    createConnector({ storage, storageKey, autoConnect })
  );

  useEffect(() => connector.destroy, [connector]);

  return (
    <ConnectorContext.Provider value={connector}>
      {children}
    </ConnectorContext.Provider>
  );
};
