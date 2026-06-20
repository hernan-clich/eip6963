# eip6963

A dependency-free EVM wallet connector built on native browser APIs.

- **No third-party libraries.** Uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) for wallet discovery and [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) for the provider. No ethers, no viem, no wagmi bundled.
- **Vanilla core + React layer.** The framework-agnostic core is a tiny subscribable store; the React hooks are a thin wrapper over it via `useSyncExternalStore`.
- **Just connectivity.** Discover injected wallets, connect/disconnect, switch chains, track account/chain changes, and auto-reconnect on reload. It hands you the raw EIP-1193 provider — plug it into ethers, viem, or anything else.
- **TypeScript-first, SSR-safe, ESM + CJS.**

## Install

```sh
npm install eip6963
```

React is an optional peer dependency — only needed if you import `eip6963/react`.

## React

```tsx
import {
  WalletProvider,
  useWallet,
  useProviders,
} from 'eip6963/react';

function Root() {
  return (
    <WalletProvider>
      <Connect />
    </WalletProvider>
  );
}

function Connect() {
  const providers = useProviders();
  const { account, chainId, status, connect, disconnect, switchChain } =
    useWallet();

  if (account) {
    return (
      <div>
        <p>{account} on chain {chainId}</p>
        <button onClick={() => switchChain(1)}>Switch to mainnet</button>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      {providers.map((p) => (
        <button key={p.info.uuid} onClick={() => connect(p)}>
          <img src={p.info.icon} width={20} alt="" /> {p.info.name}
        </button>
      ))}
      {status === 'connecting' && <span>Connecting…</span>}
    </div>
  );
}
```

### Hooks

| Hook | Returns |
| --- | --- |
| `useWallet()` | Full state + `connect` / `disconnect` / `switchChain` + `isConnected` / `isConnecting` |
| `useProviders()` | `Eip6963ProviderDetail[]` discovered so far |
| `useAccount()` | Active address or `null` |
| `useChainId()` | Active chain id (decimal) or `null` |
| `useWalletStatus()` | `{ status, isConnected, isConnecting }` |
| `useConnect()` / `useDisconnect()` / `useSwitchChain()` | The individual actions (stable refs) |
| `useConnector()` | The raw `Connector` instance |

`<WalletProvider>` accepts `autoConnect` (default `true`), `storageKey`, and a custom `storage`.

## Vanilla

The React layer is optional — the core works anywhere:

```ts
import { createConnector } from 'eip6963';

const connector = createConnector();

connector.subscribe(() => {
  const { providers, account, chainId, status } = connector.getState();
  // re-render your UI
});

// connect by provider detail or by stable rdns
await connector.connect('io.metamask');

await connector.switchChain(1);
connector.disconnect();

// when you're done
connector.destroy();
```

## Using the provider with ethers / viem

The connector deliberately doesn't bundle a signing library — it exposes the
raw EIP-1193 provider so you can use whatever you like:

```ts
import { ethers } from 'ethers';

const { activeProvider } = connector.getState();
const browserProvider = new ethers.BrowserProvider(activeProvider!.provider);
const signer = await browserProvider.getSigner();
```

```ts
import { createWalletClient, custom } from 'viem';

const client = createWalletClient({
  transport: custom(activeProvider!.provider),
});
```

## How auto-reconnect works

On connect, the wallet's `uuid`, `rdns`, `name`, and `account` are persisted
(by default to `localStorage`). On the next load the connector re-matches the
wallet — by `uuid`, then `rdns`, then `name`, then by querying `eth_accounts` —
and silently reconnects (no prompt) if the wallet still authorizes the account.

## License

MIT
