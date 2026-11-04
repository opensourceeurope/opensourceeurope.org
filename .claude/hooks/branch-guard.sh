#!/usr/bin/env bash
# PreToolUse guard for this repo's files. Two rules, in order:
#   1. The shared MAIN checkout (the primary worktree) is read-only for edits.
#      Topic work MUST happen in an isolated linked worktree, because the main
#      checkout's HEAD is shared and another concurrent session can switch it
#      out from under you mid-task — a commit then lands on the wrong branch.
#   2. Inside a linked worktree, edits on main/master are still denied.
# So the ONLY place edits are allowed is a linked worktree on a non-main branch.
# Enforces the worktree rule in AGENTS.md ("no changes on main; one
# worktree per topic").
#
# "This repo" is the repository $CLAUDE_PROJECT_DIR belongs to (falling back to
# the repository this hook file sits in). Only that repository's primary checkout
# is gated. A separate clone, with its own .git directory, is a different
# repository and is never gated.
#
# Must run on bash 3.2 (macOS) and with any POSIX awk (BWK, mawk, gawk).

set -u
set -f # no globbing: command words are handled as text, never expanded

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')
command_str=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# Physical path of the git common dir that <dir> belongs to.
repo_common() {
  local c
  c=$(git -C "$1" rev-parse --git-common-dir 2>/dev/null) || return 1
  [ -n "$c" ] || return 1
  (cd "$1" 2>/dev/null && cd "$c" 2>/dev/null && pwd -P)
}

# The git common dir of THIS repository.
common=""
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  common=$(repo_common "$CLAUDE_PROJECT_DIR") || common=""
fi
if [ -z "$common" ]; then
  hook_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd) || exit 0
  common=$(repo_common "$hook_dir") || exit 0
fi
[ -z "$common" ] && exit 0
primary="${common%/.git}"

# True when <dir> lies in the primary checkout of this repo: its git dir IS the
# common dir. Linked worktrees have <common>/worktrees/<name> as their git dir,
# and a separate clone has a different common dir altogether.
dir_gated() {
  local gd
  [ -n "$1" ] && [ -d "$1" ] || return 1
  gd=$(git -C "$1" rev-parse --absolute-git-dir 2>/dev/null) || return 1
  gd=$(cd "$gd" 2>/dev/null && pwd -P) || return 1
  [ "$gd" = "$common" ]
}

# True when <dir> lies in any checkout (primary or linked) of this repo.
dir_in_repo() {
  local c
  [ -n "$1" ] && [ -d "$1" ] || return 1
  c=$(repo_common "$1") || return 1
  [ "$c" = "$common" ]
}

# ---------------------------------------------------------------------------
# Bash branch. The file-edit matchers below cover Edit/Write/MultiEdit, but a
# heredoc, `sed -i`, or `git switch` through Bash would mutate the shared main
# checkout unguarded. The policy is deliberately narrow and FAILS OPEN: it denies
# only unmistakable mutations of the primary checkout (plus moving or pushing
# main from anywhere in this repo), because a false denial is more damaging than
# a miss. Anything it cannot parse (a `cd "$VAR"`, a quoted path with spaces)
# counts as "somewhere else".
# ---------------------------------------------------------------------------

