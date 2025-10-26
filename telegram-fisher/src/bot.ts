import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  rpcUrl: process.env.SEPOLIA_RPC_URL!,
  executorPrivateKey: process.env.EXECUTOR_PRIVATE_KEY!,
  socialPayContract: process.env.SOCIALPAY_CONTRACT!,
  executorAddress: process.env.EXECUTOR_ADDRESS!,
  platform: 'telegram',
};

const abiPath = join(__dirname, 'abi', 'SocialPayEVVM.json');
const contractABI = JSON.parse(readFileSync(abiPath, 'utf8'));

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const executorWallet = new ethers.Wallet(config.executorPrivateKey, provider);
const socialPayContract = new ethers.Contract(
  config.socialPayContract,
  contractABI,
  executorWallet
);

interface PendingPayment {
  from: string;
  fromUsername: string;
  fromUserId: number;
  to: string;
  amount: string;
  timestamp: number;
}

const userWallets = new Map<number, string>();
const pendingPayments = new Map<number, PendingPayment>();

function callAPI(method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${config.botToken}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendMessage(chatId: number, text: string) {
  await callAPI('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

function extractUsername(text: string): string | null {
  const match = text.match(/@(\w+)/);
  return match ? match[1] : null;
}

function extractAmount(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function formatPYUSD(amount: string): bigint {
  return ethers.parseUnits(amount, 6);
}

async function getHandleInfo(handle: string) {
  try {
    const [isClaimed, wallet] = await socialPayContract.isHandleClaimed(handle, config.platform);
    const pendingBalance = await socialPayContract.getPendingBalance(handle, config.platform);
    return {
      isClaimed,
      wallet,
      pendingBalance: ethers.formatUnits(pendingBalance, 6),
    };
  } catch (error) {
    console.error('Error getting handle info:', error);
    return null;
  }
}

async function generatePaymentSignature(
  handle: string,
  amount: bigint,
  asyncNonce: bigint,
  deadline: bigint
): Promise<string> {
  const domainSeparator = await socialPayContract.getDomainSeparator();
  
  const PAYMENT_INTENT_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes('PaymentIntent(string handle,string platform,uint256 amount,uint256 asyncNonce,uint256 deadline)')
  );

  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256'],
      [
        PAYMENT_INTENT_TYPEHASH,
        ethers.keccak256(ethers.toUtf8Bytes(handle)),
        ethers.keccak256(ethers.toUtf8Bytes(config.platform)),
        amount,
        asyncNonce,
        deadline,
      ]
    )
  );

  const digest = ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'bytes32', 'bytes32'],
      ['\x19\x01', domainSeparator, structHash]
    )
  );

  const signingKey = new ethers.SigningKey(config.executorPrivateKey);
  const signature = signingKey.sign(digest);
  
  const sig = ethers.solidityPacked(
    ['bytes32', 'bytes32', 'uint8'],
    [signature.r, signature.s, signature.v]
  );

  return sig;
}

