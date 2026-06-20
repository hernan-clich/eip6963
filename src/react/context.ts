"use client";

import { createContext } from "react";

import type { Connector } from "../core";

/** Holds the connector instance created by `WalletProvider`. */
export const ConnectorContext = createContext<Connector | null>(null);
