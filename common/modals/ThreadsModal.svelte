<script>
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import { MessagesSquare } from 'lucide-svelte'
  import { click } from '@/modules/click.js'
  import { X, ChevronLeft, Lock, MessageSquare, Eye, Heart } from 'lucide-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { modal } from '@/modules/navigation.js'
  import { since } from '@/modules/util.js'
  import DOMPurify from 'dompurify'
  import { marked } from 'marked'

  export let staticMedia

  let threads = null
  let comments = null
  let selectedThread = null

  function close () {
    modal.close(modal.THREADS)
    selectedThread = null
  }

  function sanitize(body) {
    if (!body) return ''
    const cleanBody = body.trim()
      .replace(/\.\.+(?=\s*$)/gm, '.')
      .replace(/\n/g, '<br>')
      .replace(/(<br\s*\/?>){2,}/gi, '<br><br>')
      .replace(/^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi, '')
    marked.setOptions({
      pedantic: false,
      breaks: true,
      gfm: true
    })
    return DOMPurify.sanitize(marked.parse(cleanBody).trim(), {
      ALLOWED_TAGS: [
        'p', 'br', 'span', 'div',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
        'ul', 'ol', 'li',
        'blockquote',
        'code', 'pre',
        'a',
        'img',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'hr',
        'details', 'summary',
        'input'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'title',
        'src', 'alt', 'width', 'height',
        'class', 'id',
        'align',
        'type', 'checked', 'disabled'
      ]
    })
  }

  function plainText(body) {
    if (!body) return ''
    return body.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>-]/g, '')
  }

  async function loadThreads () {
    if (!staticMedia?.id) return
    const res = await anilistClient.threads({ id: staticMedia.id })
    threads = res?.data?.Page?.threads || []
  }

  async function loadComments () {
    if (!selectedThread?.id) return
    comments = null
    const res = await anilistClient.threadComments({ id: selectedThread.id })
    comments = res?.data?.Page?.threadComments || []
  }

  $: if ($modal[modal.THREADS] && !threads) loadThreads()
  $: if (selectedThread) loadComments()
  $: if (!$modal[modal.THREADS]) {
    selectedThread = null
    comments = null
  }
</script>

<button 
  class='btn TechnicalSquareButton d-flex align-items-center justify-content-center shadow-none border-0 mr-10' 
  data-toggle='tooltip' 
  data-placement='top' 
  data-target-breakpoint='md' 
  data-title='Discussions'
  use:click={() => modal.toggle(modal.THREADS)}
  disabled={!staticMedia?.id}
>
  <MessagesSquare size='1.2rem' />
</button>

<SoftModal 
  class='pointer-events-none w-full scrollbar-none align-items-center mb-30' 
  css='top-0 left-0 position-fixed' 
  bind:showModal={$modal[modal.THREADS]} 
  shouldRender={true} 
  {close} 
  id={modal.THREADS}
