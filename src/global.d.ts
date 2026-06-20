import type { Eip6963AnnounceProviderEvent } from "./core/types";

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": Eip6963AnnounceProviderEvent;
    "eip6963:requestProvider": Event;
  }
}
