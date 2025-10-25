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
  to: string;
  amount: string;
  timestamp: number;
}

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
  await callAPI('sendMessage', { chat_id: chatId, text });
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

async function handleCommand(chatId: number, userId: number, username: string | undefined, text: string) {
  const command = text.split(' ')[0];
  
  if (command === '/start') {
    await sendMessage(chatId,
      'Welcome to SocialPay!\n\n' +
      'Send PYUSD to anyone on Telegram using their @username\n\n' +
      'Commands:\n' +
      '/pay @username amount - Send PYUSD\n' +
      '/balance - Check your balance\n' +
      '/claim - Claim pending payments\n' +
      '/help - Show help\n\n' +
      'Example: /pay @alice 10'
    );
  }
  else if (command === '/help') {
    await sendMessage(chatId,
      'SocialPay Help\n\n' +
      'Send Payment:\n' +
      '  /pay @username amount\n' +
      '  Example: /pay @bob 50\n\n' +
      'Check Balance:\n' +
      '  /balance\n' +
      '  Shows your unclaimed payments\n\n' +
      'Claim Payments:\n' +
      '  /claim\n' +
      '  Links your wallet and claims PYUSD\n\n' +
      'Check Someone:\n' +
      '  /check @username\n' +
      '  See if they claimed their handle\n\n' +
      'All amounts in PYUSD\n' +
      'Gas fees paid by fisher\n' +
      'Secured by Ethereum'
    );
  }
  else if (command === '/balance') {
    if (!username) {
      await sendMessage(chatId, 'You need a Telegram username. Set one in Settings → Username');
      return;
    }
    
    await sendMessage(chatId, 'Checking balance...');
    
    const info = await getHandleInfo(username);
    if (!info) {
      await sendMessage(chatId, 'Error fetching balance');
      return;
    }
    
    await sendMessage(chatId,
      `Your Balance\n\n` +
      `Handle: @${username}\n` +
      `Status: ${info.isClaimed ? 'Claimed' : 'Unclaimed'}\n` +
      `Pending: ${info.pendingBalance} PYUSD\n` +
      (info.isClaimed ? `\nWallet: ${info.wallet.slice(0, 6)}...${info.wallet.slice(-4)}` : '') +
      (!info.isClaimed && parseFloat(info.pendingBalance) > 0 
        ? '\n\nUse /claim to link your wallet and receive PYUSD' 
        : '')
    );
  }
  else if (command === '/check') {
    const target = extractUsername(text);
    if (!target) {
      await sendMessage(chatId, 'Usage: /check @username');
      return;
    }
    
    await sendMessage(chatId, 'Checking...');
    
    const info = await getHandleInfo(target);
    if (!info) {
      await sendMessage(chatId, 'Error fetching info');
      return;
    }
    
    await sendMessage(chatId,
      `User Info\n\n` +
      `Handle: @${target}\n` +
      `Status: ${info.isClaimed ? 'Claimed' : 'Unclaimed'}\n` +
      `Pending: ${info.pendingBalance} PYUSD`
    );
  }
  else if (command === '/pay') {
    if (!username) {
      await sendMessage(chatId, 'You need a Telegram username to use SocialPay');
      return;
    }
    
    const recipient = extractUsername(text);
    const amount = extractAmount(text);
    
    if (!recipient || !amount) {
      await sendMessage(chatId,
        'Invalid format\n\n' +
        'Usage: /pay @username amount\n' +
        'Example: /pay @bob 50'
      );
      return;
    }
    
    if (recipient === username) {
      await sendMessage(chatId, 'You cannot send money to yourself');
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      await sendMessage(chatId, 'Amount must be a positive number');
      return;
    }
    
    pendingPayments.set(userId, {
      from: userId.toString(),
      fromUsername: username,
      to: recipient,
      amount: amount,
      timestamp: Date.now(),
    });
    
    await sendMessage(chatId,
      `Payment Request\n\n` +
      `From: @${username}\n` +
      `To: @${recipient}\n` +
      `Amount: ${amount} PYUSD\n\n` +
      `Click /confirm to execute\n` +
      `Click /cancel to abort\n\n` +
      `Expires in 5 minutes`
    );
  }
  else if (command === '/confirm') {
    const pending = pendingPayments.get(userId);
    if (!pending) {
      await sendMessage(chatId, 'No pending payment. Use /pay @username amount first');
      return;
    }
    
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
      pendingPayments.delete(userId);
      await sendMessage(chatId, 'Payment expired. Please start over with /pay');
      return;
    }
    
    await sendMessage(chatId, 'Processing payment...');
    
    try {
      const recipientInfo = await getHandleInfo(pending.to);
      
      if (recipientInfo) {
        await sendMessage(chatId,
          recipientInfo.isClaimed
            ? `@${pending.to} has a linked wallet. Direct transfer.`
            : `@${pending.to} not claimed yet. Payment held until claim.`
        );
      }
      
      const amountWei = formatPYUSD(pending.amount);
      
      console.log('Executing payment:', {
        handle: pending.to,
        amount: amountWei.toString(),
      });
      
      const tx = await socialPayContract.payToHandle(
        pending.to,
        config.platform,
        amountWei,
        config.executorAddress
      );
      
      await sendMessage(chatId, `Transaction submitted: ${tx.hash}`);
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        pendingPayments.delete(userId);
        
        await sendMessage(chatId,
          `Payment Successful!\n\n` +
          `${pending.amount} PYUSD sent to @${pending.to}\n` +
          `TX: ${receipt.hash}\n\n` +
          (recipientInfo?.isClaimed
            ? `@${pending.to} received it directly`
            : `@${pending.to} will be notified to claim`)
        );
      } else {
        await sendMessage(chatId, 'Transaction failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      await sendMessage(chatId,
        `Payment failed: ${error.message}\n\n` +
        'Check:\n' +
        '- You have enough PYUSD\n' +
        '- Contract is approved\n' +
        '- You have Sepolia ETH for gas'
      );
    }
  }
  else if (command === '/cancel') {
    if (pendingPayments.has(userId)) {
      pendingPayments.delete(userId);
      await sendMessage(chatId, 'Payment cancelled');
    } else {
      await sendMessage(chatId, 'No pending payment to cancel');
    }
  }
  else if (command === '/claim') {
    if (!username) {
      await sendMessage(chatId, 'You need a Telegram username to claim');
      return;
    }
    
    await sendMessage(chatId,
      `To claim your pending PYUSD:\n\n` +
      `1. Visit Etherscan\n` +
      `2. Connect wallet\n` +
      `3. Call claimPending()\n` +
      `4. Your handle will be linked\n\n` +
      `Contract: ${config.socialPayContract}\n` +
      `Handle: ${username}\n` +
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

console.log('Starting SocialPay Fisher Bot...');
console.log('Contract:', config.socialPayContract);
console.log('Executor:', config.executorAddress);

callAPI('getMe').then((result) => {
  if (result.ok) {
    console.log('Bot:', result.result.username);
    console.log('Bot is running!');
    console.log('Send /start in Telegram\n');
    poll();
  }
}).catch(console.error);