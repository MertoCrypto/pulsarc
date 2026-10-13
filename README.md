# Pulsarc

The pulse of the Arc network. Pulsarc ranks the apps building on [Arc](https://arc.io) by verified on-chain activity — transactions, active wallets and USDC moved — and reads every figure straight from the chain, the ArcScan explorer, and the Pulsarc indexer.

*Pulsar + Arc: a pulsar is a star that beats with perfect regularity; Pulsarc reads the same steady beat from the network, block by block.*

## What it does

- **App rankings** with 1h / 24h windows, a transparent health score and rank movement
- **Network** view for Arc Testnet and Mainnet: real TPS, block time, fee market, bridge and memo flows
- **Tokens, NFTs, agents and wallets** with human-readable activity
- **Compare** apps side by side and follow category trends
- Wallet tools: add Arc to your wallet, say GM, upvote and attest apps on-chain

Numbers that are extrapolated from sampled activity are marked (≈ for counts, ≥ for wallets); nothing is mocked.

## Stack

React 18, TypeScript, Vite, Tailwind, viem and wagmi, TanStack Query, Recharts, Framer Motion and GSAP.

## Live sites

| Build | URL |
| --- | --- |
| Mainnet (production) | https://pulsarc.vercel.app |
| Testnet | https://pulsarc-testnet.vercel.app |

Both are deployed from the same repo; the mainnet build is built with `VITE_ARC_NETWORK=mainnet`.

## Run it locally

```bash
npm install --legacy-peer-deps
npm run dev
```

`npm run dev` starts on Arc Testnet (the default when `VITE_ARC_NETWORK` is unset); set `VITE_ARC_NETWORK=mainnet` to run the Arc Mainnet build locally (what production serves).

## Checks

```bash
npm test            # plain-node tests: ~75 files, no framework, no network
npm run typecheck
npm run build
forge test          # contract tests (TipJar, GmBoard); needs Foundry installed
```

`npm test` also runs drift guards that fail when a rule is broken by a later change: every page keeps its own title and a single main heading, links and buttons keep accessible names, external links carry `rel="noreferrer"`, data requests go through the timeout helper, browser storage is only touched inside `try`, external hosts must be on a reviewed allowlist, banned wording (TVL, airdrop) stays out, and the independent-project disclaimer stays in place. CI runs the same tests and the build on every push.

## Data sources

| Source | Used for |
| --- | --- |
| Arc RPC (testnet and mainnet) | blocks, throughput, fees, live reads |
| ArcScan (Blockscout v2, testnet) | transfers, holders, contracts |
| [Pulsarc indexer snapshots](https://github.com/MertoCrypto/pulsarc-indexer) (mainnet) | app rankings, history, wallets, token and NFT catalogue |

ArcScan is used on testnet only; its API blocks browser requests on mainnet. Mainnet figures come from the Arc RPC and the Pulsarc indexer snapshots (`data` branch of the repo above).

## Roadmap

More mainnet history as the indexer's retention grows (30-day and all-time rankings), and the platform contracts (voting, attestations, boosts) on mainnet.

## License

MIT
