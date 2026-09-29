// Prints how many times each release's DMG has been downloaded from GitHub.
const response = await fetch('https://api.github.com/repos/Adrish7/Knot/releases', {
  headers: { Accept: 'application/vnd.github+json' },
})
if (!response.ok) {
  console.error(`GitHub returned ${response.status} ${response.statusText}`)
  process.exit(1)
}

let total = 0
for (const release of await response.json()) {
  const count = release.assets.reduce((sum, asset) => sum + asset.download_count, 0)
  total += count
  console.log(`${release.tag_name.padEnd(10)} ${String(count).padStart(6)}  (${release.published_at.slice(0, 10)})`)
}
console.log(`${'Total'.padEnd(10)} ${String(total).padStart(6)}`)
