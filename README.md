# Pulsarc

The pulse of the Arc network. Pulsarc ranks the apps building on [Arc](https://arc.io) by verified on-chain activity — transactions, active wallets and USDC moved — and reads every figure straight from the chain and the ArcScan explorer.

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

## Run it locally

```bash
npm install --legacy-peer-deps
npm run dev
```

Set `VITE_ARC_NETWORK=mainnet` to start on Arc Mainnet instead of Testnet.

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

## Roadmap

A free, open indexer (scheduled GitHub Actions plus static snapshots) for exact counts, cohorts and mainnet app rankings.

## License

MIT
