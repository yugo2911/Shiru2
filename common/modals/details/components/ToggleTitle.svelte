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
    font-family: var(--font-mono) !important;
    font-size: 1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.22em !important;
    text-transform: uppercase !important;
    color: var(--card-dim) !important;
    white-space: nowrap;
    background: var(--card-bg);
    padding: 0 1.4rem !important;
  }

  /* Section divider lines */
  hr {
    border-color: var(--card-line) !important;
    opacity: 1;
  }

  /* Hover state when the section is togglable */
  @media (hover: hover) and (pointer: fine) {
    .more:hover .title {
      color: var(--card-accent) !important;
    }
    .more:hover hr {
      border-color: var(--card-accent-dim) !important;
    }
  }
</style>