export interface PaymentIntent {
    handle: string;
    platform: string;
    amount: bigint;
    asyncNonce: bigint;
    deadline: bigint;
}
export declare class SignatureGenerator {
    private wallet;
    private contractAddress;
    private chainId;
    constructor(privateKey: string, contractAddress: string, chainId?: number);
    signPaymentIntent(intent: PaymentIntent): Promise<string>;
    generateNonce(): bigint;
    generateDeadline(minutesFromNow?: number): bigint;
    getSignerAddress(): string;
}
//# sourceMappingURL=signature.d.ts.map