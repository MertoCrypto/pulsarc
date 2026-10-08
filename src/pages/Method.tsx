import { Reveal } from '@/components/shared/Reveal'
import { SplitLines } from '@/components/shared/SplitLines'

const SOURCES = [
  ['Arc RPC', 'Block numbers, throughput, fees and live reads. Testnet and mainnet are both open, so these numbers are exact.'],
  ['ArcScan', 'Token transfers, holders and contract activity on testnet, through the public Blockscout API.'],
  ['Pulsarc indexer', 'Our own block reader for mainnet. It keeps hourly totals only — never raw transactions — and publishes them as a small JSON file the site reads.'],
]

const MARKS = [
  ['No mark', 'Counted in full over the window shown.'],
  ['≈ before a count', 'Extrapolated. The app is busy enough that only its newest activity was read, and the rest is estimated from that sample.'],
  ['≥ before wallets', 'A lower bound. At least this many different wallets were seen in the sample.'],
]

const SCORE = [
  ['Activity', '0–40', 'How much the app is used. Grows with the logarithm of transactions, so a 10× busier app is not 10× better.'],
  ['Breadth', '0–30', 'Many different wallets rather than a few repeating. Wallets divided by transactions.'],
  ['Consistency', '0–30', 'Share of time slices in the window with any activity. Rewards steady use over a single burst.'],
]

function Block({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="arc-eyebrow mb-3">{eyebrow}</p>
      <h2 className="mb-6 text-[clamp(26px,3.2vw,38px)] font-light leading-[1.1] tracking-tight text-white">{title}</h2>
      {children}
    </section>
  )
}

function Table({ rows, cols }: { rows: string[][]; cols: string }) {
  return (
    <div className="arc-card overflow-hidden">
      {rows.map(r => (
        <div key={r[0]} className={`grid gap-x-6 gap-y-1 border-b border-[var(--line)] px-5 py-4 last:border-0 ${cols}`}>
          <span className="text-[15px] text-white">{r[0]}</span>
          {r.slice(1).map((c, i) => (
            <span key={i} className={`text-[15px] leading-relaxed ${i === r.length - 2 ? 'text-[var(--muted)]' : 'tabular-nums text-[var(--periwinkle)]'}`}>{c}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

export function Method() {
  return (
    <div className="mx-auto max-w-[860px] space-y-16 pt-4">
      <Reveal>
        <p className="arc-eyebrow mb-6">Method</p>
        <SplitLines
          as="h1"
          className="arc-display text-[clamp(36px,5vw,64px)] text-white"
          lines={[{ text: 'How every number' }, { text: 'is made.', className: 'text-[var(--periwinkle)]' }]}
        />
        <p className="mt-6 max-w-[620px] text-[19px] font-light leading-relaxed text-[var(--muted)]">
          Pulsarc reads the chain; it does not take anyone's word for it. This page explains where figures come from, what is estimated and how scores are built, so you can check our work.
        </p>
      </Reveal>

      <Reveal>
        <Block eyebrow="Sources" title="Where the data comes from">
          <Table rows={SOURCES} cols="sm:grid-cols-[170px_1fr]" />
        </Block>
      </Reveal>

      <Reveal>
        <Block eyebrow="Measuring apps" title="Real contracts, not self-reported stats">
          <div className="arc-card space-y-4 p-6 text-[16px] font-light leading-relaxed text-[var(--muted)]">
            <p>Every app is tied to the contracts it actually runs on. Apps that move tokens — pools, vaults, stablecoins — are measured by transfers of that token. Infrastructure and contract-call apps are measured by transactions sent to the contract.</p>
            <p>Dollars moved only counts USDC-denominated transfers. Wallets that have sent 10,000 or more transactions in their lifetime are treated as automated and are called out where they dominate an app's numbers.</p>
          </div>
        </Block>
      </Reveal>

      <Reveal>
        <Block eyebrow="Honesty marks" title="What we estimate, and how we say so">
          <Table rows={MARKS} cols="sm:grid-cols-[170px_1fr]" />
        </Block>
      </Reveal>

      <Reveal>
        <Block eyebrow="Health score" title="One score, three visible signals">
          <Table rows={SCORE} cols="sm:grid-cols-[150px_80px_1fr]" />
          <p className="mt-4 text-sm leading-relaxed text-[var(--faint)]">
            The score is the sum of the three parts, rounded. 70 and above reads as Strong, 40 and above as Steady, anything lower as Quiet. It describes use, not quality, and says nothing about whether an app is safe.
          </p>
        </Block>
      </Reveal>

      <Reveal>
        <Block eyebrow="Mainnet" title="Why mainnet is read differently">
          <div className="arc-card space-y-4 p-6 text-[16px] font-light leading-relaxed text-[var(--muted)]">
            <p>The mainnet explorer API sits behind a bot check, so a browser cannot read it directly. Network figures on mainnet come straight from the open RPC. Contract rankings come from Pulsarc's own indexer, which reads every block every few minutes, so mainnet data runs roughly 5–10 minutes behind the chain.</p>
            <p>The indexer is open source. It stores hourly totals only, and the site shows how stale a figure is whenever it matters.</p>
          </div>
        </Block>
      </Reveal>
    </div>
  )
}
