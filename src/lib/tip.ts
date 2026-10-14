/**
 * Where tips are sent. USDC is transferred to the TipJar contract.
 *
 * Testnet (5042002): defaults to the deployed Arc Testnet TipJar; override with VITE_TIP_ADDRESS.
 * Mainnet (5042):    ONLY a valid VITE_TIP_ADDRESS override is accepted — null otherwise.
 *                    The testnet address is NEVER used as a mainnet fallback.
 *
 * Consumers must check `TIP_ADDRESS !== null` before any send or contract call.
 * See src/lib/tipAddress.ts for the full routing logic and tests.
 */
import { CHAIN_ID } from '@/lib/chain'
import { tipAddressFor } from '@/lib/tipAddress'

export const TIP_ADDRESS = tipAddressFor(
  CHAIN_ID,
  (import.meta.env.VITE_TIP_ADDRESS as string | undefined),
)
