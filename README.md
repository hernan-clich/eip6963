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

> **No cast needed.** `activeProvider.provider` is a standard EIP-1193 provider
> and is structurally assignable to ethers' `Eip1193Provider` and viem's
> `custom()` transport exactly as shown above — you do **not** need `as any` or
> `as never`. If your editor flags a type error here, it's almost always a stale
> TS server (restart it: in VS Code, "TypeScript: Restart TS Server"). Avoid
> reaching for `as never` to silence it — that turns off type checking for the
> whole expression and will hide real mistakes later.

## Switching chains (and adding unknown ones)

`switchChain(chainId)` calls `wallet_switchEthereumChain`. If the wallet doesn't
recognize the chain it rejects with EIP-1193 code `4902` — pass EIP-3085
add-chain params as the second argument and the connector will add the chain via
`wallet_addEthereumChain` and retry the switch for you:

```ts
await switchChain(7000, {
  chainName: 'ZetaChain Mainnet',
  nativeCurrency: { name: 'ZETA', symbol: 'ZETA', decimals: 18 },
  rpcUrls: ['https://zetachain-evm.blockpi.network/v1/rpc/public'],
  blockExplorerUrls: ['https://zetascan.com'],
});
```

Without the second argument, an unknown chain just throws — see error handling
below.

## Error handling

Failed `connect` / `switchChain` calls reject with a `WalletError` that
**preserves the provider's `code`** (e.g. `4902` unknown chain, `4001` user
rejected, `-32002` request already pending) and `data`, so you can branch on it:

```ts
import { WalletError } from 'eip6963';

try {
  await switchChain(7000);
} catch (err) {
  if (err instanceof WalletError && err.code === 4902) {
    // chain not in the wallet — prompt to add it, or call switchChain with params
  }
}
```

The same `WalletError` is also exposed as `state.error` (and `useWallet().error`)
after a failed attempt.

## How auto-reconnect works

On connect, the wallet's `uuid`, `rdns`, `name`, and `account` are persisted
(by default to `localStorage`). On the next load the connector re-matches the
wallet — by `uuid`, then `rdns`, then `name`, then by querying `eth_accounts` —
and silently reconnects (no prompt) if the wallet still authorizes the account.

## License

MIT
