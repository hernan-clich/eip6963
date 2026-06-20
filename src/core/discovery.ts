import type {
  Eip6963AnnounceProviderEvent,
  Eip6963ProviderDetail,
} from "./types";

/** True when running in a browser with the APIs EIP-6963 needs. */
export const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.dispatchEvent === "function";

/**
 * Ask installed wallets to (re-)announce themselves. Wallets respond by
 * dispatching `eip6963:announceProvider` events, which {@link onAnnounce}
 * listens for.
 */
export const requestProviders = (): void => {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event("eip6963:requestProvider"));
};

/**
 * Subscribe to wallet announcements. Returns an unsubscribe function.
 */
export const onAnnounce = (
  handler: (detail: Eip6963ProviderDetail) => void
): (() => void) => {
  if (!isBrowser()) return () => {};

  const listener = (event: Event) => {
    handler((event as Eip6963AnnounceProviderEvent).detail);
  };

  window.addEventListener("eip6963:announceProvider", listener);
  return () => window.removeEventListener("eip6963:announceProvider", listener);
};

/** Find a discovered provider by its (per-load) uuid. */
export const findByUuid = (
  providers: Eip6963ProviderDetail[],
  uuid: string
): Eip6963ProviderDetail | undefined =>
  providers.find((p) => p.info.uuid === uuid);

/** Find a discovered provider by its stable reverse-DNS id. */
export const findByRdns = (
  providers: Eip6963ProviderDetail[],
  rdns: string
): Eip6963ProviderDetail | undefined =>
  providers.find((p) => p.info.rdns === rdns);

/** Find a discovered provider by display name. */
export const findByName = (
  providers: Eip6963ProviderDetail[],
  name: string
): Eip6963ProviderDetail | undefined =>
  providers.find((p) => p.info.name === name);

/**
 * Find the first discovered provider that currently reports the given account
 * via `eth_accounts` (no permission prompt). Used as a reconnect fallback.
 */
export const findByAccount = async (
  providers: Eip6963ProviderDetail[],
  account: string
): Promise<Eip6963ProviderDetail | undefined> => {
  const target = account.toLowerCase();
  for (const provider of providers) {
    try {
      const accounts = (await provider.provider.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts?.some((a) => a.toLowerCase() === target)) {
        return provider;
      }
    } catch {
      // Wallet refused or errored — skip it.
    }
  }
  return undefined;
};
