import { Wallet } from "ethers";

// Helper script to generate key/addresses for testing. Do NOT use in production, only
// or ad-hoc testing.

for (let i = 0; i < 10; ++i) {
    var wallet = Wallet.createRandom()
    console.log("Address:  " + wallet.address);
    console.log("Public: " + wallet.publicKey)
    console.log("Private: " + wallet.privateKey)
    console.log()
}
