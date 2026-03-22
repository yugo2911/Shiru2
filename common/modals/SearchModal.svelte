<script>
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import { modal } from '@/modules/navigation.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { X, Search } from 'lucide-svelte'
  import { click } from '@/modules/click.js'
  import Card from '@/components/cards/Card.svelte'
  import { onMount } from 'svelte'

  let searchInput
  let query = ''
  let results = []
  let loading = false
  let selectedIndex = 0

  function close() {
    modal.close(modal.SEARCH)
    query = ''
    results = []
    selectedIndex = 0
  }

  async function handleSearch() {
    if (!query.trim()) {
      results = []
      return
    }
    loading = true
    try {
      const res = await anilistClient.search({
        method: 'Search',
        search: query,
        perPage: 10,
        sort: 'SEARCH_MATCH',
      })
      results = res?.data?.Page?.media || []
    } catch (e) {
      results = []
    }
    loading = false
    selectedIndex = 0
  }

  function selectResult(media) {
    modal.open(modal.ANIME_DETAILS, media)
    close()
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex = Math.max(selectedIndex - 1, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) {
        selectResult(results[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  $: if ($modal[modal.SEARCH] && searchInput) {
    searchInput.focus()
  }
</script>

<SoftModal 
  css="top-0 left-0 w-full h-full flex flex-col items-center justify-start pt-20"
  bind:showModal={$modal[modal.SEARCH]} 
  shouldRender={true} 
  {close} 
  id={modal.SEARCH}
>
  <div class="w-full max-w-2xl px-4">
    <div class="relative">
      <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
      <input
        bind:this={searchInput}
        bind:value={query}
        on:input={handleSearch}
        on:keydown={handleKeydown}
        type="text"
        placeholder="Search anime..."
        class="w-full bg-dark-light border border-gray-700 rounded-xl py-4 pl-12 pr-12 text-white text-lg focus:outline-none focus:border-primary-500"
      />
      <button 
        use:click={close}
        class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
      >
        <X size={20} />
      </button>
    </div>

    {#if loading}
      <div class="mt-4 text-center text-gray-400">Searching...</div>
    {:else if results.length > 0}
      <div class="mt-4 space-y-2 max-h-96 overflow-y-auto">
        {#each results as media, i}
          <button
            class="w-full flex items-center gap-4 p-3 rounded-lg transition-colors {(i === selectedIndex) ? 'bg-dark-light border border-primary-500' : 'bg-dark hover:bg-dark-lighter border border-transparent'}"
            on:click={() => selectResult(media)}
            on:mouseenter={() => selectedIndex = i}
          >
            <img 
              src={media.coverImage?.extraLarge || media.coverImage?.large || ''} 
              alt=""
              class="w-12 h-16 object-cover rounded"
            />
            <div class="flex-1 text-left">
              <div class="text-white font-medium">{media.title?.userPreferred || media.title?.romaji}</div>
              <div class="text-gray-400 text-sm">{media.format} • {media.status}</div>
            </div>
          </button>
        {/each}
      </div>
    {:else if query.trim()}
      <div class="mt-4 text-center text-gray-400">No results found</div>
    {/if}
  </div>
</SoftModal>