async function handleCommand(chatId: number, userId: number, username: string | undefined, text: string) {
  const command = text.split(' ')[0];
  
  if (command === '/start') {
    await sendMessage(chatId,
      '<b>🎉 Welcome to SocialPay EVVM!</b>\n\n' +
      '💰 Send PYUSD to anyone on Telegram using @username\n' +
      '⚡ Powered by EVVM Protocol\n\n' +
      '<b>Commands:</b>\n' +
      '/wallet - Set your wallet address\n' +
      '/pay @username amount - Send PYUSD\n' +
      '/balance - Check your balance\n' +
      '/claim - Claim pending payments\n' +
      '/help - Show help\n\n' +
      '<b>Example:</b> /pay @alice 10'
    );
  }
  else if (command === '/wallet') {
    const walletAddress = text.split(' ')[1];
    
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      await sendMessage(chatId,
        '❌ <b>Invalid wallet address</b>\n\n' +
        'Usage: /wallet 0x...\n\n' +
        'Example:\n' +
        '/wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      );
      return;
    }
    
    userWallets.set(userId, walletAddress);
    await sendMessage(chatId,
      '✅ <b>Wallet Address Saved!</b>\n\n' +
      `Address: <code>${walletAddress}</code>\n\n` +
      'You can now send signature-based payments!\n' +
      'Note: You still need PYUSD and ETH in this wallet.'
    );
  }
  else if (command === '/help') {
    await sendMessage(chatId,
      '<b>📖 SocialPay EVVM Help</b>\n\n' +
      '<b>Set Wallet:</b>\n' +
      '  /wallet 0x...\n' +
      '  Save your wallet for payments\n\n' +
      '<b>Send Payment:</b>\n' +
      '  /pay @username amount\n' +
      '  Example: /pay @bob 50\n\n' +
      '<b>Check Balance:</b>\n' +
      '  /balance\n' +
      '  Shows your unclaimed payments\n\n' +
      '<b>Claim Payments:</b>\n' +
      '  /claim\n' +
      '  Visit webapp to claim PYUSD\n\n' +
      '<b>Check Someone:</b>\n' +
      '  /check @username\n\n' +
      '⚡ All payments use EVVM signatures\n' +
      '🔒 Non-custodial & secure\n' +
      '🌐 Deployed on Ethereum Sepolia'
    );
  }
  else if (command === '/balance') {
    if (!username) {
      await sendMessage(chatId, '❌ You need a Telegram username. Set one in Settings → Username');
      return;
    }
    
    await sendMessage(chatId, '🔍 Checking balance...');
    
    const info = await getHandleInfo(username);
    if (!info) {
      await sendMessage(chatId, '❌ Error fetching balance');
      return;
    }
    
    await sendMessage(chatId,
      `<b>💰 Your Balance</b>\n\n` +
      `Handle: @${username}\n` +
      `Status: ${info.isClaimed ? '✅ Claimed' : '⏳ Unclaimed'}\n` +
      `Pending: <b>${info.pendingBalance} PYUSD</b>\n` +
      (info.isClaimed ? `\nWallet: <code>${info.wallet.slice(0, 6)}...${info.wallet.slice(-4)}</code>` : '') +
      (!info.isClaimed && parseFloat(info.pendingBalance) > 0 
        ? '\n\n💡 Use /claim to visit webapp and receive PYUSD' 
        : '')
    );
  }
  else if (command === '/check') {
    const target = extractUsername(text);
    if (!target) {
      await sendMessage(chatId, '❌ Usage: /check @username');
      return;
    }
    
    await sendMessage(chatId, '🔍 Checking...');
    
    const info = await getHandleInfo(target);
    if (!info) {
      await sendMessage(chatId, '❌ Error fetching info');
      return;
    }
    
    await sendMessage(chatId,
      `<b>👤 User Info</b>\n\n` +
      `Handle: @${target}\n` +
      `Status: ${info.isClaimed ? '✅ Claimed' : '⏳ Unclaimed'}\n` +
      `Pending: <b>${info.pendingBalance} PYUSD</b>`
    );
  }
  else if (command === '/pay') {
    if (!username) {
      await sendMessage(chatId, '❌ You need a Telegram username to use SocialPay');
      return;
    }
    
    const userWallet = userWallets.get(userId);
    if (!userWallet) {
      await sendMessage(chatId,
        '❌ <b>Wallet Not Set!</b>\n\n' +
        'First, set your wallet address:\n' +
        '/wallet 0x...\n\n' +
        'This enables signature-based payments'
      );
      return;
    }
    
    const recipient = extractUsername(text);
    const amount = extractAmount(text);
    
    if (!recipient || !amount) {
      await sendMessage(chatId,
        '❌ <b>Invalid format</b>\n\n' +
        'Usage: /pay @username amount\n' +
        'Example: /pay @bob 50'
      );
      return;
    }
    
    if (recipient === username) {
      await sendMessage(chatId, '❌ You cannot send money to yourself');
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      await sendMessage(chatId, '❌ Amount must be a positive number');
      return;
    }
    
    pendingPayments.set(userId, {
      from: userWallet,
      fromUsername: username,
      fromUserId: userId,
      to: recipient,
      amount: amount,
      timestamp: Date.now(),
    });
    
    await sendMessage(chatId,
      `<b>💳 Payment Request</b>\n\n` +
      `From: @${username}\n` +
      `To: @${recipient}\n` +
      `Amount: <b>${amount} PYUSD</b>\n\n` +
      `Your Wallet: <code>${userWallet.slice(0, 6)}...${userWallet.slice(-4)}</code>\n\n` +
      `⚡ Uses EVVM signature\n` +
      `🔒 Secure & non-custodial\n\n` +
      `Click /confirm to execute\n` +
      `Click /cancel to abort\n\n` +
      `⏰ Expires in 5 minutes`
    );
  }
  else if (command === '/confirm') {
    const pending = pendingPayments.get(userId);
    if (!pending) {
      await sendMessage(chatId, '❌ No pending payment. Use /pay @username amount first');
      return;
    }
    
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
      pendingPayments.delete(userId);
      await sendMessage(chatId, '❌ Payment expired. Please start over with /pay');
      return;
    }
    
    await sendMessage(chatId, '⏳ <b>Processing payment...</b>\n\nGenerating EVVM signature...');
    
    try {
      const recipientInfo = await getHandleInfo(pending.to);
      
      if (recipientInfo) {
        await sendMessage(chatId,
          recipientInfo.isClaimed
            ? `✅ @${pending.to} has a linked wallet. Direct transfer.`
            : `⏳ @${pending.to} not claimed yet. Payment will be held until claim.`
        );
      }
      
      const amountWei = formatPYUSD(pending.amount);
      const asyncNonce = BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      
      console.log('Payment Details:', {
        handle: pending.to,
        amount: amountWei.toString(),
        nonce: asyncNonce.toString(),
        deadline: deadline.toString()
      });
      
      const signature = await generatePaymentSignature(
        pending.to,
        amountWei,
        asyncNonce,
        deadline
      );
      
      await sendMessage(chatId, '✅ Signature generated!\n\n⏳ Submitting to EVVM...');
      
      const tx = await socialPayContract.payToHandleWithSignature(
        pending.to,
        config.platform,
        amountWei,
        asyncNonce,
        deadline,
        signature
      );
      
      await sendMessage(chatId, `📡 Transaction submitted!\n\nHash: <code>${tx.hash}</code>\n\n⏳ Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        pendingPayments.delete(userId);
        
        await sendMessage(chatId,
          `<b>✅ Payment Successful!</b>\n\n` +
          `${pending.amount} PYUSD sent to @${pending.to}\n\n` +
          `TX: <code>${receipt.hash}</code>\n\n` +
          `⚡ Processed via EVVM Core\n` +
          `🔒 Nonce verified on-chain\n\n` +
          (recipientInfo?.isClaimed
            ? `✅ @${pending.to} received it directly`
            : `📬 @${pending.to} will be notified to claim`)
        );
      } else {
        await sendMessage(chatId, '❌ Transaction failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      await sendMessage(chatId,
        '❌ <b>Payment failed</b>\n\n' +
        `Error: ${error.reason || error.message}\n\n` +
        '<b>Checklist:</b>\n' +
        '• Do you have enough PYUSD?\n' +
        '• Have you approved the contract?\n' +
        '• Do you have Sepolia ETH for gas?\n\n' +
        `Contract: <code>${config.socialPayContract}</code>`
      );
    }
  }
  else if (command === '/cancel') {
    if (pendingPayments.has(userId)) {
      pendingPayments.delete(userId);
      await sendMessage(chatId, '✅ Payment cancelled');
    } else {
      await sendMessage(chatId, '❌ No pending payment to cancel');
    }
  }
  else if (command === '/claim') {
    if (!username) {
      await sendMessage(chatId, '❌ You need a Telegram username to claim');
      return;
    }
    
    const info = await getHandleInfo(username);
    if (!info || parseFloat(info.pendingBalance) === 0) {
      await sendMessage(chatId, '❌ No pending balance to claim');
      return;
    }
    
    await sendMessage(chatId,
      `<b>💰 Claim Your PYUSD</b>\n\n` +
      `Pending: <b>${info.pendingBalance} PYUSD</b>\n\n` +
      `<b>Steps to Claim:</b>\n` +
      `1. Visit the claim portal\n` +
      `2. Connect your wallet\n` +
      `3. Enter handle: @${username}\n` +
      `4. Sign & claim funds\n\n` +
      `🌐 <b>Claim Portal:</b>\n` +
      `http://localhost:3000\n\n` +
      `Contract: <code>${config.socialPayContract}</code>\n` +
      `Platform: telegram`
    );
  }
}

let offset = 0;

async function poll() {
  try {
    const response = await callAPI('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message']
    });

    if (response.ok && response.result.length > 0) {
      for (const update of response.result) {
        if (update.message && update.message.text) {
          const msg = update.message;
          const chatId = msg.chat.id;
          const userId = msg.from.id;
          const username = msg.from.username;
          const text = msg.text;
          
          console.log(`[@${username || 'unknown'}]: ${text}`);
          
          await handleCommand(chatId, userId, username, text);
        }
        
        offset = update.update_id + 1;
      }
    }
  } catch (error: any) {
    console.error('Poll error:', error.message);
  }
  
  setTimeout(poll, 1000);
}

console.log('🚀 Starting SocialPay EVVM Fisher Bot...');
console.log('📝 Contract:', config.socialPayContract);
console.log('⚡ Executor:', config.executorAddress);
console.log('🌐 Platform:', config.platform);
console.log('✅ Bot is running with EVVM integration!');
console.log('📱 Send /start in Telegram\n');

poll();