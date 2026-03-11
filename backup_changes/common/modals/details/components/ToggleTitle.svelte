<script>
  export let title
</script>
<div class='w-full d-flex flex-row align-items-center pt-10 text-white {$$restProps.class}'>
  <hr class='w-full' />
  <div class='title position-absolute font-size-18 font-weight-semi-bold px-20'>{title}</div>
  <hr class='w-full' />
</div>

<style>
  

  .title {
    left: 50%;
    transform: translateX(-50%);
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.22em !important;
    text-transform: uppercase !important;
    color: rgba(237,237,234,0.38) !important;
    white-space: nowrap;
    background: #0d0d10;
    padding: 0 1.4rem !important;
  }

  /* Section divider lines */
  hr {
    border-color: rgba(255,255,255,0.07) !important;
    opacity: 1;
  }

  /* Hover state when the section is togglable */
  @media (hover: hover) and (pointer: fine) {
    .more:hover .title {
      color: #d4f55e !important;
    }
    .more:hover hr {
      border-color: rgba(212,245,94,0.25) !important;
    }
  }
</style>