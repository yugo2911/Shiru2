<script>
  import { modal } from '@/modules/navigation.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { X, Search } from 'lucide-svelte'
  import { click } from '@/modules/click.js'
  import { debounce } from '@/modules/util.js'
  import { statusColorMap } from '@/modules/anime/anime.js'
  import { fly, fade } from 'svelte/transition'

  const FORMAT_PRIORITY = { TV: 0, MOVIE: 1, ONA: 2, OVA: 3, SPECIAL: 4, TV_SHORT: 5 }
  const FORMAT_ORDER = ['TV', 'MOVIE', 'ONA', 'OVA', 'SPECIAL', 'TV_SHORT']
  const FORMAT_LABELS = { TV: 'TV Show', MOVIE: 'Movie', TV_SHORT: 'TV Short', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA' }
  const LIST_STATUS_LABELS = { CURRENT: 'Watching', PLANNING: 'Plan to Watch', COMPLETED: 'Completed', PAUSED: 'On Hold', DROPPED: 'Dropped', REPEATING: 'Rewatching' }

  let searchInput, query = '', results = [], loading, selectedIndex = 0, requestId = 0
  let resultEls = []

  const humanize = (str) => str?.replace(/_/g, ' ') || ''

  const formatAirDate = (date) => date?.year || ''

  $: groups = FORMAT_ORDER
    .map(format => ({ format, items: results.filter(media => media.format === format) }))
    .filter(group => group.items.length)

  function close() {
    requestId++
    modal.close(modal.SEARCH)
    query = ''; results = []; selectedIndex = 0; loading = false
  }

  function onSearchInput() {
    if (!query.trim()) {
      requestId++
      results = []
      loading = false
      selectedIndex = 0
    } else {
      loading = true
      debouncedSearch()
    }
  }

  const FORMAT_WORDS = [
    { format: 'TV_SHORT', words: ['tv short'] },
    { format: 'MOVIE', words: ['movie', 'film'] },
    { format: 'TV', words: ['tv'] },
    { format: 'SPECIAL', words: ['special'] },
    { format: 'OVA', words: ['ova'] },
    { format: 'ONA', words: ['ona'] },
  ]

  const STATUS_WORDS = [
    { status: 'NOT_YET_RELEASED', words: ['not yet released', 'unreleased', 'upcoming'] },
    { status: 'RELEASING', words: ['releasing', 'airing', 'ongoing'] },
    { status: 'HIATUS', words: ['on hiatus', 'hiatus'] },
    { status: 'CANCELLED', words: ['cancelled', 'canceled'] },
    { status: 'FINISHED', words: ['finished', 'completed'] },
  ]

  const SEASON_WORDS = [
    { season: 'WINTER', words: ['winter'] },
    { season: 'SPRING', words: ['spring'] },
    { season: 'SUMMER', words: ['summer'] },
    { season: 'FALL', words: ['fall', 'autumn'] },
  ]

  function stripKeyword(title, entry, key) {
    for (const words of [entry.words]) {
      const re = new RegExp(`\\b${words.join('\\b|\\b')}\\b`, 'i')
      const match = title.match(re)
      if (match) return { value: entry[key], title: title.replace(re, '') }
    }
    return { value: null, title }
  }

  function parseQuery(q) {
    let title = q
    const yearMatch = title.match(/\b(19|20)\d{2}\b/)
    const year = yearMatch ? Number(yearMatch[0]) : null
    if (yearMatch) title = title.replace(yearMatch[0], '')
    let format = null
    for (const entry of FORMAT_WORDS) {
      const { value, title: next } = stripKeyword(title, entry, 'format')
      if (value) { format = value; title = next; break }
    }
    let status = null
    for (const entry of STATUS_WORDS) {
      const { value, title: next } = stripKeyword(title, entry, 'status')
      if (value) { status = value; title = next; break }
    }
    let season = null
    for (const entry of SEASON_WORDS) {
      const { value, title: next } = stripKeyword(title, entry, 'season')
      if (value) { season = value; title = next; break }
    }
    return { title: title.trim(), year, format, status, season }
  }

async function handleSearch() {
    const id = ++requestId
    try {
      const { title, year, format, status, season } = parseQuery(query)
      const variables = { perPage: 50, sort: (year || status || season || format) ? ['POPULARITY_DESC', 'SCORE_DESC'] : 'SEARCH_MATCH' }
      if (title) variables.search = title
      if (year) variables.year = year
      if (format) variables.format = [format]
      if (status) variables.status = [status]
      if (season) variables.season = season
      const res = await anilistClient.search(variables)
      const all = res?.data?.Page?.media || []
      if (id !== requestId) return
      results = all.sort((a, b) => (FORMAT_PRIORITY[a.format] ?? 99) - (FORMAT_PRIORITY[b.format] ?? 99))
    } catch {
      if (id !== requestId) return
      results = []
    }
    if (id === requestId) { loading = false; selectedIndex = 0 }
  }

  const debouncedSearch = debounce(handleSearch, 250)

  function selectResult(media) { modal.open(modal.ANIME_DETAILS, media); close() }

  function handleKeydown(e) {
    e.stopPropagation()
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = results.length ? Math.min(selectedIndex + 1, results.length - 1) : 0 }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[selectedIndex]) selectResult(results[selectedIndex]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  function handleWindowKeydown(e) {
    if (e.key === 'Escape' && $modal[modal.SEARCH] && modal.focused === modal.SEARCH && e.target !== searchInput) close()
  }

  $: if ($modal[modal.SEARCH] && searchInput) requestAnimationFrame(() => searchInput.focus())
  $: if (selectedIndex >= 0) resultEls[selectedIndex]?.scrollIntoView({ block: 'nearest' })
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if $modal[modal.SEARCH]}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="backdrop" in:fade={{ duration: 120 }} out:fade={{ duration: 100 }} on:click={close}></div>
  <div class="popup" in:fly={{ y: 14, duration: 160 }} out:fly={{ y: 8, duration: 100 }}>
    <div class="search-row">
      <Search size={20} color="var(--card-dim)" />
      <input bind:this={searchInput} bind:value={query} on:input={onSearchInput} on:keydown={handleKeydown} type="text" placeholder="Search anime..." autocomplete="off" spellcheck="false" />
      <button use:click={close} class="popup-close" aria-label="Close search"><X size={20} /></button>
    </div>
    <div class="results-area">
    {#if loading}
      <div class="loading">
        <div class="spinner"></div>
        <span>Searching...</span>
      </div>
    {:else if results.length > 0}
      <div class="results">
        {#each groups as group}
          <div class="group-header" class:active={group.items.some(media => results.indexOf(media) === selectedIndex)}>
            {FORMAT_LABELS[group.format] || humanize(group.format)}
          </div>
          {#each group.items as media}
            <button class="result-btn {(results.indexOf(media) === selectedIndex) ? 'selected' : ''}" bind:this={resultEls[results.indexOf(media)]}
              on:click={() => selectResult(media)} on:mouseenter={() => selectedIndex = results.indexOf(media)}>
              <div class="cover-wrap">
                <img src={media.coverImage?.extraLarge || media.coverImage?.large || './404_cover.png'} alt="" loading="lazy" />
              </div>
              <div class="result-text">
                <div class="result-title">{media.title?.userPreferred || media.title?.romaji}</div>
                <div class="result-meta">
                  {#if media.status}<span>{humanize(media.status)}</span>{/if}
                  {#if formatAirDate(media.startDate)}<span class="air-date">{formatAirDate(media.startDate)}</span>{/if}
                </div>
              </div>
              {#if media.mediaListEntry?.status}
                <div class="list-status">
                  <div class="list-status-dot" style:--statusColor={statusColorMap[media.mediaListEntry.status]} title={media.mediaListEntry.status}></div>
                  <span>{LIST_STATUS_LABELS[media.mediaListEntry.status] || media.mediaListEntry.status}</span>
                </div>
              {/if}
              {#if media.mediaListEntry?.progress}
                <div class="result-progress">Ep {media.mediaListEntry.progress}</div>
              {/if}
            </button>
          {/each}
        {/each}
      </div>
    {:else if query.trim()}
      <div class="empty">No results found for "{query.trim()}"</div>
    {:else}
      <div class="empty">Start typing to search anime...</div>
    {/if}
    </div>
    <div class="hint">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> open</span>
      <span><kbd>esc</kbd> close</span>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,0.6);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); cursor: default;
  }
  .popup {
    position: fixed; top: 18%; left: 50%; transform: translateX(-50%); z-index: 1000;
    width: min(760px, 92vw); max-height: 72vh; overflow: hidden;
    border-radius: 14px; padding: 0.75rem;
    background: var(--card-bg2); border: 1px solid var(--card-line);
    box-shadow: 0 24px 60px rgba(0,0,0,0.55);
    display: flex; flex-direction: column;
  }
  .search-row {
    display: flex; align-items: center; gap: 10px; padding: 4px 6px 4px 2px;
  }
  .search-row input {
    flex: 1; min-width: 0;
    background: transparent; border: none; color: var(--card-fg);
    font-size: 18px; padding: 8px 4px; outline: none;
  }
  .search-row input::placeholder { color: var(--card-dim); }
  .search-row input:focus-visible,
  .result-btn:focus-visible,
  .popup-close:focus-visible { box-shadow: none; }
  .popup-close {
    background: none; border: none; cursor: pointer;
    color: var(--card-dim); padding: 6px; border-radius: 8px; line-height: 0; flex-shrink: 0;
    transition: color 0.15s, background 0.15s;
  }
  .popup-close:hover { color: var(--card-fg); background: var(--card-faint); }
  .results-area { flex: 1; overflow-y: auto; min-height: 0; margin-top: 8px; padding: 2px; }
  .results { display: flex; flex-direction: column; gap: 2px; }
  .group-header {
    display: flex; align-items: center; gap: 8px;
    padding: 14px 4px 4px; margin-top: 6px;
    color: var(--card-dim); font-size: 11px; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .group-header:first-child { padding-top: 4px; margin-top: 0; }
  .group-header.active { color: var(--card-accent); }
  .result-btn {
    width: 100%; display: flex; align-items: center; gap: 14px;
    padding: 10px; border-radius: 10px; border: 1px solid transparent; background: transparent;
    color: inherit; text-align: left; cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .result-btn:hover { background: var(--card-faint); }
  .result-btn.selected { background: var(--card-accent-dim); border-color: var(--card-accent); }
  .cover-wrap {
    width: 96px; aspect-ratio: 2/3; flex-shrink: 0; border-radius: 8px; overflow: hidden;
    background: var(--card-faint);
  }
  .cover-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .result-text { flex: 1; min-width: 0; }
  .result-title {
    color: var(--card-fg); font-weight: 600; font-size: 14px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .result-meta {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
    color: var(--card-dim); font-size: 12px;
  }
  .result-meta .air-date { color: var(--card-accent); }
  .list-status {
    flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; color: var(--card-fg);
    background: var(--card-faint); border-radius: 6px; padding: 3px 8px;
  }
  .list-status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--statusColor, var(--card-dim));
  }
  .result-progress {
    flex-shrink: 0; font-size: 11px; font-weight: 600; color: var(--card-accent);
    background: var(--card-accent-dim); border-radius: 6px; padding: 3px 8px;
  }
  .loading, .empty {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    color: var(--card-dim); padding: 32px 0; font-size: 13px;
  }
  .spinner {
    width: 18px; height: 18px; border: 2px solid var(--card-faint);
    border-top-color: var(--card-accent); border-radius: 50%; animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .hint {
    display: flex; gap: 14px; justify-content: flex-end; padding: 10px 6px 2px;
    color: var(--card-dim); font-size: 11px;
  }
  .hint span { display: inline-flex; align-items: center; gap: 4px; }
  kbd {
    background: var(--card-faint); border: 1px solid var(--card-line);
    border-radius: 4px; padding: 1px 5px; font-family: inherit; font-size: 10px;
  }
</style>
