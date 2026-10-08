/**
 * Where tips are sent. Set VITE_TIP_ADDRESS to a wallet you control before a mainnet launch;
 * the default is the testnet treasury, whose tips carry no real value.
 */
export const TIP_ADDRESS = (import.meta.env.VITE_TIP_ADDRESS ?? '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42') as `0x${string}`
