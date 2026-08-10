<script>
  import { settings } from '@/modules/settings.js'
  import { onDestroy, afterUpdate } from 'svelte'

  export let promise
  export let list

  let container = null

  function updateRowMarkers() {
    if (!container) return
    const cards = Array.from(container.querySelectorAll('.small-card'))
    cards.forEach(card => card.classList.remove('first-in-row', 'last-in-row'))
    if (!settings.value.toggleList) {
      if (cards.length > 0) {
        cards[0].classList.add('first-in-row')
        cards[cards.length > 1 ? cards.length - 2 : 0].classList.add('last-in-row')
      }
    } else {
      const rows = new Map()
      cards.forEach(card => {
        const top = Math.round(card.getBoundingClientRect().top)
        if (!rows.has(top)) rows.set(top, [])
        rows.get(top).push(card)
      })
      rows.forEach(cardsInRow => {
        if (cardsInRow.length > 0) {
          cardsInRow[0].classList.add('first-in-row')
          cardsInRow[cardsInRow.length - 1].classList.add('last-in-row')
        }
      })
    }
  }

  function handleUpdate() {
    updateRowMarkers()
  }

  let observer = null
  $: {
    if (container && !observer) {
      observer = new ResizeObserver(handleUpdate)
      observer.observe(container)
      window.addEventListener('resize', handleUpdate)
    }
  }
  afterUpdate(handleUpdate)
  onDestroy(() => {
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', handleUpdate)
  })
</script>

{#if list?.length}
  <div class='pt-10 text-capitalize d-flex gallery'
       class:justify-content-center={list.length <= 2 || settings.value.toggleList}
       class:justify-content-start={list.length > 2 && !settings.value.toggleList}
       class:scroll={!settings.value.toggleList && list.length > 2}
       class:flex-row={!settings.value.toggleList}
       class:flex-wrap={settings.value.toggleList}
       bind:this={container}>
    {#each list as item}
      <slot {item} {promise} />
    {/each}
  </div>
{/if}

<style>
  

  .scroll {
    overflow-x: scroll;
    flex-shrink: 0;
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.07) transparent;
  }
  .scroll::-webkit-scrollbar { display: none; }

  .gallery :global(.first-in-row .small-card-ct .card-popup) {
    left: -48% !important;
  }
  .gallery :global(.last-in-row .small-card-ct .card-popup) {
    right: -48% !important;
  }
  .gallery :global(.item.small-card) {
    width: 19rem !important;
  }
  .gallery :global(.small-card-ct) {
    height: 100% !important;
  }
</style>