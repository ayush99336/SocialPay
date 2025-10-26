import { ethers } from 'ethers';

export interface PaymentIntent {
  handle: string;
  platform: string;
  amount: bigint;
  asyncNonce: bigint;
  deadline: bigint;
}

export class SignatureGenerator {
  private wallet: ethers.Wallet;
  private contractAddress: string;
  private chainId: number;

  constructor(privateKey: string, contractAddress: string, chainId: number = 11155111) {
    this.wallet = new ethers.Wallet(privateKey);
    this.contractAddress = contractAddress;
    this.chainId = chainId;
  }

  async signPaymentIntent(intent: PaymentIntent): Promise<string> {
    const domain = {
      name: 'SocialPayEVVM',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.contractAddress,
    };

    const types = {
      PaymentIntent: [
        { name: 'handle', type: 'string' },
        { name: 'platform', type: 'string' },
        { name: 'amount', type: 'uint256' },
        { name: 'asyncNonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const value = {
      handle: intent.handle,
      platform: intent.platform,
      amount: intent.amount,
      asyncNonce: intent.asyncNonce,
      deadline: intent.deadline,
    };

    const signature = await this.wallet.signTypedData(domain, types, value);
    return signature;
  }

  generateNonce(): bigint {
    return BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  }

  generateDeadline(minutesFromNow: number = 60): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60);
  }

  getSignerAddress(): string {
    return this.wallet.address;
  }
}
