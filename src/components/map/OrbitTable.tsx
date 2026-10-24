import { count } from '@/lib/numberFormat'

export interface AppRow { id: string; name: string; category: string; tx: number }

const fmt = (n: number) => n.toLocaleString('en-US')
const TH = 'px-4 py-2 font-normal'

interface Props {
  apps: AppRow[]
  liveCounts: Record<string, number>
}

/** The apps table — readable, accessible alternative to the galaxy canvas. */
export function OrbitTable({ apps, liveCounts }: Props) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[var(--line)]">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <caption className="px-4 py-3 text-left font-['Geist_Mono'] text-[11px] text-[var(--muted)]">Arc orbit — apps</caption>
        <tbody>
          <tr className="border-t border-[var(--line)] text-[var(--faint)]">
            <th scope="col" className={TH}>Category</th>
            <th scope="col" className={TH}>App</th>
            <th scope="col" className={`${TH} text-right`}>24h transactions</th>
            <th scope="col" className={`${TH} text-right`}>Live txs seen</th>
          </tr>
          {apps.map(p => (
            <tr key={p.id} className="border-t border-[var(--line)] text-[var(--text)]">
              <td className="px-4 py-2 text-[var(--muted)]">{p.category}</td>
              <th scope="row" className="px-4 py-2 font-normal">{p.name}</th>
              <td className="px-4 py-2 text-right font-['Geist_Mono']">{count(p.tx)}</td>
              <td className="px-4 py-2 text-right font-['Geist_Mono']">{fmt(liveCounts[p.id] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
