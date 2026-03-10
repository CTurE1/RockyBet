import { useState, useCallback, useEffect, useRef } from "react";
import { parseEther, decodeEventLog } from "viem";
import {
  shieldedWriteContract,
  signedReadContract,
} from "seismic-viem";
import { getPublicClient } from "./useWallet";
import { FACTORY_ADDRESS, FACTORY_ABI, MARKET_ABI } from "../config";

export function useMarkets(walletClient, account) {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const publicClient = getPublicClient();

  const fetchMarkets = useCallback(async () => {
    try {
      const addresses = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "getAllMarkets",
      });

      const results = await Promise.all(
        addresses.map(async (addr, i) => {
          const [info, userHasBet, userClaimed] = await Promise.all([
            publicClient.readContract({
              address: addr,
              abi: MARKET_ABI,
              functionName: "getInfo",
            }),
            account
              ? publicClient.readContract({
                  address: addr,
                  abi: MARKET_ABI,
                  functionName: "hasBet",
                  args: [account],
                })
              : false,
            account
              ? publicClient.readContract({
                  address: addr,
                  abi: MARKET_ABI,
                  functionName: "claimed",
                  args: [account],
                })
              : false,
          ]);
          return {
            id: i,
            address: addr,
            question: info[0],
            deadline: Number(info[1]),
            resolved: info[2],
            outcome: info[3],
            totalPool: info[4],
            totalBettors: Number(info[5]),
            userHasBet,
            userClaimed,
          };
        })
      );

      // Newest first, active markets before resolved
      results.sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        return b.id - a.id;
      });
      // Only update state if data actually changed — avoids re-rendering all cards every 10s
      setMarkets((prev) => {
        if (prev.length !== results.length) return results;
        const changed = results.some(
          (r, i) =>
            r.address !== prev[i].address ||
            r.resolved !== prev[i].resolved ||
            r.outcome !== prev[i].outcome ||
            r.totalPool !== prev[i].totalPool ||
            r.totalBettors !== prev[i].totalBettors ||
            r.userHasBet !== prev[i].userHasBet ||
            r.userClaimed !== prev[i].userClaimed
        );
        return changed ? results : prev;
      });
    } catch (e) {
      console.error("fetchMarkets error:", e);
    } finally {
      setLoading(false);
    }
  }, [publicClient, account]);

  // createMarket — standard write (no shielded params)
  const createMarket = useCallback(
    async (question, deadlineUnix) => {
      if (!walletClient) throw new Error("Connect wallet first");
      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "createMarket",
        args: [question, BigInt(deadlineUnix)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await fetchMarkets();
    },
    [walletClient, publicClient, fetchMarkets]
  );

  // placeBet — SHIELDED WRITE: calldata encrypted via type 0x4a transaction
  // The suint256 _side parameter is encrypted by seismic-viem before sending
  const placeBet = useCallback(
    async (marketAddress, side, amountEth) => {
      if (!walletClient) throw new Error("Connect wallet first");
      const hash = await shieldedWriteContract(walletClient, {
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: "placeBet",
        args: [BigInt(side)],
        value: parseEther(amountEth),
        gas: 500_000n, // Manual gas — eth_estimateGas fails with encrypted calldata
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await fetchMarkets();
    },
    [walletClient, publicClient, fetchMarkets]
  );

  // resolve — standard write (bool is not shielded)
  const resolveMarket = useCallback(
    async (marketAddress, outcome) => {
      if (!walletClient) throw new Error("Connect wallet first");
      const hash = await walletClient.writeContract({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: "resolve",
        args: [outcome],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await fetchMarkets();
    },
    [walletClient, publicClient, fetchMarkets]
  );

  // claim — standard write, returns payout from Claimed event
  const claimWinnings = useCallback(
    async (marketAddress) => {
      if (!walletClient) throw new Error("Connect wallet first");
      const hash = await walletClient.writeContract({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: "claim",
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let payout = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: MARKET_ABI, data: log.data, topics: log.topics });
          if (decoded.eventName === "Claimed") {
            payout = decoded.args.payout;
            break;
          }
        } catch {}
      }
      await fetchMarkets();
      return payout;
    },
    [walletClient, publicClient, fetchMarkets]
  );

  // withdrawFees — admin pulls accumulated protocol fees from a market
  const withdrawFees = useCallback(
    async (marketAddress) => {
      if (!walletClient) throw new Error("Connect wallet first");
      const hash = await walletClient.writeContract({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: "withdrawFees",
      });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    [walletClient, publicClient]
  );

  // getMyBet — SIGNED READ: msg.sender verified cryptographically
  // Only the bet owner can see their own shielded bet amounts
  const getMyBet = useCallback(
    async (marketAddress) => {
      if (!walletClient) return { yesBet: 0n, noBet: 0n };
      try {
        const result = await signedReadContract(walletClient, {
          address: marketAddress,
          abi: MARKET_ABI,
          functionName: "getMyBet",
          gas: 100_000n,
        });
        return { yesBet: result[0], noBet: result[1] };
      } catch (e) {
        console.error("getMyBet error:", e);
        throw e;
      }
    },
    [walletClient]
  );

  useEffect(() => {
    fetchMarkets();
    const id = setInterval(fetchMarkets, 10_000);
    return () => clearInterval(id);
  }, [fetchMarkets]);

  return {
    markets,
    loading,
    createMarket,
    placeBet,
    resolveMarket,
    claimWinnings,
    withdrawFees,
    getMyBet,
    refresh: fetchMarkets,
  };
}
