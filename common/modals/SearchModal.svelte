<script>
  import { modal } from '@/modules/navigation.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { X, Search } from 'lucide-svelte'
  import { click } from '@/modules/click.js'

  let searchInput, query = '', results = [], loading, selectedIndex = 0

  function close() {
    modal.close(modal.SEARCH)
    query = ''; results = []; selectedIndex = 0
  }

  async function handleSearch() {
    if (!query.trim()) { results = []; return }
    loading = true
    try {
      const res = await anilistClient.search({ method: 'Search', search: query, perPage: 10, sort: 'SEARCH_MATCH' })
      results = res?.data?.Page?.media || []
    } catch { results = [] }
    loading = false; selectedIndex = 0
  }

  function selectResult(media) { modal.open(modal.ANIME_DETAILS, media); close() }

  function handleKeydown(e) {
    e.stopPropagation()
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, results.length - 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[selectedIndex]) selectResult(results[selectedIndex]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  $: if ($modal[modal.SEARCH] && searchInput) requestAnimationFrame(() => searchInput.focus())
</script>

{#if $modal[modal.SEARCH]}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" on:click={close} on:contextmenu|preventDefault={close}></div>
  <div class="popup">
    <div class="search-row">
      <Search class="search-icon" size={20} />
      <input bind:this={searchInput} bind:value={query} on:input={handleSearch} on:keydown={handleKeydown} type="text" placeholder="Search anime..." />
      <button use:click={close} class="popup-close"><X size={20} /></button>
    </div>
    <div class="results-area">
    {#if loading}
      <div class="mt-4 text-center text-gray-400">Searching...</div>
    {:else if results.length > 0}
      <div class="space-y-2">
        {#each results as media, i}
          <button class="result-btn {(i === selectedIndex) ? 'bg-dark-light border border-primary-500' : 'bg-dark hover:bg-dark-lighter border border-transparent'}"
            on:click={() => selectResult(media)} on:mouseenter={() => selectedIndex = i}>
            <div class="cover-wrap">
              <img src={media.coverImage?.extraLarge || media.coverImage?.large || ''} alt="" />
            </div>
            <div class="result-text">
              <div class="text-white font-medium text-sm truncate">{media.title?.userPreferred || media.title?.romaji}</div>
              <div class="text-gray-400 text-xs">{media.format} • {media.status}</div>
            </div>
          </button>
        {/each}
      </div>
    {:else if query.trim()}
      <div class="mt-4 text-center text-gray-400">No results found</div>
    {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,0.5); cursor: default;
  }
  .result-btn {
    width: 100%; display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center;
    gap: 12px; padding: 8px; border-radius: 8px; transition: colors 0.2s; border: 1px solid transparent;
  }
  .result-text {
    flex: 1; text-align: left; min-width: 0;
  }
  .cover-wrap {
    width: 100px; aspect-ratio: 2/3; flex-shrink: 0; border-radius: 4px; overflow: hidden;
  }
  .cover-wrap img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .search-row {
    display: flex; align-items: center; gap: 8px;
  }
  .search-icon {
    color: #9ca3af; flex-shrink: 0;
  }
  .search-row input {
    flex: 1; min-width: 0;
    background: #1f1f23; border: 1px solid #374151; border-radius: 12px;
    padding: 16px 12px; color: #fff; font-size: 18px; outline: none;
  }
  .search-row input:focus {
    border-color: #6366f1;
  }
  .popup-close {
    background: none; border: none; cursor: pointer;
    color: #9ca3af; padding: 4px; border-radius: 4px; line-height: 0; flex-shrink: 0;
  }
  .popup-close:hover { color: #fff; }
  .popup {
    position: fixed; top: 20%; left: 50%; transform: translateX(-50%); z-index: 1000;
    border-radius: 12px; background: rgba(12,12,14,0.95); backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.06); padding: 1rem;
    min-width: 320px; max-width: 480px; width: 90vw;
    display: flex; flex-direction: column; max-height: 75vh;
  }
  .results-area {
    flex: 1; overflow-y: auto; min-height: 0; margin-top: 12px;
  }
</style>