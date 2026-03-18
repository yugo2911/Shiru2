<script>
  import { onMount, onDestroy } from 'svelte'
  import PreviewCard from '@/components/cards/PreviewCard.svelte'
  import { airingAt, getAiringInfo, getKitsuMappings, formatMap, statusColorMap } from '@/modules/anime/anime.js'
  import { createListener } from '@/modules/util.js'
  import { hoverClick } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import AudioLabel from '@/components/AudioLabel.svelte'
  import { anilistClient, currentYear } from '@/modules/anilist.js'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { modal } from '@/modules/navigation.js'
  import { Skull, Swords, Shield, Crown } from 'lucide-svelte'

  export let data
  export let type = null
  export let variables = null
  let _variables = variables

  let media
  $: if (data && !media) media = mediaCache.value[data?.id]
  mediaCache.subscribe((value) => { if (value && (JSON.stringify(value[media?.id]) !== JSON.stringify(media))) media = value[media?.id] })
  
  function viewMedia() {
    if (_variables?.fileEdit) _variables.fileEdit(media)
    else modal.open(modal.ANIME_DETAILS, media)
  }

  let preview = false
  let ignoreFocus = false
  function setHoverState(state) {
    if (settings.value.cardPreview) preview = state
    else if (state) viewMedia()
  }

  let container
  let previewCard
  let focusTimeout

  function handleFocus() {
    if (ignoreFocus || preview) return
    focusTimeout = setTimeout(() => {
      if (settings.value.cardPreview) {
        preview = true
        ignoreFocus = true
      }
    }, 800)
  }

  let _airingAt = null
  $: airingInfo = getAiringInfo(_airingAt)

  onMount(() => {
    _airingAt = media && _variables?.scheduleList && airingAt(media, _variables)
  })

  const { reactive, init } = createListener(['btn', 'preview-safe-area'])
  $: init(preview)
</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Quicksand:wght@300;500&display=swap');

  .small-card-ct {
    font-family: 'Quicksand', sans-serif;
    /* Positioned higher as requested */
    margin-top: -35px !important;
    transition: filter 0.3s ease;
  }

  .nazarick-frame {
    background: #050505;
    border: 1px solid #2a2211;
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Ornate Gold Corners */
  .nazarick-frame::before, .nazarick-frame::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border: 2px solid #8e6d31;
    z-index: 10;
    pointer-events: none;
    transition: all 0.5s ease;
  }

  .nazarick-frame::before { top: 5px; left: 5px; border-right: 0; border-bottom: 0; }
  .nazarick-frame::after { bottom: 5px; right: 5px; border-left: 0; border-top: 0; }

  .small-card-ct:hover .nazarick-frame {
    border-color: #8e6d31;
    box-shadow: 0 0 20px rgba(142, 109, 49, 0.3), inset 0 0 15px rgba(142, 109, 49, 0.1);
    transform: scale(1.02);
  }

  .image-container {
    position: relative;
    padding: 12px;
    background: radial-gradient(circle at center, #1a1a1a 0%, #050505 100%);
  }

  :global(.cover-img) {
    filter: sepia(0.5) contrast(1.2) brightness(0.7);
    transition: all 0.8s ease !important;
    mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
  }

  .small-card-ct:hover :global(.cover-img) {
    filter: sepia(0) contrast(1.1) brightness(0.9);
  }

  .title-area {
    padding: 10px 15px 20px 15px;
    text-align: center;
  }

  .rank-label {
    font-family: 'Cinzel Decorative', cursive;
    font-size: 8px;
    color: #8e6d31;
    letter-spacing: 3px;
    text-transform: uppercase;
    display: block;
    margin-bottom: 6px;
  }

  .title {
    font-family: 'Cinzel Decorative', cursive;
    font-weight: 900;
    font-size: 1.1rem !important;
    line-height: 1.1;
    color: #e2d1b1;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta-scroll {
    margin-top: auto;
    background: #0a0a0a;
    border-top: 1px solid #1a1a1a;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    color: #555;
  }

  .airing-pulse {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: #4a0000;
    color: #ff4d4d;
    padding: 2px 10px;
    font-size: 8px;
    font-weight: 900;
    border: 1px solid #ff4d4d;
    box-shadow: 0 0 10px #4a0000;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; text-shadow: 0 0 5px #ff4d4d; }
    100% { opacity: 0.6; }
  }

  .tier-icon {
    position: absolute;
    top: -10px;
    right: 15px;
    color: #8e6d31;
    background: #050505;
    padding: 5px;
    border: 1px solid #8e6d31;
    border-radius: 50%;
    z-index: 15;
  }
</style>

<div bind:this={container} 
     class='d-flex p-15 position-relative small-card-ct {$reactive ? `` : `not-reactive`}' 
     use:hoverClick={[viewMedia, setHoverState, viewMedia]} 
     on:focus={handleFocus}>
  
  {#if preview}
    <PreviewCard {media} {type} {_variables} bind:element={previewCard}/>
  {/if}

  <div class='nazarick-frame item load-in pointer {airingInfo?.episode.match(/out for/i) ? `airing` : ``}'>
    <div class="tier-icon">
      <Crown size="14" />
    </div>

    {#if airingInfo?.episode.match(/out for/i)}
      <div class="airing-pulse">UNSEALED</div>
    {/if}

    <div class='image-container'>
      <SmartImage class='cover-img cover-color cover-ratio w-full' color="#050505" images={[media.coverImage.extraLarge, media.coverImage?.medium]}/>
      
      {#if !_variables?.scheduleList}
        <div class="position-absolute bottom-15 right-15 opacity-40">
          <AudioLabel {media} />
        </div>
      {/if}
    </div>

    <div class='title-area'>
      <span class="rank-label">Supreme Being Entry</span>
      <div class='title'>
        {anilistClient.title(media)}
      </div>
    </div>

    <div class="px-15 d-flex justify-content-center gap-4 mb-10 opacity-30">
      <Swords size="12" />
      <Skull size="12" />
      <Shield size="12" />
    </div>

    <div class='meta-scroll'>
      <span>{formatMap[media.format] || 'SCROLL'}</span>
      <span style="color: #8e6d31">{media.averageScore || '??'} MP</span>
    </div>
  </div>
</div>