import React, { useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Web3 from "web3";
import { NETWORKS, BSC_ENDPOINTS, ERC20_ABI } from "./constants";

type SolToken = { mint: string; amount: string };
type BscToken = { address: string; symbol?: string; amount?: string };

export default function WalletViewer() {
    const [chain, setChain] = useState<"sol" | "bsc">("sol");
    const [netKey, setNetKey] = useState<string>("mainnet");
    const [customRpc, setCustomRpc] = useState("");
    const [address, setAddress] = useState("");
    const [loading, setLoading] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [solTokens, setSolTokens] = useState<SolToken[]>([]);
    const [bscBalance, setBscBalance] = useState<string | null>(null);
    const [bscTokensInput, setBscTokensInput] = useState("");
    const [bscTokens, setBscTokens] = useState<BscToken[]>([]);
    const [log, setLog] = useState<string[]>([]);

    const appendLog = (s: string) => setLog((l) => [...l, s]);

    const fetchSol = async (net: string, addr: string) => {
        try {
            const netKey = (net || "mainnet") as keyof typeof NETWORKS;
            const rpcUrl = customRpc && customRpc.trim() !== "" ? customRpc.trim() : NETWORKS[netKey].rpc;
            appendLog(`Using RPC: ${rpcUrl}`);

            // Try to establish a connection, with a small retry in case of transient network/CORS failures
            let conn: Connection | null = null;
            let lastErr: any = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    conn = new Connection(rpcUrl, "confirmed");
                    // lightweight health check
                    await conn.getEpochInfo("confirmed");
                    lastErr = null;
                    break;
                } catch (err: any) {
                    lastErr = err;
                    appendLog(`RPC connect attempt ${attempt} failed: ${err?.message || String(err)}`);
                    // small backoff
                    await new Promise((r) => setTimeout(r, 400 * attempt));
                }
            }
            if (!conn) throw lastErr || new Error("Failed to create RPC connection");

            const pk = new PublicKey(addr);
            const bal = await conn.getBalance(pk, "confirmed");
            setSolBalance(Number(bal) / 1_000_000_000);

            const res = await conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID });
            const tokens: SolToken[] = [];
            for (const it of res.value) {
                const info: any = it.account.data.parsed?.info;
                if (!info) continue;
                const mint = info.mint;
                const ui = info.tokenAmount?.uiAmountString ?? info.tokenAmount?.amount ?? "0";
                tokens.push({ mint, amount: String(ui) });
            }
            setSolTokens(tokens);
            appendLog(`Found ${tokens.length} token accounts`);
        } catch (e: any) {
            const msg = e?.message || String(e);
            if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("TypeError")) {
                appendLog(`Sol fetch error: ${msg} — this often means the RPC endpoint is unreachable or blocked by CORS. Try a different RPC or paste a QuickNode/your RPC URL into the 'Custom RPC' field.`);
            } else {
                appendLog(`Sol fetch error: ${msg}`);
            }
        }
    };

    const fetchBsc = async (net: string, addr: string, tokenAddrs: string[]) => {
        try {
            const netKey = (net || "mainnet") as keyof typeof BSC_ENDPOINTS;
            const rpc = BSC_ENDPOINTS[netKey].rpc;
            const web3 = new Web3(new Web3.providers.HttpProvider(rpc));
            const bal = await web3.eth.getBalance(addr);
            setBscBalance(Web3.utils.fromWei(bal, "ether"));

            const results: BscToken[] = [];
            for (const t of tokenAddrs) {
                if (!t) continue;
                try {
                    const contract: any = new web3.eth.Contract(ERC20_ABI as any, t);
                    const [decimals, symbol, raw] = await Promise.all([
                        contract.methods.decimals().call(),
                        contract.methods.symbol().call(),
                        contract.methods.balanceOf(addr).call(),
                    ]);
                    const amount = Number(raw) / Math.pow(10, Number(decimals || 18));
                    results.push({ address: t, symbol, amount: String(amount) });
                } catch (err: any) {
                    appendLog(`Error reading token ${t}: ${err?.message || String(err)}`);
                }
            }
            setBscTokens(results);
        } catch (e: any) {
            appendLog(`BSC fetch error: ${e?.message || String(e)}`);
        }
    };

    const handleFetch = async () => {
        setLog([]);
        setSolBalance(null);
        setSolTokens([]);
        setBscBalance(null);
        setBscTokens([]);
        if (!address) {
            appendLog("Enter an address first");
            return;
        }
        setLoading(true);
        if (chain === "sol") {
            await fetchSol(netKey, address);
        } else {
            const tokens = bscTokensInput.split(",").map((s) => s.trim()).filter(Boolean);
            await fetchBsc(netKey, address, tokens);
        }
        setLoading(false);
    };

    return (
        <div className="bg-white rounded-2xl shadow-2xl w-full mx-auto overflow-hidden">
            <div className="bg-green-600 text-white text-center py-4">
                <h1 className="text-xl font-semibold">Wallet Viewer</h1>
            </div>

            <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Chain</label>
                        <select value={chain} onChange={(e) => setChain(e.target.value as any)} className="w-full px-3 py-2 bg-gray-50 border rounded">
                            <option value="sol">Solana</option>
                            <option value="bsc">BSC (EVM)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Network</label>
                        {chain === "sol" ? (
                            <select value={netKey} onChange={(e) => setNetKey(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border rounded">
                                <option value="mainnet">Mainnet</option>
                                <option value="devnet">Devnet</option>
                            </select>
                        ) : (
                            <select value={netKey} onChange={(e) => setNetKey(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border rounded">
                                <option value="mainnet">Mainnet</option>
                                <option value="testnet">Testnet</option>
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Address</label>
                        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Paste wallet address" className="w-full px-3 py-2 bg-gray-50 border rounded" />
                    </div>
                </div>

                {chain === "sol" && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Custom RPC (optional)</label>
                        <input value={customRpc} onChange={(e) => setCustomRpc(e.target.value)} placeholder="https://your-rpc" className="w-full px-3 py-2 bg-gray-50 border rounded" />
                    </div>
                )}

                {chain === "bsc" && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Token contracts to check (comma separated)</label>
                        <input value={bscTokensInput} onChange={(e) => setBscTokensInput(e.target.value)} placeholder="0x...,0x..." className="w-full px-3 py-2 bg-gray-50 border rounded" />
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={handleFetch} className="px-4 py-2 bg-green-600 text-white rounded">{loading ? "Loading..." : "Fetch"}</button>
                    <button onClick={() => { setAddress(""); setSolBalance(null); setSolTokens([]); setBscBalance(null); setBscTokens([]); setLog([]); }} className="px-4 py-2 bg-gray-600 text-white rounded">Clear</button>
                </div>

                <div>
                    <h3 className="font-medium">Results</h3>
                    <div className="mt-2 bg-gray-50 p-3 rounded">
                        {chain === "sol" ? (
                            <div>
                                <div className="mb-2">SOL balance: {solBalance === null ? "-" : solBalance.toFixed(6)}</div>
                                <div>
                                    <div className="text-sm font-medium mb-1">Token accounts</div>
                                    {solTokens.length === 0 ? <div className="text-sm text-gray-500">No token accounts found</div> : (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr><th className="text-left">Mint</th><th className="text-left">Amount</th></tr>
                                            </thead>
                                            <tbody>
                                                {solTokens.map((t, i) => (
                                                    <tr key={i}><td className="py-1 text-xs break-words">{t.mint}</td><td className="py-1">{t.amount}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="mb-2">BNB balance: {bscBalance ?? "-"}</div>
                                <div>
                                    <div className="text-sm font-medium mb-1">ERC20 tokens (queried)</div>
                                    {bscTokens.length === 0 ? <div className="text-sm text-gray-500">No token queries run</div> : (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr><th className="text-left">Contract</th><th className="text-left">Symbol</th><th className="text-left">Amount</th></tr>
                                            </thead>
                                            <tbody>
                                                {bscTokens.map((t, i) => (
                                                    <tr key={i}><td className="py-1 text-xs break-words">{t.address}</td><td className="py-1">{t.symbol}</td><td className="py-1">{t.amount}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <h3 className="font-medium">Log</h3>
                    <pre className="text-xs bg-gray-50 p-3 rounded h-40 overflow-auto whitespace-pre-wrap">{log.join("\n")}</pre>
                </div>
            </div>
        </div>
    );
}
