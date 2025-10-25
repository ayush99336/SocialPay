'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWalletClient } from 'wagmi';
import { useState } from 'react';
import { ethers } from 'ethers';

const OLD_CONTRACT = process.env.NEXT_PUBLIC_OLD_CONTRACT || '0x5922ED4eaE4DB949A340ca85915f9ca51B7b3061';
const NEW_CONTRACT = process.env.NEXT_PUBLIC_NEW_CONTRACT || '0x287aDef130Eb012f43A57B2F074f57c2e63B1dcB';
const PLATFORM = 'telegram';
const RPC_URL = 'https://sepolia.infura.io/v3/3d984fad03ca492bbd6f974f9f1c4301';

const CONTRACT_ABI = [
  'function getPendingBalance(string memory handle, string memory platform) external view returns (uint256)',
  'function isHandleClaimed(string memory handle, string memory platform) external view returns (bool, address)',
  'function claimPending(string memory handle, string memory platform, bytes memory proof) external',
  'function adminClaim(string memory handle, string memory platform, address wallet) external',
];

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [oldBalance, setOldBalance] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkBalance = async () => {
    if (!handle) {
      setError('Please enter your Telegram handle');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      
      // Check old contract
      const oldContract = new ethers.Contract(OLD_CONTRACT, CONTRACT_ABI, provider);
      const oldBal = await oldContract.getPendingBalance(handle, PLATFORM);
      const oldBalFormatted = ethers.formatUnits(oldBal, 6);
      setOldBalance(oldBalFormatted);
      
      // Check new contract
      const newContract = new ethers.Contract(NEW_CONTRACT, CONTRACT_ABI, provider);
      const newBal = await newContract.getPendingBalance(handle, PLATFORM);
      const newBalFormatted = ethers.formatUnits(newBal, 6);
      setNewBalance(newBalFormatted);
      
      const [isClaimed] = await newContract.isHandleClaimed(handle, PLATFORM);
      setClaimed(isClaimed);
      
      const totalBalance = parseFloat(oldBalFormatted) + parseFloat(newBalFormatted);
      
      if (totalBalance === 0) {
        setError('No pending balance found for this handle');
      }
    } catch (err: any) {
      console.error('Balance check error:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const claimFunds = async () => {
    if (!isConnected || !address || !walletClient) {
      setError('Please connect your wallet');
      return;
    }

    if (!handle) {
      setError('Please enter your handle');
      return;
    }

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const provider = new ethers.BrowserProvider(walletClient as any);
      const signer = await provider.getSigner();

      // Generate proof: sign "SocialPay Claim: {handle} on {platform} for {address}"
      const message = `SocialPay Claim: ${handle} on ${PLATFORM} for ${address.toLowerCase()}`;
      
      console.log('Signing message:', message);
      const signature = await signer.signMessage(message);
      console.log('Signature:', signature);

      // Try claiming from old contract first
      if (oldBalance && parseFloat(oldBalance) > 0) {
        console.log('Claiming from old contract...');
        const oldContract = new ethers.Contract(OLD_CONTRACT, CONTRACT_ABI, signer);
        
        try {
          const tx = await oldContract.claimPending(handle, PLATFORM, signature);
          setTxHash(tx.hash);
          console.log('Old contract claim TX:', tx.hash);
          await tx.wait();
          setOldBalance('0');
          alert('✅ Claimed from old contract successfully!');
        } catch (err: any) {
          console.error('Old contract claim failed:', err);
        }
      }

      // Try claiming from new contract
      if (newBalance && parseFloat(newBalance) > 0) {
        console.log('Claiming from new contract...');
        const newContract = new ethers.Contract(NEW_CONTRACT, CONTRACT_ABI, signer);
        
        try {
          const tx = await newContract.claimPending(handle, PLATFORM, signature);
          setTxHash(tx.hash);
          console.log('New contract claim TX:', tx.hash);
          await tx.wait();
          setNewBalance('0');
          alert('✅ Claimed from new contract successfully!');
        } catch (err: any) {
          console.error('New contract claim failed:', err);
        }
      }

      // Refresh balance
      await checkBalance();
      setClaimed(true);
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(`Claim failed: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalBalance = (parseFloat(oldBalance || '0') + parseFloat(newBalance || '0')).toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-3">
              SocialPay Claim Portal
            </h1>
            <p className="text-gray-600 text-lg">
              Claim your PYUSD sent via Telegram @handle
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
            {/* Wallet Connection */}
            <div className="mb-6 flex justify-center">
              <ConnectButton />
            </div>

            {/* Input Section */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Your Telegram Handle
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-gray-400 text-lg">@</span>
                  <input
                    type="text"
                    placeholder="username"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.replace('@', ''))}
                    className="w-full pl-9 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-lg"
                  />
                </div>
              </div>

              {/* Check Balance Button */}
              <button
                onClick={checkBalance}
                disabled={loading || !handle}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {loading ? '🔍 Checking...' : '🔍 Check Balance'}
              </button>

              {/* Balance Display */}
              {(oldBalance !== null || newBalance !== null) && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6">
                  <p className="text-sm text-gray-600 mb-2">Total Pending Balance</p>
                  <p className="text-5xl font-bold text-green-600 mb-4">{totalBalance} PYUSD</p>
                  
                  {parseFloat(oldBalance || '0') > 0 && (
                    <p className="text-sm text-gray-500">
                      📦 Old Contract: {oldBalance} PYUSD
                    </p>
                  )}
                  {parseFloat(newBalance || '0') > 0 && (
                    <p className="text-sm text-gray-500">
                      🆕 New Contract: {newBalance} PYUSD
                    </p>
                  )}
                  
                  {claimed && (
                    <p className="text-sm text-green-600 mt-3 font-semibold">
                      ✅ Handle Status: Claimed
                    </p>
                  )}
                </div>
              )}

              {/* Claim Button */}
              {parseFloat(totalBalance) > 0 && isConnected && (
                <button
                  onClick={claimFunds}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {loading ? '⏳ Claiming...' : '💰 Claim Funds to Wallet'}
                </button>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <p className="text-red-600 text-sm font-medium">❌ {error}</p>
                </div>
              )}

              {/* Transaction Hash */}
              {txHash && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                  <p className="text-sm text-gray-600 mb-2">Transaction Hash:</p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm break-all hover:underline font-mono"
                  >
                    {txHash}
                  </a>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-3">📋 How to Claim:</h3>
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start">
                  <span className="font-bold mr-2">1.</span>
                  <span>Enter your Telegram handle (e.g., @testuser)</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">2.</span>
                  <span>Click "Check Balance" to see pending PYUSD</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">3.</span>
                  <span>Connect your Ethereum wallet (MetaMask, etc.)</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">4.</span>
                  <span>Sign a message to prove you own the handle</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">5.</span>
                  <span>Receive PYUSD directly to your wallet!</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500 space-y-1">
            <p className="font-semibold">⚡ Powered by EVVM Protocol</p>
            <p>🌐 Deployed on Ethereum Sepolia Testnet</p>
            <div className="pt-2 space-y-1 font-mono text-xs">
              <p>Old Contract: {OLD_CONTRACT}</p>
              <p>New Contract: {NEW_CONTRACT}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}