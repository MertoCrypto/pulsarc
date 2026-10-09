import { ConnectKitButton } from 'connectkit'
import { Wallet } from 'lucide-react'
import { PasskeyButton } from './PasskeyButton'

/** The one call to action in the header: periwinkle, with a slow light sweep until a wallet is connected. */
export function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) =>
        isConnected ? (
          <button onClick={show} className="arc-btn-ghost !rounded-xl !px-4 !py-2.5">
            <span className="h-2 w-2 rounded-full bg-[var(--positive)]" />
            <span className="font-['Geist_Mono'] text-[13px]">{ensName ?? truncatedAddress}</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={show} className="arc-btn arc-btn-live whitespace-nowrap !rounded-xl !px-3.5 !py-2.5 !text-[15px] sm:!px-5">
              <Wallet className="h-4 w-4" />
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect Wallet</span>
            </button>
            <PasskeyButton />
          </div>
        )
      }
    </ConnectKitButton.Custom>
  )
}
