// One-time copy of localStorage entries saved under the old "arclytics" prefix
// to the "pulsarc" prefix. Imported first in main.tsx so it runs before any hook reads storage.
try {
  const old: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('arclytics')) old.push(k)
  }
  for (const k of old) {
    const next = 'pulsarc' + k.slice('arclytics'.length)
    if (localStorage.getItem(next) === null) {
      const v = localStorage.getItem(k)
      if (v !== null) localStorage.setItem(next, v)
    }
    localStorage.removeItem(k)
  }
} catch {
  // storage unavailable: nothing to migrate
}
