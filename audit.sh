#!/usr/bin/env bash
# =============================================================================
# svelte_audit.sh — Svelte Project Auditor
# Usage: bash svelte_audit.sh [project_root]
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
ROOT="${1:-.}"
LOG_DIR="${ROOT}/audit_logs/$(date +%Y%m%d_%H%M%S)"
SUMMARY="$LOG_DIR/00_SUMMARY.log"

# ---------------------------------------------------------------------------
# COLORS
# ---------------------------------------------------------------------------
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ---------------------------------------------------------------------------
# COUNTERS
# ---------------------------------------------------------------------------
TASK_COUNT=0; WARN_COUNT=0; FILE_COUNT=0

# ---------------------------------------------------------------------------
# CORE HELPERS
# ---------------------------------------------------------------------------
log()    { echo -e "  ${DIM}▸${RESET} $*"; }
header() { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${RESET}"; }
warn()   { echo -e "  ${YELLOW}⚠${RESET}  $*"; ((WARN_COUNT++)) || true; }
need()   { command -v "$1" &>/dev/null || { warn "Tool '$1' not found — skipping"; return 1; }; }

run_task() {
    local label="$1" logfile="$2"; shift 2
    local out="$LOG_DIR/$logfile"
    local exit_code=0 start end elapsed

    ((TASK_COUNT++)) || true
    start=$(date +%s%N)

    {
        printf '# ============================================================\n'
        printf '# TASK : %s\n' "$label"
        printf '# DATE : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
        printf '# ============================================================\n\n'
    } > "$out"

    "$@" >> "$out" 2>&1 || exit_code=$?

    end=$(date +%s%N)
    elapsed=$(( (end - start) / 1000000 ))
    local lines; lines=$(wc -l < "$out")

    {
        printf '\n# EXIT : %d  LINES : %d  TIME : %dms\n' "$exit_code" "$lines" "$elapsed"
    } >> "$out"

    if [[ $exit_code -ne 0 ]]; then
        warn "$label → exit $exit_code ($logfile)"
        printf '⚠   %-50s %6dms  %s\n' "$label" "$elapsed" "$logfile" >> "$SUMMARY"
    else
        log "$label ${DIM}(${lines}L, ${elapsed}ms)${RESET} → $logfile"
        printf '✓   %-50s %6dms  %s\n' "$label" "$elapsed" "$logfile" >> "$SUMMARY"
    fi
}

# ---------------------------------------------------------------------------
# PROJECT HELPERS  (called as real functions, no quoting hell)
# ---------------------------------------------------------------------------

find_svelte() {
    find "$ROOT" \
        -type d \( -name node_modules -o -name .git -o -name dist \
                   -o -name build -o -name .svelte-kit \) -prune \
        -o -name "*.svelte" -print
}

# Extract all <TAG ...>...</TAG> blocks from a file, print with ==> header
_extract_blocks() {
    local file="$1" tag="$2"
    perl -0777 -ne "
        while (/<${tag}[^>]*>(.*?)<\\/${tag}>/sg) {
            print \"==> $file <==\\n<${tag}>\$1<\\/${tag}>\\n\\n\"
        }
    " "$file"
}

# Print block content only (no outer tag), or empty string
_inner_block() {
    local file="$1" tag="$2"
    perl -0777 -ne "
        while (/<${tag}[^>]*>(.*?)<\\/${tag}>/sg) { print \"\$1\" }
    " "$file"
}

# Hash string (first 8 chars of md5)
_md5short() {
    printf '%s' "$1" | md5sum 2>/dev/null | cut -c1-8 \
    || printf '%s' "$1" | md5 2>/dev/null | cut -c1-8 \
    || echo "nohash"
}

# ---------------------------------------------------------------------------
# TASK IMPLEMENTATIONS  (each is its own function → no nested quoting)
# ---------------------------------------------------------------------------

# --- structure ---

do_tree_full() {
    eza --tree --all --long --git --icons --group-directories-first \
        --ignore-glob="node_modules|.git|dist|build|.svelte-kit" "$ROOT"
}

do_tree_svelte() {
    eza --tree --long --git \
        --ignore-glob="node_modules|.git|dist|build|.svelte-kit" "$ROOT" \
    | grep -E "(\.svelte|/[[:space:]]*$|^\.) "
}

do_file_list()      { find_svelte | sort; }
do_file_sizes()     { find_svelte | sort | xargs wc -l 2>/dev/null | sort -rn; }
do_empty_files()    { find_svelte | sort | xargs wc -l 2>/dev/null | awk '$1<=5 && $2!="total"'; }
do_recent_files()   {
    find "$ROOT" \
        -type d \( -name node_modules -o -name .git \) -prune \
        -o -name "*.svelte" -mtime -7 -print | sort
}
do_git_status()     { cd "$ROOT" && git status --short -- "*.svelte" 2>/dev/null || echo "(not a git repo)"; }
do_git_log()        { cd "$ROOT" && git log --oneline -30 -- "*.svelte" 2>/dev/null || echo "(not a git repo)"; }
do_kit_routes()     {
    find "$ROOT" \( -name "+page.svelte" -o -name "+layout.svelte" \
                    -o -name "+error.svelte" \) 2>/dev/null | sort
}
do_dir_breakdown()  { find_svelte | sed 's|/[^/]*\.svelte||' | sort | uniq -c | sort -rn; }

# --- content ---

do_content_all() {
    find_svelte | sort | while IFS= read -r f; do
        printf '\n%s\n' '##############################################'
        printf '### FILE : %s\n' "$f"
        printf '### LINES: %s\n' "$(wc -l < "$f")"
        printf '%s\n\n' '##############################################'
        cat "$f"
    done
}

do_linecounts()  { find_svelte | sort | xargs wc -l 2>/dev/null; }
do_totals()      { find_svelte | xargs cat | wc -lwc; }

# --- script blocks ---

do_scripts_per_file() {
    find_svelte | sort | while IFS= read -r f; do
        local block; block=$(_inner_block "$f" "script")
        if [[ -n "$block" ]]; then
            printf '\n%s\n' '════════════════════════════════════════'
            printf 'FILE  : %s\n' "$f"
            printf 'LINES : %s\n' "$(wc -l <<< "$block")"
            printf '%s\n\n' '════════════════════════════════════════'
            _extract_blocks "$f" "script"
        fi
    done
}

do_scripts_module() {
    find_svelte | sort | while IFS= read -r f; do
        local block
        block=$(perl -0777 -ne \
            'while(/<script[^>]+context=["\x27]module["\x27][^>]*>(.*?)<\/script>/sg){
                print "==> '"$f"' <==\n$&\n\n"
            }' "$f" 2>/dev/null)
        [[ -n "$block" ]] && echo "$block"
    done
}

do_scripts_typescript() {
    find_svelte | sort | while IFS= read -r f; do
        local block
        block=$(perl -0777 -ne \
            'while(/<script[^>]+lang=["\x27]ts["\x27][^>]*>(.*?)<\/script>/sg){
                print "==> '"$f"' <==\n$&\n\n"
            }' "$f" 2>/dev/null)
        [[ -n "$block" ]] && echo "$block"
    done
}

do_scripts_plainjs() {
    find_svelte | sort | while IFS= read -r f; do
        local block
        block=$(perl -0777 -ne \
            'while(/<script(?![^>]*lang=)[^>]*>(.*?)<\/script>/sg){
                print "==> '"$f"' <==\n$&\n\n"
            }' "$f" 2>/dev/null)
        [[ -n "$block" ]] && echo "$block"
    done
}

do_scripts_matrix() {
    printf '%-60s  %-8s  %-10s  %-8s\n' 'FILE' 'SCRIPT?' 'CTX=MOD?' 'LANG'
    printf '%s\n' '────────────────────────────────────────────────────────────────────────────────────────'
    find_svelte | sort | while IFS= read -r f; do
        local has_script=no has_mod=no lang='-' lang_val
        grep -q '<script' "$f"              && has_script=yes
        grep -qP 'context=' "$f"           && has_mod=yes
        lang_val=$(grep -oP '(?<=lang=")[^"]+|(?<=lang='"'"')[^'"'"']+' "$f" 2>/dev/null | head -1)
        [[ -n "$lang_val" ]] && lang="$lang_val"
        printf '%-60s  %-8s  %-10s  %-8s\n' "$f" "$has_script" "$has_mod" "$lang"
    done
}

do_imports_freq() {
    grep -rh --include="*.svelte" -P '^\s*import\s' "$ROOT" 2>/dev/null \
    | sed 's/^\s*//' | sort | uniq -c | sort -rn
}

do_import_sources() {
    grep -rh --include="*.svelte" "$ROOT" 2>/dev/null \
    | grep -oP "from ['\"]\\K[^'\"']+" \
    | sort | uniq -c | sort -rn
}

do_imports_external() {
    grep -rh --include="*.svelte" "$ROOT" 2>/dev/null \
    | grep -oP "from ['\"]\\K[^'\"']+" \
    | grep -vP '^[./\$@]' \
    | sort | uniq -c | sort -rn
}

do_imports_relative() {
    grep -rh --include="*.svelte" "$ROOT" 2>/dev/null \
    | grep -oP "from ['\"]\\K[^'\"']+" \
    | grep -P '^[./]|\$lib' \
    | sort | uniq -c | sort -rn
}

do_reactive()    { grep -rn --include="*.svelte" -P '^\s*\$:' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_lifecycle()   { grep -rn --include="*.svelte" -P '\b(onMount|onDestroy|beforeUpdate|afterUpdate|tick)\b' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_stores()      { grep -rn --include="*.svelte" -P 'writable|readable|derived|get\(' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_props()       { grep -rn --include="*.svelte" -P 'export\s+let\s+\w+' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_async()       { grep -rn --include="*.svelte" -P '\basync\b|\bawait\b|\{#await' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_dispatch()    { grep -rn --include="*.svelte" -P 'createEventDispatcher|dispatch\(' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_console()     { grep -rn --include="*.svelte" 'console\.' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_debugger()    { grep -rn --include="*.svelte" -w 'debugger' "$ROOT" 2>/dev/null | sort || echo "(none)"; }

# --- style blocks ---

do_styles_per_file() {
    find_svelte | sort | while IFS= read -r f; do
        local block; block=$(_inner_block "$f" "style")
        if [[ -n "$block" ]]; then
            printf '\n%s\n' '════════════════════════════════════════'
            printf 'FILE  : %s\n' "$f"
            printf 'LINES : %s\n' "$(wc -l <<< "$block")"
            printf '%s\n\n' '════════════════════════════════════════'
            _extract_blocks "$f" "style"
        fi
    done
}

do_styles_scoped() {
    find_svelte | sort | while IFS= read -r f; do
        local block; block=$(_inner_block "$f" "style")
        [[ -n "$block" ]] && ! echo "$block" | grep -q ':global' && {
            printf '\n==> %s <==\n' "$f"
            echo "$block"
        }
    done
}

do_styles_global() {
    find_svelte | sort | while IFS= read -r f; do
        local block; block=$(_inner_block "$f" "style")
        [[ -n "$block" ]] && echo "$block" | grep -q ':global' && {
            printf '\n==> %s <==\n' "$f"
            echo "$block"
        }
    done
}

do_styles_matrix() {
    printf '%-60s  %-8s  %-8s  %-8s  %s\n' 'FILE' 'STYLE?' 'GLOBAL?' 'LINES' 'SELECTORS'
    printf '%s\n' '──────────────────────────────────────────────────────────────────────────────────────────────'
    find_svelte | sort | while IFS= read -r f; do
        local has_style=no has_global=no slines=0 sel_count=0 block
        block=$(_inner_block "$f" "style")
        if [[ -n "$block" ]]; then
            has_style=yes
            slines=$(wc -l <<< "$block")
            sel_count=$(echo "$block" | grep -cP '^\s*[.#a-zA-Z&:*\[]' 2>/dev/null || echo 0)
            echo "$block" | grep -q ':global' && has_global=yes
        fi
        printf '%-60s  %-8s  %-8s  %-8s  %s\n' "$f" "$has_style" "$has_global" "$slines" "$sel_count"
    done
}

do_css_selectors() {
    find_svelte | sort | while IFS= read -r f; do
        _inner_block "$f" "style"
    done | grep -oP '^\s*[.#]?[a-zA-Z][a-zA-Z0-9_:-]*(?=\s*[{,])' \
         | sed 's/^\s*//' | sort | uniq -c | sort -rn | head -60
}

do_css_vars()            { grep -rn --include="*.svelte" -P -- '--[a-zA-Z][\w-]+\s*[:;]' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_hardcoded_px()        { grep -rn --include="*.svelte" -P '\b\d+px\b' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_hardcoded_colors()    { grep -rn --include="*.svelte" -P '#[0-9a-fA-F]{3,8}\b|rgb[a]?\s*\(|hsl[a]?\s*\(' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_important()           { grep -rn --include="*.svelte" '!important' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_inline_styles()       { grep -rn --include="*.svelte" -P 'style="' "$ROOT" 2>/dev/null | sort || echo "(none)"; }

# --- block duplication ---

do_dupe_script_blocks() {
    declare -A files_by_hash
    declare -A count_by_hash
    while IFS= read -r f; do
        local block hash
        block=$(_inner_block "$f" "script")
        [[ -z "$block" ]] && continue
        hash=$(_md5short "$block")
        files_by_hash[$hash]="${files_by_hash[$hash]:-} $f"
        count_by_hash[$hash]=$(( ${count_by_hash[$hash]:-0} + 1 ))
    done < <(find_svelte | sort)

    local found=0
    for hash in "${!count_by_hash[@]}"; do
        [[ ${count_by_hash[$hash]} -gt 1 ]] && {
            printf 'HASH=%s  (%d copies): %s\n' "$hash" "${count_by_hash[$hash]}" "${files_by_hash[$hash]}"
            found=1
        }
    done
    [[ $found -eq 0 ]] && echo "(no duplicate script blocks found)"
}

do_dupe_style_blocks() {
    declare -A files_by_hash
    declare -A count_by_hash
    while IFS= read -r f; do
        local block hash
        block=$(_inner_block "$f" "style")
        [[ -z "$block" ]] && continue
        hash=$(_md5short "$block")
        files_by_hash[$hash]="${files_by_hash[$hash]:-} $f"
        count_by_hash[$hash]=$(( ${count_by_hash[$hash]:-0} + 1 ))
    done < <(find_svelte | sort)

    local found=0
    for hash in "${!count_by_hash[@]}"; do
        [[ ${count_by_hash[$hash]} -gt 1 ]] && {
            printf 'HASH=%s  (%d copies): %s\n' "$hash" "${count_by_hash[$hash]}" "${files_by_hash[$hash]}"
            found=1
        }
    done
    [[ $found -eq 0 ]] && echo "(no duplicate style blocks found)"
}

do_dupe_files() {
    find_svelte | sort | xargs md5sum 2>/dev/null \
    | awk '{ h[$1]=h[$1] " " $2; n[$1]++ }
           END { for (k in n) if (n[k]>1) printf "%d copies [%s]: %s\n", n[k], k, h[k] }' \
    | sort -rn \
    || echo "(md5sum unavailable)"
}

do_dupe_imports() {
    grep -rh --include="*.svelte" -P '^\s*import\s' "$ROOT" 2>/dev/null \
    | sed 's/^\s*//' | sort | uniq -c | sort -rn | awk '$1>1' | head -30 \
    || echo "(none)"
}

do_dupe_css_selectors() {
    find_svelte | sort | while IFS= read -r f; do
        _inner_block "$f" "style"
    done \
    | grep -oP '^\s*[.#&]?[a-zA-Z][a-zA-Z0-9_:()-]*(?=\s*[{,])' \
    | sed 's/^\s*//' | sort | uniq -c | sort -rn | awk '$1>1' | head -40 \
    || echo "(none)"
}

do_dupe_css_declarations() {
    find_svelte | sort | while IFS= read -r f; do
        _inner_block "$f" "style"
    done \
    | grep -oP '[\w-]+\s*:\s*[^;{}]+;' \
    | sed 's/^\s*//' | sort | uniq -c | sort -rn | awk '$1>1' | head -40 \
    || echo "(none)"
}

do_dupe_reactive() {
    grep -rh --include="*.svelte" -P '^\s*\$:\s*.+' "$ROOT" 2>/dev/null \
    | sed 's/^\s*//' | sort | uniq -c | sort -rn | awk '$1>1' | head -30 \
    || echo "(none)"
}

do_dupe_markup_lines() {
    find_svelte | sort | while IFS= read -r f; do
        perl -0777 -pe 's/<script[^>]*>.*?<\/script>//sg; s/<style[^>]*>.*?<\/style>//sg' "$f" 2>/dev/null
    done | sed 's/^\s*//' | grep -v '^[[:space:]]*$' | sort | uniq -c | sort -rn | head -30
}

do_dupe_prop_names() {
    grep -rh --include="*.svelte" -P 'export\s+let\s+\K\w+' "$ROOT" 2>/dev/null \
    | sort | uniq -c | sort -rn | awk '$1>1' | head -30 \
    || echo "(none)"
}

# --- html / template ---

do_html_clean() {
    find_svelte | sort | while IFS= read -r f; do
        local stripped
        stripped=$(perl -0777 -pe 's/<script[^>]*>.*?<\/script>//sg; s/<style[^>]*>.*?<\/style>//sg' "$f" 2>/dev/null)
        [[ -n "$(echo "$stripped" | tr -d '[:space:]')" ]] && {
            printf '\n==> %s <==\n' "$f"
            echo "$stripped"
        }
    done
}

do_control_flow()   { grep -rn --include="*.svelte" -P '\{#(if|each|await|key)|\{:(else|then|catch)|\{\/(if|each|await|key)' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_events()         { grep -rn --include="*.svelte" -P 'on:[a-zA-Z]+' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_bindings()       { grep -rn --include="*.svelte" -P 'bind:[a-zA-Z]+' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_transitions()    { grep -rn --include="*.svelte" -P '(transition|in|out|animate):[a-zA-Z]+' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_use_directives() { grep -rn --include="*.svelte" -P 'use:[a-zA-Z]+' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_slots()          { grep -rn --include="*.svelte" -P '<slot|slot=' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_svelte_elems()   { grep -rn --include="*.svelte" '<svelte:' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_a11y()           { grep -rn --include="*.svelte" -P 'aria-[a-z]+|role=|tabindex=' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_img_no_alt()     { grep -rn --include="*.svelte" -P '<img(?![^>]*\balt=)[^>]*>' "$ROOT" 2>/dev/null | sort || echo "(all imgs have alt)"; }
do_empty_elems()    { grep -rn --include="*.svelte" -P '<(div|span)>\s*</(div|span)>' "$ROOT" 2>/dev/null | sort || echo "(none)"; }

# --- quality ---

do_todos()          { grep -rn --include="*.svelte" -iP 'TODO|FIXME|HACK|XXX|REVIEW|NOTE:' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_ts_smells()      { grep -rn --include="*.svelte" -P '@ts-ignore|@ts-expect-error|:\s*any\b' "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_long_lines()     { grep -rn --include="*.svelte" -P '.{121}' "$ROOT" 2>/dev/null | head -40 || echo "(none)"; }
do_div_soup()       { grep -rc --include="*.svelte" '<div' "$ROOT" 2>/dev/null | awk -F: '$2>10 {print $2" "$1}' | sort -rn | head -20 || echo "(none)"; }
do_env_vars()       { grep -rn --include="*.svelte" -P 'import\.meta\.env\.|process\.env\.' "$ROOT" 2>/dev/null | sort || echo "(none)"; }

# --- dependencies ---

do_store_imports()    { grep -rn --include="*.svelte" -P "from ['\"].*store" "$ROOT" 2>/dev/null | sort || echo "(none)"; }
do_comp_imports()     { grep -rn --include="*.svelte" -P "import .+\.svelte" "$ROOT" 2>/dev/null | sort || echo "(none)"; }

do_npm_packages() {
    grep -rh --include="*.svelte" "$ROOT" 2>/dev/null \
    | grep -oP "from ['\"]\\K[^'\"']+" \
    | grep -vP '^[./\$@]' \
    | sort | uniq -c | sort -rn
}

do_import_counts() {
    find_svelte | sort | while IFS= read -r f; do
        local c; c=$(grep -cP 'import ' "$f" 2>/dev/null || echo 0)
        printf '%3d  %s\n' "$c" "$f"
    done | sort -rn
}

do_urls() { grep -rn --include="*.svelte" -P 'https?://[^\s"'"'"'>]+' "$ROOT" 2>/dev/null | sort || echo "(none)"; }

# --- similarity groups ---

do_script_sizes() {
    find_svelte | sort | while IFS= read -r f; do
        local block; block=$(_inner_block "$f" "script")
        [[ -n "$block" ]] && printf '%4d  %s\n' "$(wc -l <<< "$block")" "$f"
    done | sort -rn
}

do_style_sizes() {
    find_svelte | sort | while IFS= read -r f; do
        local block; block=$(_inner_block "$f" "style")
        [[ -n "$block" ]] && printf '%4d  %s\n' "$(wc -l <<< "$block")" "$f"
    done | sort -rn
}

do_props_grouped() {
    grep -rn --include="*.svelte" -P 'export\s+let\s+\w+' "$ROOT" 2>/dev/null \
    | sed 's/\(.*\):.*export let \([a-zA-Z_]\+\).*/\2 \1/' \
    | sort \
    | awk 'prev!=$1{if(prev) print ""; printf "PROP: %s\n",$1; prev=$1} {print "  "$2}'
}

do_events_grouped() {
    grep -rn --include="*.svelte" -oP 'on:[a-zA-Z]+' "$ROOT" 2>/dev/null \
    | awk -F: 'NF>=3{key=$NF; sub(/on:/,"",key); print key, $1":"$2}' \
    | sort \
    | awk 'prev!=$1{if(prev) print ""; printf "EVENT: %s\n",$1; prev=$1} {print "  "$2}'
}

do_cssvar_defined() {
    grep -rn --include="*.svelte" -oP -- '--[a-zA-Z][\w-]+(?=\s*:)' "$ROOT" 2>/dev/null \
    | sort | uniq -c | sort -rn | head -40 \
    || echo "(none)"
}

do_cssvar_used() {
    grep -rn --include="*.svelte" -oP 'var\(--[^)]+\)' "$ROOT" 2>/dev/null \
    | sort | uniq -c | sort -rn | head -40 \
    || echo "(none)"
}

do_component_usage() {
    grep -roh --include="*.svelte" -P '<[A-Z][a-zA-Z]+' "$ROOT" 2>/dev/null \
    | sed 's/.*:<//' | sort | uniq -c | sort -rn \
    || echo "(none)"
}

# --- metrics ---

do_metrics() {
    printf '# ============================================================\n'
    printf '# SVELTE PROJECT METRICS\n'
    printf '# Generated: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '# Project  : %s\n' "$ROOT"
    printf '# ============================================================\n\n'

    local total_lines
    total_lines=$(find_svelte | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
    printf '## Overview\n'
    printf '  .svelte files       : %d\n' "$FILE_COUNT"
    printf '  Total lines         : %s\n\n' "$total_lines"

    local s_count st_count
    s_count=$(find_svelte | xargs grep -l '<script' 2>/dev/null | wc -l | tr -d ' ')
    st_count=$(find_svelte | xargs grep -l '<style' 2>/dev/null | wc -l | tr -d ' ')
    printf '## Block presence\n'
    printf '  With <script>       : %s / %d\n' "$s_count" "$FILE_COUNT"
    printf '  With <style>        : %s / %d\n\n' "$st_count" "$FILE_COUNT"

    printf '## Top 10 largest files\n'
    find_svelte | xargs wc -l 2>/dev/null | sort -rn | grep -v total | head -10 \
    | awk '{printf "  %5d  %s\n", $1, $2}'
    printf '\n'

    printf '## Directory breakdown\n'
    find_svelte | sed 's|/[^/]*\.svelte||' | sort | uniq -c | sort -rn \
    | awk '{printf "  %3d  %s\n", $1, $2}'
    printf '\n'

    printf '## Smell indicators\n'
    local console_c important_c px_c alt_c todo_c ts_c debugger_c
    console_c=$(  grep -rc --include="*.svelte" 'console\.'  "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    important_c=$(grep -rc --include="*.svelte" '!important' "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    px_c=$(       grep -rc --include="*.svelte" -P '\d+px'   "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    alt_c=$(      grep -rc --include="*.svelte" -P '<img(?![^>]*alt=)' "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    todo_c=$(     grep -rc --include="*.svelte" -iP 'TODO|FIXME|HACK' "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    ts_c=$(       grep -rc --include="*.svelte" '@ts-ignore'  "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    debugger_c=$( grep -rc --include="*.svelte" 'debugger'   "$ROOT" 2>/dev/null | awk -F: '$2>0{s+=$2}END{print s+0}')
    printf '  console.*()         : %s\n' "$console_c"
    printf '  !important          : %s\n' "$important_c"
    printf '  Hardcoded px        : %s\n' "$px_c"
    printf '  <img> without alt   : %s\n' "$alt_c"
    printf '  TODO/FIXME/HACK     : %s\n' "$todo_c"
    printf '  @ts-ignore          : %s\n' "$ts_c"
    printf '  debugger statements : %s\n' "$debugger_c"
}

# =============================================================================
# ZOMBIE DETECTION  (single-pass: build reference set first, then diff)
# =============================================================================

section_zombies() {
    header "9 · ZOMBIE & ORPHAN DETECTION"
    local zombie_log="$LOG_DIR/90_zombie_components.log"
    local start_t end_t elapsed

    {
        printf '# ZOMBIE COMPONENT SCANNER\n'
        printf '# Date   : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
        printf '# Method : single grep pass → extract all referenced names → diff vs found files\n'
        printf '# Note   : +page/+layout/+error (SvelteKit routes) are skipped\n'
        printf '# Note   : false positives possible for dynamic/string imports\n\n'
    } > "$zombie_log"

    start_t=$(date +%s%N)

    # --- Step 1: collect every .svelte component name (basename, no extension) ---
    # excluding SvelteKit route files (+page, +layout, +error, etc.)
    local all_components=()
    local all_paths=()
    while IFS= read -r filepath; do
        local name; name=$(basename "$filepath" .svelte)
        [[ "$name" == +* ]] && continue
        all_components+=("$name")
        all_paths+=("$filepath")
    done < <(find_svelte | sort)

    local total_components=${#all_components[@]}

    if [[ $total_components -eq 0 ]]; then
        echo "(no non-route components found)" >> "$zombie_log"
        return
    fi

    # --- Step 2: ONE grep pass over all source files, extract every token that
    #             looks like a component reference. We look for:
    #               <ComponentName[ >/]   — JSX/Svelte tag usage
    #               import ComponentName  — named import
    #               "ComponentName"       — string reference (dynamic import etc)
    # We pipe through sort -u so the reference set is a sorted unique list. ---
    log "  Building reference index (1 grep pass over all sources)..."

    local ref_tmp; ref_tmp=$(mktemp)

    # grep returns exit 1 when nothing matches; that's fine, so || true
    grep -roh \
        --include="*.svelte" --include="*.ts" \
        --include="*.js"     --include="*.html" \
        -P '(?<=<)[A-Z][a-zA-Z0-9]+(?=[\s>/])|(?<=import\s)[A-Z][a-zA-Z0-9]+|(?<=["\x27])[A-Z][a-zA-Z0-9]+(?=["\x27])' \
        "$ROOT" 2>/dev/null \
    | sed 's/.*://' \
    | sort -u > "$ref_tmp" || true

    local ref_count; ref_count=$(wc -l < "$ref_tmp" | tr -d ' ')
    log "  Reference index: ${ref_count} unique names found"

    # --- Step 3: for each component, check membership in the reference set ---
    local zombie_count=0 used_count=0

    printf '%-50s  %s\n' 'COMPONENT' 'STATUS' >> "$zombie_log"
    printf '%s\n' '─────────────────────────────────────────────────────────────────' >> "$zombie_log"

    local i
    for (( i=0; i<total_components; i++ )); do
        local name="${all_components[$i]}"
        local filepath="${all_paths[$i]}"

        if grep -qxF "$name" "$ref_tmp" 2>/dev/null; then
            ((used_count++)) || true
            # uncomment the next line to also log confirmed-used components:
            # printf '%-50s  USED\n' "$filepath" >> "$zombie_log"
        else
            printf '%-50s  UNUSED\n' "$filepath" >> "$zombie_log"
            ((zombie_count++)) || true
        fi
    done

    rm -f "$ref_tmp"

    end_t=$(date +%s%N)
    elapsed=$(( (end_t - start_t) / 1000000 ))

    {
        printf '\n%s\n' '─────────────────────────────────────────────────────────────────'
        printf 'Total components scanned : %d\n' "$total_components"
        printf 'Used (referenced)        : %d\n' "$used_count"
        printf 'Potentially unused       : %d\n' "$zombie_count"
        printf 'Scan time                : %dms\n' "$elapsed"
    } >> "$zombie_log"

    ((TASK_COUNT++)) || true
    printf '✓   %-50s %6dms  %s\n' "Zombie Components" "$elapsed" "90_zombie_components.log" >> "$SUMMARY"
    log "Zombie scan → 90_zombie_components.log (${zombie_count} unused / ${total_components} total, ${elapsed}ms)"
}

# =============================================================================
# SECTIONS  (now just wiring; all logic is in do_* functions above)
# =============================================================================

section_structure() {
    header "1 · STRUCTURE & TREE"
    need eza && run_task "Full project tree (eza)"      "10_tree_full.log"      do_tree_full
    need eza && run_task "Svelte-only tree (eza)"       "11_tree_svelte.log"    do_tree_svelte
    run_task "File list (sorted)"                       "12_file_list.log"      do_file_list
    run_task "File sizes (lines desc)"                  "13_file_sizes.log"     do_file_sizes
    run_task "Empty / near-empty files (≤5 lines)"      "14_empty_files.log"    do_empty_files
    run_task "Recently modified (last 7 days)"          "15_recent.log"         do_recent_files
    run_task "Git status (.svelte)"                     "16_git_status.log"     do_git_status
    run_task "Git log (last 30, .svelte)"               "17_git_log.log"        do_git_log
    run_task "SvelteKit route files"                    "18_kit_routes.log"     do_kit_routes
    run_task "Components by directory"                  "19_dir_breakdown.log"  do_dir_breakdown
}

section_content() {
    header "2 · RAW CONTENT"
    run_task "All files (cat, dividers)"                "20_content_all.log"    do_content_all
    run_task "Line counts"                              "21_linecounts.log"     do_linecounts
    run_task "Total chars / words / lines"              "22_totals.log"         do_totals
    need bat && run_task "All files (bat, syntax)" "23_content_bat.log" \
        bash -c "find_svelte | sort | xargs bat --style=full --paging=never 2>/dev/null"
}

section_scripts() {
    header "3 · SCRIPT BLOCKS"
    run_task "All <script> blocks (per file)"           "30_scripts_per_file.log"   do_scripts_per_file
    run_task "<script context=module> blocks"           "31_scripts_module.log"     do_scripts_module
    run_task "TypeScript blocks (lang=ts)"              "32_scripts_typescript.log" do_scripts_typescript
    run_task "Plain JS blocks (no lang)"                "33_scripts_plainjs.log"    do_scripts_plainjs
    run_task "Script block presence matrix"             "34_scripts_matrix.log"     do_scripts_matrix
    run_task "Imports (frequency sorted)"               "35_imports_freq.log"       do_imports_freq
    run_task "Import sources (from '...')"              "36_import_sources.log"     do_import_sources
    run_task "External (npm) imports"                   "37_imports_external.log"   do_imports_external
    run_task "Relative / internal imports"              "38_imports_relative.log"   do_imports_relative
    run_task "Reactive declarations (\$:)"              "39a_reactive.log"          do_reactive
    run_task "Lifecycle hooks"                          "39b_lifecycle.log"         do_lifecycle
    run_task "Store usage"                              "39c_stores.log"            do_stores
    run_task "Exported props (export let)"              "39d_props.log"             do_props
    run_task "Async / await usage"                      "39e_async.log"             do_async
    run_task "Event dispatchers"                        "39f_dispatch.log"          do_dispatch
    run_task "console.* calls"                          "39g_console.log"           do_console
    run_task "debugger statements"                      "39h_debugger.log"          do_debugger
}

section_styles() {
    header "4 · STYLE BLOCKS"
    run_task "All <style> blocks (per file)"            "40_styles_per_file.log"    do_styles_per_file
    run_task "Scoped-only style blocks"                 "41_styles_scoped.log"      do_styles_scoped
    run_task "Blocks with :global overrides"            "42_styles_global.log"      do_styles_global
    run_task "Style block presence matrix"              "43_styles_matrix.log"      do_styles_matrix
    run_task "CSS selectors (frequency)"                "44_css_selectors.log"      do_css_selectors
    run_task "CSS custom properties (--var)"            "45_css_vars.log"           do_css_vars
    run_task "Hardcoded px values"                      "46a_hardcoded_px.log"      do_hardcoded_px
    run_task "Hardcoded colors"                         "46b_hardcoded_colors.log"  do_hardcoded_colors
    run_task "!important usages"                        "46c_important.log"         do_important
    run_task "Inline style attributes (style=)"         "47_inline_styles.log"      do_inline_styles
}

section_block_duplication() {
    header "5 · BLOCK-LEVEL DUPLICATION"
    run_task "Duplicate <script> blocks (hash)"         "50_dupe_script_blocks.log"    do_dupe_script_blocks
    run_task "Duplicate <style> blocks (hash)"          "51_dupe_style_blocks.log"     do_dupe_style_blocks
    run_task "Duplicate files (full hash)"              "52_dupe_files.log"            do_dupe_files
    run_task "Repeated import statements"               "53_dupe_imports.log"          do_dupe_imports
    run_task "Repeated CSS selectors (cross-file)"      "54_dupe_css_selectors.log"    do_dupe_css_selectors
    run_task "Repeated CSS declarations (cross-file)"   "55_dupe_css_declarations.log" do_dupe_css_declarations
    run_task "Repeated reactive declarations"           "56_dupe_reactive.log"         do_dupe_reactive
    run_task "Repeated markup lines"                    "58_dupe_markup_lines.log"     do_dupe_markup_lines
    run_task "Shared prop names (cross-file)"           "59_dupe_prop_names.log"       do_dupe_prop_names
}

section_html() {
    header "6 · TEMPLATE & HTML"
    run_task "HTML only (scripts+styles stripped)"      "60_html_clean.log"     do_html_clean
    run_task "Control flow blocks"                      "61_control_flow.log"   do_control_flow
    run_task "Event directives (on:*)"                  "62_events.log"         do_events
    run_task "Bindings (bind:*)"                        "63_bindings.log"       do_bindings
    run_task "Transitions & animations"                 "64_transitions.log"    do_transitions
    run_task "Use directives (use:*)"                   "65_use_directives.log" do_use_directives
    run_task "Slots"                                    "66_slots.log"          do_slots
    run_task "Svelte special elements (svelte:*)"       "67_svelte_elems.log"   do_svelte_elems
    run_task "Accessibility (aria-*, role=)"            "68_a11y.log"           do_a11y
    run_task "Images missing alt"                       "69a_img_no_alt.log"    do_img_no_alt
    run_task "Empty divs/spans"                         "69b_empty_elems.log"   do_empty_elems
}

section_quality() {
    header "7 · QUALITY & SMELLS"
    run_task "TODOs / FIXMEs / HACKs"                  "70_todos.log"          do_todos
    run_task "TypeScript: any / @ts-ignore"             "71_ts_smells.log"      do_ts_smells
    run_task "Long lines (>120 chars)"                  "72_long_lines.log"     do_long_lines
    run_task "Div-soup (>10 divs per file)"             "74_div_soup.log"       do_div_soup
    run_task "Env var usage"                            "75_env_vars.log"       do_env_vars
}

section_dependencies() {
    header "8 · DEPENDENCIES & COUPLING"
    run_task "Store imports"                            "80_store_imports.log"  do_store_imports
    run_task "Inter-component imports (.svelte)"        "81_comp_imports.log"   do_comp_imports
    run_task "External npm packages (by usage)"         "82_npm_packages.log"   do_npm_packages
    run_task "Import count per file (coupling)"         "83_import_counts.log"  do_import_counts
    run_task "URLs in source"                           "84_urls.log"           do_urls
}

section_similarity() {
    header "10 · SIMILARITY GROUPS"
    run_task "Script block sizes (sorted)"              "A0_script_sizes.log"   do_script_sizes
    run_task "Style block sizes (sorted)"               "A1_style_sizes.log"    do_style_sizes
    run_task "Props grouped by name"                    "A2_props_grouped.log"  do_props_grouped
    run_task "Events grouped by name"                   "A3_events_grouped.log" do_events_grouped
    run_task "CSS var definitions (frequency)"          "A4_cssvar_defined.log" do_cssvar_defined
    run_task "CSS var usages var(--...) (frequency)"    "A5_cssvar_used.log"    do_cssvar_used
    run_task "Component instantiation frequency"        "A6_comp_usage.log"     do_component_usage
}

section_metrics() {
    header "11 · METRICS"
    run_task "Project metrics report"                   "99_metrics.log"        do_metrics
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════╗"
    echo -e "║      SVELTE PROJECT AUDITOR          ║"
    echo -e "╚══════════════════════════════════════╝${RESET}"
    echo -e "${DIM}Started: $(date '+%Y-%m-%d %H:%M:%S')${RESET}\n"

    [[ -d "$ROOT" ]] || { echo "FATAL: '$ROOT' is not a directory." >&2; exit 1; }
    mkdir -p "$LOG_DIR"

    FILE_COUNT=$(find_svelte | wc -l | tr -d ' ')
    [[ "$FILE_COUNT" -eq 0 ]] && { echo "FATAL: No .svelte files under '$ROOT'." >&2; exit 1; }

    header "PRE-FLIGHT"
    log "Project root : $ROOT"
    log "Svelte files : $FILE_COUNT"
    log "Output dir   : $LOG_DIR"
    for t in eza bat perl md5sum grep find sort uniq awk wc; do
        command -v "$t" &>/dev/null && log "  ✓ $t" || warn "  ✗ $t"
    done

    {
        printf '# SVELTE AUDIT SUMMARY\n'
        printf '# Project : %s\n' "$ROOT"
        printf '# Date    : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
        printf '# Files   : %d .svelte\n\n' "$FILE_COUNT"
        printf '%-4s %-50s %8s  %s\n' 'OK?' 'Label' 'Time' 'Log File'
        printf '%s\n' '──── ────────────────────────────────────────────────── ────────  ──────────────────────'
    } > "$SUMMARY"

    section_structure
    section_content
    section_scripts
    section_styles
    section_block_duplication
    section_html
    section_quality
    section_dependencies
    section_zombies
    section_similarity
    section_metrics

    {
        printf '\n# TOTAL TASKS : %d\n' "$TASK_COUNT"
        printf '# WARNINGS    : %d\n' "$WARN_COUNT"
        printf '# COMPLETED   : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    } >> "$SUMMARY"

    echo -e "\n${GREEN}${BOLD}╔══════════════════════════════════════╗"
    echo -e "║         AUDIT COMPLETE ✓             ║"
    echo -e "╚══════════════════════════════════════╝${RESET}"
    echo -e "  Output  : ${CYAN}${LOG_DIR}/${RESET}"
    echo -e "  Summary : ${CYAN}${LOG_DIR}/00_SUMMARY.log${RESET}"
    echo -e "  Tasks   : ${BOLD}${TASK_COUNT}${RESET}"
    [[ $WARN_COUNT -gt 0 ]] \
        && echo -e "  Warnings: ${YELLOW}${BOLD}${WARN_COUNT}${RESET}" \
        || echo -e "  Warnings: ${GREEN}0${RESET}"
    echo ""
    echo -e "${DIM}Good starting points:"
    echo -e "  cat ${LOG_DIR}/99_metrics.log"
    echo -e "  cat ${LOG_DIR}/34_scripts_matrix.log"
    echo -e "  cat ${LOG_DIR}/43_styles_matrix.log"
    echo -e "  cat ${LOG_DIR}/50_dupe_script_blocks.log"
    echo -e "  cat ${LOG_DIR}/51_dupe_style_blocks.log${RESET}"
    echo ""
}

main "$@"