# Strips what the shell would never execute or redirect: heredoc bodies, quoted
# strings and comments. Prints the sanitized command, then each quoted string,
# all separated by \036. A quoted string made only of path-safe characters is
# kept inline without its quotes (so `> "README.md"` is still seen); any other is
# replaced by the token @Q<n>@ (1-based index into the quoted strings).
SANITIZE_AWK='
function emit_q(content) {
  qn++; q[qn] = content
  if (content ~ /^[A-Za-z0-9_.\/$@{}:+,=~%-]*$/ && content !~ /@Q/) out = out content
  else out = out "@Q" qn "@"
}
{ s = s $0 "\n" }
END {
  n = length(s); i = 1; out = ""; qn = 0; hn = 0
  while (i <= n) {
    c = substr(s, i, 1)
    if (c == "\\") {
      if (substr(s, i + 1, 1) == "\n") out = out " "; else out = out "_"
      i += 2; continue
    }
    if (c == "\047") {
      rest = substr(s, i + 1); j = index(rest, "\047")
      if (j == 0) { emit_q(rest); i = n + 1 } else { emit_q(substr(rest, 1, j - 1)); i += j + 1 }
      continue
    }
    if (c == "\"") {
      j = i + 1; content = ""
      while (j <= n) {
        d = substr(s, j, 1)
        if (d == "\\") { content = content substr(s, j, 2); j += 2; continue }
        if (d == "\"") break
        content = content d; j++
      }
      emit_q(content); i = j + 1; continue
    }
    if (c == "#" && (i == 1 || substr(s, i - 1, 1) ~ /[ \t\n;&|(]/)) {
      while (i <= n && substr(s, i, 1) != "\n") i++
      continue
    }
    if (c == "<" && substr(s, i + 1, 1) == "<" && substr(s, i + 2, 1) != "<") {
      i += 2; strip = 0
      if (substr(s, i, 1) == "-") { strip = 1; i++ }
      while (substr(s, i, 1) ~ /[ \t]/) i++
      delim = ""
      while (i <= n) {
        d = substr(s, i, 1)
        if (d ~ /[ \t\n;&|<>()]/) break
        if (d != "\047" && d != "\"" && d != "\\") delim = delim d
        i++
      }
      hn++; hd[hn] = delim; hs[hn] = strip
      out = out " <<H "
      continue
    }
    if (c == "\n") {
      out = out " ; "; i++
      for (k = 1; k <= hn; k++) {
        while (i <= n) {
          e = index(substr(s, i), "\n")
          if (e == 0) { line = substr(s, i); i = n + 1 } else { line = substr(s, i, e - 1); i += e }
          if (hs[k]) sub(/^\t+/, "", line)
          if (line == hd[k]) break
        }
      }
      hn = 0
      continue
    }
    out = out c; i++
  }
  printf "%s%c", out, 30
  for (k = 1; k <= qn; k++) printf "%s%c", q[k], 30
}'

# Resolve a `cd`/`git -C` target against <base>. Fails for anything that is not a
# literal, existing directory ($VAR, a quoted path with spaces, a typo).
resolve_dir() { # target, base
  local t=$1 base=$2
  case "$t" in
    '') t=$HOME ;;
    '~') t=$HOME ;;
    '~/'*) t="$HOME/${t#\~/}" ;;
    *'$'*|*@Q*|*'`'*|-) return 1 ;;
  esac
  case "$t" in
    /*) ;;
    *) [ -n "$base" ] || return 1; t="$base/$t" ;;
  esac
  (cd "$t" 2>/dev/null && pwd -P)
}

# True when a file path (relative to <base>) lands in the primary checkout. The
# file need not exist: its nearest existing ancestor decides.
path_in_primary() { # target, base
  local t=$1 base=$2 a
  case "$t" in
    ''|*'$'*|*@Q*|*@FD@*|*'`'*) return 1 ;;
    '~'|'~/'*) t="$HOME${t#\~}" ;;
  esac
  case "$t" in
    /*) ;;
    *) [ -n "$base" ] || return 1; t="$base/$t" ;;
  esac
  a=$t
  while [ ! -e "$a" ] && [ "$a" != "/" ] && [ "$a" != "." ]; do a=$(dirname "$a"); done
  [ -d "$a" ] || a=$(dirname "$a")
  dir_gated "$a"
}

bash_deny() {
  deny "Worktree rule violation: \`$1\` mutates the SHARED main checkout (or the main branch), which is read-only. Bash is not an exemption from the worktree rule — the main checkout's HEAD is shared across sessions and can be switched out from under you mid-task, and main only changes through a pull request. Create a worktree and run this there instead: .claude/scripts/worktree.sh new <topic>. See AGENTS.md."
}

is_main_ref() {
  case "$1" in main|master|refs/heads/main|refs/heads/master) return 0 ;; esac
  return 1
}

# One git invocation: the words after `git`. Uses $cur_dir and $seg_label.
check_git() {
  local gdir=$cur_dir verb a dest nonopt force gated=1 inrepo=1 branch
  while [ $# -gt 0 ]; do
    case "$1" in
      -C) gdir=$(resolve_dir "${2:-}" "$gdir") || gdir=""; shift; [ $# -gt 0 ] && shift ;;
      -c|--git-dir|--work-tree|--namespace|--exec-path)
        case "$1" in --git-dir|--work-tree) gdir="" ;; esac
        shift; [ $# -gt 0 ] && shift ;;
      --git-dir=*|--work-tree=*) gdir=""; shift ;;
      -*) shift ;;
      *) break ;;
    esac
  done
  [ $# -gt 0 ] || return 0
  verb=$1; shift
  dir_gated "$gdir" && gated=0
  dir_in_repo "$gdir" && inrepo=0

  # Anywhere in this repo: never push to main, never move or delete main by hand.
  if [ "$inrepo" -eq 0 ]; then
    case "$verb" in
      push)
        nonopt=0
        while [ $# -gt 0 ]; do
          case "$1" in
            -o|--push-option|--repo|--receive-pack|--exec) shift ;;
            -*) ;;
            *)
              nonopt=$((nonopt + 1))
              if [ "$nonopt" -ge 2 ]; then
                dest=${1##*:}; dest=${dest#+}
                is_main_ref "$dest" && bash_deny "$seg_label"
              fi
              ;;
          esac
          [ $# -gt 0 ] && shift
        done
        # A bare `git push [remote]` pushes the current branch.
        if [ "$nonopt" -lt 2 ] && [ "$gated" -eq 0 ]; then
          branch=$(git -C "$gdir" rev-parse --abbrev-ref HEAD 2>/dev/null)
          is_main_ref "$branch" && bash_deny "$seg_label"
        fi
        return 0
        ;;
      branch)
        force=1
        for a in "$@"; do
          case "$a" in
            --force|--delete|--move|--copy) force=0 ;;
            --*) ;;
            -*[fMmDdCc]*) force=0 ;;
          esac
        done
        if [ "$force" -eq 0 ]; then
          for a in "$@"; do is_main_ref "$a" && bash_deny "$seg_label"; done
        fi
        ;;
      update-ref)
        for a in "$@"; do is_main_ref "$a" && bash_deny "$seg_label"; done
        ;;
    esac
  fi

  # In the primary checkout: nothing that moves HEAD, stages or rewrites history.
  # `git worktree …` is deliberately absent: creating a worktree is the
  # sanctioned escape hatch. Read-only verbs (status, log, diff, fetch …) pass.
  if [ "$gated" -eq 0 ]; then
    case "$verb" in
      switch|checkout|add|commit|merge|rebase|reset|restore|apply|cherry-pick|revert|am|pull|rm|mv|clean)
        bash_deny "$seg_label" ;;
      stash)
        case "${1:-}" in list|show) ;; *) bash_deny "$seg_label" ;; esac ;;
    esac
  fi
  return 0
}

# Analyse a command string that starts in <dir>. Recurses into `bash -c '…'` and
# `eval '…'` once or twice; deeper nesting fails open.
analyze() { # command, start dir, depth
  local cmd_text=$1 cur_dir=$2 depth=$3
  local san="" first=1 item segs seg seg_label t i cmd a last nonopt
  local -a q=() w=() args=()
  [ "$depth" -gt 2 ] && return 0

  while IFS= read -r -d $'\036' item; do
    if [ "$first" -eq 1 ]; then san=$item; first=0; else q+=("$item"); fi
  done < <(printf '%s' "$cmd_text" | awk "$SANITIZE_AWK")

  # One command per line: split on ; && || | & ( ) and backticks, after
  # protecting the & in fd redirections (2>&1, &>file).
  segs=$(printf '%s' "$san" | sed -e 's/&>/>/g' -e 's/>|/>/g' -e 's/>&/>@FD@/g' -e 's/|&/|/g' -e 's/&&/;/g' -e 's/||/;/g' | tr ';&|()`' '\n\n\n\n\n\n')

  while IFS= read -r seg; do
    w=()
    read -r -a w <<< "$seg"
    [ ${#w[@]} -eq 0 ] && continue
    seg_label=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//' | cut -c1-60)

    # Output redirections into the primary checkout.
    for t in $(printf '%s' "$seg" | grep -oE '>>?[[:space:]]*[^[:space:]<>]+' | sed -E 's/^>>?[[:space:]]*//'); do
      path_in_primary "$t" "$cur_dir" && bash_deny "redirection into $t"
    done

    # Skip keywords, wrappers and leading VAR=value assignments.
    i=0
    while [ "$i" -lt ${#w[@]} ]; do
      case "${w[$i]}" in
        '{'|'}'|'!'|then|do|else|elif|if|while|until|time|command|builtin|exec|nohup|sudo|env|xargs) i=$((i + 1)) ;;
        [A-Za-z_]*=*) i=$((i + 1)) ;;
        *) break ;;
      esac
    done
    [ "$i" -lt ${#w[@]} ] || continue
    cmd=${w[$i]##*/}
    args=("${w[@]:$((i + 1))}")

    case "$cmd" in
      cd|pushd)
        t=""
        for a in ${args[@]+"${args[@]}"}; do
          case "$a" in -P|-L|-e|-@) ;; *) t=$a; break ;; esac
        done
        # An unresolvable target counts as "elsewhere", never as the primary.
        cur_dir=$(resolve_dir "$t" "$cur_dir") || cur_dir=""
        ;;
      git)
        check_git ${args[@]+"${args[@]}"}
        ;;
      sed|perl)
        for a in ${args[@]+"${args[@]}"}; do
          case "$a" in
            -i*|--in-place*|-pi*|-ni*)
              [ -n "$cur_dir" ] && dir_gated "$cur_dir" && bash_deny "$seg_label"
              for t in ${args[@]+"${args[@]}"}; do
                case "$t" in -*) ;; *) path_in_primary "$t" "$cur_dir" && bash_deny "$seg_label" ;; esac
              done
              ;;
          esac
        done
        ;;
      tee|truncate)
        for a in ${args[@]+"${args[@]}"}; do
          case "$a" in -*) ;; *) path_in_primary "$a" "$cur_dir" && bash_deny "$seg_label" ;; esac
        done
        ;;
      dd)
        for a in ${args[@]+"${args[@]}"}; do
          case "$a" in of=*) path_in_primary "${a#of=}" "$cur_dir" && bash_deny "$seg_label" ;; esac
        done
        ;;
      cp|mv|install|ln|rsync)
        last="" nonopt=0
        for a in ${args[@]+"${args[@]}"}; do
          case "$a" in
            --target-directory=*) path_in_primary "${a#*=}" "$cur_dir" && bash_deny "$seg_label" ;;
            -*) ;;
            *)
              last=$a; nonopt=$((nonopt + 1))
              # mv also removes its sources.
              [ "$cmd" = mv ] && path_in_primary "$a" "$cur_dir" && bash_deny "$seg_label"
              ;;
          esac
        done
        # -t <dir> names the destination up front.
        for ((a = 0; a < ${#args[@]}; a++)); do
          [ "${args[$a]}" = "-t" ] && path_in_primary "${args[$((a + 1))]:-}" "$cur_dir" && bash_deny "$seg_label"
        done
        [ "$nonopt" -ge 2 ] && path_in_primary "$last" "$cur_dir" && bash_deny "$seg_label"
        ;;
      bash|sh|zsh|dash)
        for ((a = 0; a < ${#args[@]}; a++)); do
          if [ "${args[$a]}" = "-c" ]; then
            t=${args[$((a + 1))]:-}
            case "$t" in
              @Q*@) t=${t#@Q}; t=${t%@}; analyze "${q[$((t - 1))]:-}" "$cur_dir" $((depth + 1)) ;;
              ?*) analyze "$t" "$cur_dir" $((depth + 1)) ;;
            esac
            break
          fi
        done
        ;;
      eval)
        t=""
        for a in ${args[@]+"${args[@]}"}; do
          case "$a" in @Q*@) a=${a#@Q}; a=${a%@}; a=${q[$((a - 1))]:-} ;; esac
          t="$t $a"
        done
        analyze "$t" "$cur_dir" $((depth + 1))
        ;;
    esac
  done <<< "$segs"
  return 0
}

if [ -z "$file" ] && [ -n "$command_str" ]; then
  cwd=$(printf '%s' "$payload" | jq -r '.cwd // ""')
  [ -z "$cwd" ] && cwd="$PWD"
  cwd=$(cd "$cwd" 2>/dev/null && pwd -P) || cwd=""
  analyze "$command_str" "$cwd" 0
  exit 0
fi

[ -z "$file" ] && exit 0

# The file may not exist yet (new file). Walk up to its nearest existing ancestor dir.
dir=$(dirname "$file")
while [ ! -d "$dir" ] && [ "$dir" != "/" ] && [ "$dir" != "." ]; do
  dir=$(dirname "$dir")
done
[ -d "$dir" ] || exit 0

# Identify the repo (shared object store) that owns the file, via its git-common-dir.
# All worktrees of one repo share a common-dir, so this is stable across worktrees.
file_common=$(repo_common "$dir") || exit 0

# Only gate files belonging to THIS repo (any of its worktrees). Anything else,
# including a separate clone of the same project, passes.
[ "$file_common" != "$common" ] && exit 0

# Is the file in the PRIMARY checkout? Primary worktree: git-dir == git-common-dir.
# Linked worktrees have git-dir = <common>/worktrees/<name>, which differs.
if dir_gated "$dir"; then
  deny "Worktree rule violation: this file is in the SHARED main checkout, which is read-only for edits. The main checkout's HEAD is shared across sessions and can be switched out from under you mid-task, so commits land on the wrong branch. Do topic work in an isolated worktree instead: .claude/scripts/worktree.sh new <topic>, then open that .worktrees/<topic> folder and work there. See AGENTS.md."
fi

# Linked worktree: deny on main/master, allow on a topic branch.
branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null)
case "$branch" in
  main|master)
    deny "Worktree rule violation: the worktree owning this file is on branch \"$branch\". No changes on main — every change goes through a branch + PR. Create a fresh topic worktree: .claude/scripts/worktree.sh new <topic>. See AGENTS.md."
    ;;
esac

exit 0
