<script>
  export let promise
</script>

{#await promise then res}
  {#if !res || res?.errors}
    {@const errors = res?.errors}
    <div class='p-20 d-flex align-items-center justify-content-center w-full h-410'>
      <div>
        <h1 class='mb-5 text-white font-weight-bold text-center'>
          Ooops!
        </h1>
        {#if errors}
          <div class='font-size-22 text-center text-muted'>
            {#if JSON.stringify(errors)?.match(/found no results/i) || JSON.stringify(errors)?.match(/will be released on|hasn't released yet/i)}
              No results found.
            {:else if (JSON.stringify(errors)?.match(/extension is not enabled/i) && !errors?.filter(error => !error?.message.match(/extension is not enabled/i))?.length) || JSON.stringify(errors)?.match(/no torrent sources/i)}
              No Extensions Found
            {:else if errors?.length === 1 && Array.isArray(errors[0].message)}
              {errors[0].message[0]}
            {:else if errors}
              Looks like something went wrong!
            {/if}
          </div>
        {/if}
        <div class='font-size-20 text-center text-muted'>
          {#if !res?.errors}
            Looks like there's nothing here.
          {:else if JSON.stringify(errors)?.match(/extension is not enabled/i) && !errors?.filter(error => !error?.message.match(/extension is not enabled/i))?.length}
            It looks like you haven't added any extension sources, manage your extensions in the settings.
          {:else if JSON.stringify(errors)?.match(/found no results/i)}
            You can manually specify a torrent by providing a link or file.
          {:else if errors?.length === 1 && Array.isArray(errors[0].message)}
           {#each errors[0].message.slice(1) as message}
             <div>{message}</div>
           {/each}
          {:else}
            {#each errors?.filter(error => !error.message.match(/found no results|extension is not enabled/i)) as error}
              <div>{error.message}</div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
{:catch error}
  <div class='p-20 d-flex align-items-center justify-content-center w-full h-410'>
    <div>
      <h1 class='mb-5 text-white font-weight-bold text-center'>
        Ooops!
      </h1>
      <div class='font-size-20 text-center text-muted'>
        Looks like something went wrong!
      </div>
      <div class='font-size-20 text-center text-muted'>
        {error.message}
      </div>
    </div>
  </div>
{/await}

<style>
  

  .h-410 {
    height: 41rem;
  }
  /* Error state container */
  :global(.p-20.d-flex.align-items-center.justify-content-center.w-full.h-410) {
    background: #0d0d10;
    font-family: 'IBM Plex Mono', monospace;
  }
  /* "Ooops!" heading */
  h1 {
    font-family: 'Syne', sans-serif !important;
    font-size: 3.2rem !important;
    font-weight: 800 !important;
    letter-spacing: -0.03em !important;
    color: #ededea !important;
    margin-bottom: 1rem !important;
  }
  /* Primary error label */
  .font-size-22 {
    font-size: 1.3rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.12em !important;
    text-transform: uppercase !important;
    color: #d4f55e !important;
    font-family: 'IBM Plex Mono', monospace !important;
    margin-bottom: 0.5rem !important;
  }
  /* Secondary error detail */
  .font-size-20 {
    font-size: 1.2rem !important;
    color: rgba(237,237,234,0.38) !important;
    font-family: 'IBM Plex Mono', monospace !important;
    line-height: 1.7 !important;
  }
</style>