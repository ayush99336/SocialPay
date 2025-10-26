import { ethers } from 'ethers';
export class SignatureGenerator {
    wallet;
    contractAddress;
    chainId;
    constructor(privateKey, contractAddress, chainId = 11155111) {
        this.wallet = new ethers.Wallet(privateKey);
        this.contractAddress = contractAddress;
        this.chainId = chainId;
    }
    async signPaymentIntent(intent) {
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
    generateNonce() {
        return BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    }
    generateDeadline(minutesFromNow = 60) {
        return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60);
    }
    getSignerAddress() {
        return this.wallet.address;
    }
}
//# sourceMappingURL=signature.js.map