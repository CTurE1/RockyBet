import { useState, useCallback, useEffect } from "react";
import { custom } from "viem";
import {
  seismicTestnetGcp2,
  createShieldedPublicClient,
  createShieldedWalletClient,
} from "seismic-viem";
import { SEISMIC_MM } from "../config";

// Methods that MUST go through MetaMask (signing + account access)
const MM_METHODS = new Set([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_signTypedData_v4",
  "eth_signTypedData_v3",
  "eth_signTypedData",
  "personal_sign",
  "eth_sign",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "wallet_watchAsset",
]);

// Fetch-based RPC call to Seismic node
// Uses a replacer to handle BigInt values (seismic-viem typed data contains BigInts)
async function rpcFetch(method, params) {
  const res = await fetch(SEISMIC_MM.rpcUrls[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      { jsonrpc: "2.0", id: 1, method, params },
      (_key, value) => (typeof value === "bigint" ? "0x" + value.toString(16) : value),
    ),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// Hybrid transport: signing goes through MetaMask, everything else (including
// eth_sendRawTransaction and Seismic-specific RPCs) goes directly to the node.
// This is needed because MetaMask blocks eth_sendRawTransaction and doesn't
// support custom RPC methods like seismic_getTeePublicKey.
function createHybridTransport() {
  return custom({
    async request({ method, params }) {
      if (MM_METHODS.has(method)) {
        return window.ethereum.request({ method, params });
      }
      return rpcFetch(method, params);
    },
  });
}

// Shared public client for reads (no wallet needed)
let _publicClient = null;
export function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createShieldedPublicClient({
      chain: seismicTestnetGcp2,
      transport: custom({ request: ({ method, params }) => rpcFetch(method, params) }),
    });
  }
  return _publicClient;
}

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [walletClient, setWalletClient] = useState(null);

  const switchChain = useCallback(async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEISMIC_MM.chainId }],
      });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [SEISMIC_MM],
        });
      }
    }
  }, []);

  const buildClient = useCallback(async (addr) => {
    const client = await createShieldedWalletClient({
      chain: seismicTestnetGcp2,
      transport: createHybridTransport(),
      account: addr,
      publicClient: getPublicClient(),
    });
    return client;
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Install MetaMask to continue");
      return;
    }
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    await switchChain();

    const addr = accounts[0];
    setAccount(addr);

    try {
      const client = await buildClient(addr);
      setWalletClient(client);
    } catch (err) {
      console.error("Failed to create shielded wallet client:", err);
      alert("Failed to initialize encrypted connection. Please try again.");
    }
  }, [switchChain, buildClient]);

  // Auto-reconnect on page load (no popup — uses eth_accounts, not eth_requestAccounts)
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then(async (accounts) => {
        if (accounts[0]) {
          setAccount(accounts[0]);
          await switchChain();
          const client = await buildClient(accounts[0]);
          setWalletClient(client);
        }
      })
      .catch(() => {});
  }, [switchChain, buildClient]);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = (accounts) => {
      if (!accounts[0]) {
        setAccount(null);
        setWalletClient(null);
      } else {
        setAccount(accounts[0]);
        buildClient(accounts[0]).then(setWalletClient).catch((err) => {
          console.error("Failed to re-create shielded wallet client:", err);
        });
      }
    };
    const onChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [buildClient]);

  return { account, walletClient, connect };
}
