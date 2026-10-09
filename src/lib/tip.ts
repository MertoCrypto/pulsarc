/**
 * Where tips are sent. USDC is transferred to the TipJar contract on Arc Testnet;
 * the owner can withdraw via withdraw() / withdrawAll().
 * Override with VITE_TIP_ADDRESS to point at a different address (e.g. a mainnet TipJar).
 * Default: TipJar deployed on Arc Testnet at 0xded06734606b526fe0075b64cd996b1cfa47fe3e
 */
export const TIP_ADDRESS = (import.meta.env.VITE_TIP_ADDRESS ?? '0xded06734606b526fe0075b64cd996b1cfa47fe3e') as `0x${string}`