>
  <div class='pointer-events-auto d-flex align-items-center rounded-top-5 w-full wm-calc bg-dark h-40'>
    {#if selectedThread}
      <button type='button' class='btn btn-square bg-transparent shadow-none border-0 d-flex align-items-center justify-content-center ml-5' data-toggle='tooltip' data-placement='top' data-title='Back to Discussions' use:click={() => selectedThread = null}>
        <ChevronLeft size='1.5rem' strokeWidth='3'/>
      </button>
    {/if}
    <span class='title ml-15 font-weight-very-bold text-muted select-all mr-20 font-scale-18'>{anilistClient.title(staticMedia)} - Discussions</span>
    <button type='button' class='btn btn-square bg-transparent shadow-none border-0 d-flex align-items-center justify-content-center ml-auto mr-5' use:click={close}><X size='1.7rem' strokeWidth='3'/></button>
  </div>

  <div class='pointer-events-auto w-full wm-calc rounded-bottom-5 threads-scope thread-content'>
    {#if selectedThread}
      <div class='thread-detail'>
        <div class='thread-detail-top'>
          <div class='thread-detail-title'>{selectedThread.title}</div>
          <div class='thread-detail-meta'>
            <span>By <span class='author'>{selectedThread.user?.name || 'Anonymous'}</span></span>
            {#if selectedThread.createdAt}<span>{since(new Date(selectedThread.createdAt * 1000))}</span>{/if}
            <span class='stat'><MessageSquare size='0.9rem'/>{selectedThread.replyCount}</span>
            <span class='stat'><Eye size='0.9rem'/>{selectedThread.viewCount}</span>
            <span class='stat'><Heart size='0.9rem'/>{selectedThread.likeCount}</span>
          </div>
        </div>
        {#if selectedThread.body}
          <div class='thread-body'>{@html sanitize(selectedThread.body)}</div>
        {/if}
        <div class='comments-title'>COMMENTS</div>
        <div class='comments-list'>
          {#if comments === null}
            <div class='empty'>Loading comments...</div>
          {:else if comments?.length}
            {#each comments as comment}
              <div class='comment-card'>
                {#if comment.user?.avatar?.medium}
                  <img class='comment-avatar' src={comment.user.avatar.medium} alt='' />
                {:else}
                  <div class='comment-avatar'></div>
                {/if}
                <div class='comment-main'>
                  <div class='comment-head'>
                    <span class='author'>{comment.user?.name || 'Anonymous'}</span>
                    {#if comment.createdAt}<span>{since(new Date(comment.createdAt * 1000))}</span>{/if}
                    {#if comment.likeCount}<span class='comment-likes'><Heart size='0.85rem'/>{comment.likeCount}</span>{/if}
                  </div>
                  {#if comment.comment}
                    <div class='comment-text'>{@html sanitize(comment.comment)}</div>
                  {/if}
                </div>
              </div>
            {/each}
          {:else}
            <div class='empty'>No comments yet</div>
          {/if}
        </div>
      </div>
    {:else if threads === null}
      <div class='empty'>Loading discussions...</div>
    {:else if !threads?.length}
      <div class='empty'>No discussions yet</div>
    {:else}
      <div class='thread-list'>
        {#each threads as thread}
          <button class='thread-card' type='button' use:click={() => selectedThread = thread}>
            {#if thread.user?.avatar?.medium}
              <img class='avatar' src={thread.user.avatar.medium} alt='' />
            {:else}
              <div class='avatar'></div>
            {/if}
            <div class='thread-main'>
              <span class='category-tag'>{thread.categories?.[0]?.name || 'General'}</span>
              {#if thread.isSticky}<span class='sticky-tag'>PINNED</span>{/if}
              {#if thread.isLocked}<span class='sticky-tag locked'><Lock size='0.75rem'/></span>{/if}
              <span class='thread-title'>{thread.title}</span>
              {#if thread.body}
                <div class='thread-preview'>{plainText(thread.body)}</div>
              {/if}
              <div class='thread-meta'>
                <span>By <span class='author'>{thread.user?.name || 'Anonymous'}</span></span>
                {#if thread.createdAt}<span>{since(new Date(thread.createdAt * 1000))}</span>{/if}
              </div>
            </div>
            <div class='thread-stats'>
              <span class='replies-count'>{thread.replyCount}</span>
              <span>replies</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</SoftModal>

<style>
  .wm-calc {
    max-width: min(max(70vw, 90rem), 120rem);
  }
  .title {
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .threads-scope {
    --tp-bg: #11161d;
    --ts-bg: #151f2e;
    --tt-bg: #1f2937;
    --ts-accent: #3db4f2;
    --ts-text: #9fadbd;
    --ts-bright: #ffffff;
    --ts-border: #233142;
    background-color: var(--tp-bg);
    color: var(--ts-text);
  }

  .thread-content {
    overflow: hidden;
  }

  .thread-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .thread-card {
    background-color: var(--ts-bg);
    border: 1px solid var(--ts-border);
    border-radius: 6px;
    padding: 15px;
    display: flex;
    gap: 15px;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
    transition: border-color 0.2s;
    scale: 1;
  }
  .thread-card:hover {
    border-color: var(--ts-accent);
  }

  .avatar {
    width: 45px;
    height: 45px;
    border-radius: 4px;
    background-color: var(--tt-bg);
    background-image: url('./404_square.png');
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
    object-fit: cover;
  }

  .thread-main {
    flex-grow: 1;
    min-width: 0;
  }

  .thread-preview {
    color: var(--ts-text);
    font-size: 0.85rem;
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .category-tag {
    background-color: var(--tt-bg);
    color: var(--ts-accent);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.75rem;
    display: inline-block;
    margin-bottom: 4px;
    margin-right: 6px;
  }

  .sticky-tag {
    display: inline-flex;
    align-items: center;
    background-color: var(--tt-bg);
    color: var(--ts-accent);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
    margin-right: 6px;
    vertical-align: top;
  }
  .sticky-tag.locked {
    color: #f87171;
  }

  .thread-title {
    color: var(--ts-bright);
    font-size: 1.1rem;
    margin-bottom: 6px;
    display: block;
    transition: color 0.2s;
  }
  .thread-card:hover .thread-title {
    color: var(--ts-accent);
  }

  .thread-meta {
    font-size: 0.85rem;
    display: flex;
    gap: 15px;
  }
  .author {
    color: var(--ts-bright);
    font-weight: 500;
  }

  .thread-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    font-size: 0.85rem;
    min-width: 80px;
    flex-shrink: 0;
  }
  .replies-count {
    color: var(--ts-bright);
    font-weight: 600;
  }

  .thread-detail {
    padding: 20px;
    max-height: 70vh;
    overflow-y: auto;
  }
  .thread-detail-top {
    border-bottom: 1px solid var(--ts-border);
    padding-bottom: 15px;
    margin-bottom: 15px;
  }
  .thread-detail-title {
    color: var(--ts-bright);
    font-size: 1.25rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .thread-detail-meta {
    font-size: 0.85rem;
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    align-items: center;
  }
  .thread-detail-meta .stat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .thread-detail-meta svg {
    color: var(--ts-accent);
  }
  .thread-body {
    font-size: 1rem;
    line-height: 1.7;
    color: var(--ts-text);
    margin-bottom: 20px;
    overflow-wrap: break-word;
  }
  .thread-body :global(p) { margin: 0 0 0.5em; }
  .thread-body :global(p:last-child) { margin-bottom: 0; }
  .thread-body :global(a) { color: var(--ts-accent); }
  .thread-body :global(pre) {
    background: var(--tt-bg);
    border: 1px solid var(--ts-border);
    border-radius: 4px;
    padding: 10px;
    overflow-x: auto;
  }
  .thread-body :global(code) { color: var(--ts-bright); }
  .thread-body :global(img) { max-width: 100%; border-radius: 4px; }
  .thread-body :global(blockquote) {
    border-left: 3px solid var(--ts-accent);
    margin: 0 0 0.5em;
    padding-left: 10px;
    color: var(--ts-text);
  }
  .thread-body :global(ul), .thread-body :global(ol) { padding-left: 20px; }
  .thread-body :global(h1), .thread-body :global(h2), .thread-body :global(h3),
  .thread-body :global(h4), .thread-body :global(h5), .thread-body :global(h6) {
    color: var(--ts-bright);
  }
  .comments-title {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--ts-accent);
    margin-bottom: 12px;
  }
  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .comment-card {
    display: flex;
    gap: 12px;
    background-color: var(--ts-bg);
    border: 1px solid var(--ts-border);
    border-radius: 6px;
    padding: 12px 14px;
  }
  .comment-avatar {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background-color: var(--tt-bg);
    background-image: url('./404_square.png');
    background-size: cover;
    background-position: center;
    flex-shrink: 0;
    object-fit: cover;
  }
  .comment-main {
    flex-grow: 1;
    min-width: 0;
  }
  .comment-head {
    font-size: 0.8rem;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
  }
  .comment-likes {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }
  .comment-likes svg {
    color: var(--ts-accent);
  }
  .comment-text {
    font-size: 0.95rem;
    line-height: 1.55;
    overflow-wrap: break-word;
  }
  .comment-text :global(p) { margin: 0 0 0.5em; }
  .comment-text :global(p:last-child) { margin-bottom: 0; }
  .comment-text :global(a) { color: var(--ts-accent); }
  .comment-text :global(img) { max-width: 100%; border-radius: 4px; }
  .empty {
    padding: 20px;
    text-align: center;
    color: var(--ts-text);
    font-size: 0.95rem;
  }
</style>
