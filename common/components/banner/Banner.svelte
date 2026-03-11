<script>
  import FullBanner from '@/components/banner/FullBanner.svelte'
  import BannerSk from '@/components/skeletons/BannerSk.svelte'
  import ErrorCard from '@/components/cards/ErrorCard.svelte'
  import { settings } from '@/modules/settings.js'
  export let data

  function shuffle(media) {
    const array = media.filter(m => m.bannerImage || m.trailer?.id || (settings.value.adult === 'hentai' && settings.value.hentaiBanner && m.coverImage?.extraLarge))
    let currentIndex = Math.min(array.length, 10)
    let randomIndex
    while (currentIndex > 0) {
      randomIndex = Math.floor(Math.random() * currentIndex--)
      ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
    }
    return array
  }

  function shuffleAndFilter(media) { return shuffle(media).slice(0, 5) }

  /**
   * For each media item, fetch an alternative banner from Kitsu using the
   * MAL mapping so we have a different image pool to rotate through.
   * The result is stored on `media.kitsuBanners` as a string[].
   */
  async function enrichWithKitsuBanners(mediaList) {
    await Promise.allSettled(mediaList.map(async media => {
      try {
        // Use the AniList mal mapping id if present, otherwise search by title
        const malId = media.idMal
        let kitsuId = null

        if (malId) {
          const mapRes = await fetch(
            `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${malId}&include=item`,
            { headers: { 'Accept': 'application/vnd.api+json' } }
          )
          const mapJson = await mapRes.json()
          kitsuId = mapJson?.included?.[0]?.id ?? null
        }

        if (!kitsuId) {
          // Fallback: search by canonical title
          const title = media.title?.romaji || media.title?.english || media.title?.native || ''
          const searchRes = await fetch(
            `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`,
            { headers: { 'Accept': 'application/vnd.api+json' } }
          )
          const searchJson = await searchRes.json()
          kitsuId = searchJson?.data?.[0]?.id ?? null
        }

        if (!kitsuId) return

        const animeRes = await fetch(
          `https://kitsu.io/api/edge/anime/${kitsuId}`,
          { headers: { 'Accept': 'application/vnd.api+json' } }
        )
        const animeJson = await animeRes.json()
        const attrs = animeJson?.data?.attributes

        // Collect all non-null Kitsu image URLs — cover sizes give visual variety
        const kitsuImages = [
          attrs?.coverImage?.original,
          attrs?.coverImage?.large,
          attrs?.posterImage?.original,
          attrs?.posterImage?.large,
          attrs?.posterImage?.medium
        ].filter(Boolean)

        if (kitsuImages.length) media.kitsuBanners = kitsuImages
      } catch {
        // Non-fatal — fall back to AniList images only
      }
    }))
    return mediaList
  }

  async function prepareMedia(res) {
    if (res.errors) return res
    const filtered = shuffleAndFilter(res?.data?.Page?.media?.filter(Boolean))
    await enrichWithKitsuBanners(filtered)
    return { ...res, enrichedMedia: filtered }
  }
</script>

<div class='w-full h-400 position-relative'>
  {#await data}
    <BannerSk />
  {:then res}
    {#if !res.errors}
      {#await prepareMedia(res)}
        <BannerSk />
      {:then enriched}
        <FullBanner mediaList={enriched.enrichedMedia} />
      {/await}
    {:else}
      <ErrorCard promise={res} />
    {/if}
  {/await}
</div>