#!/usr/bin/env bash
# Boekhouding voor .github/workflows/release-verify.yml (issue #429).
# Elke job draait ALLE controles; een controle die faalt stopt de job niet.
# Pas `finish` beslist: tabel naar $GITHUB_STEP_SUMMARY en exit 1 als er een
# controle FOUT is en RELEASE_VERIFY_STRICT=1 (release/dispatch). Bij een PR
# (rapportmodus, STRICT=0) blijft de job dan groen. Een crash of ontbrekende
# tool hoort NIET via deze helper te lopen maar als gewone stap te falen.
#
#   release-check.sh run    "<naam>" <cmd...>          OK als cmd exit 0 geeft
#   release-check.sh alive  "<naam>" <sec> <cmd...>    start cmd, OK als het na <sec> s nog leeft
#   release-check.sh record OK|FOUT|INFO "<naam>" "<detail>"
#   release-check.sh finish "<titel>"
set -uo pipefail

LOG="${RELEASE_CHECKS:-${RUNNER_TEMP:-/tmp}/release-checks.tsv}"

clean() { tr '\t\r\n|' '    ' | cut -c1-240; }

record() {
  local status="$1" name="$2" detail="${3:-}"
  printf '%s\t%s\t%s\n' "$status" "$(printf '%s' "$name" | clean)" "$(printf '%s' "$detail" | clean)" >> "$LOG"
  echo "[$status] $name${detail:+ — $detail}"
}

last_line() { grep -v '^[[:space:]]*$' "$1" | tail -n 1; }

cmd="${1:?subcommando ontbreekt}"; shift
case "$cmd" in
  record)
    record "$@"
    ;;
  run)
    name="$1"; shift
    out="$(mktemp)"
    "$@" >"$out" 2>&1; rc=$?
    echo "::group::$name"; cat "$out"; echo "::endgroup::"
    if [ "$rc" -eq 0 ]; then record OK "$name" "$(last_line "$out")"
    else record FOUT "$name" "exit $rc: $(last_line "$out")"; fi
    ;;
  alive)
    name="$1"; secs="$2"; shift 2
    out="$(mktemp)"
    "$@" >"$out" 2>&1 &
    pid=$!
    sleep "$secs"
    if kill -0 "$pid" 2>/dev/null; then
      record OK "$name" "proces leeft na ${secs} s"
      pkill -TERM -P "$pid" 2>/dev/null; kill -TERM "$pid" 2>/dev/null
      sleep 3
      pkill -KILL -P "$pid" 2>/dev/null; kill -KILL "$pid" 2>/dev/null
    else
      wait "$pid"; rc=$?
      record FOUT "$name" "proces stopte binnen ${secs} s (exit $rc): $(last_line "$out")"
    fi
    echo "::group::$name (uitvoer)"; cat "$out"; echo "::endgroup::"
    ;;
  finish)
    title="${1:-Releaseverificatie}"
    if [ ! -s "$LOG" ]; then
      echo "::error::geen enkele controle vastgelegd in $LOG" >&2
      exit 2
    fi
    fails="$(tr -d '\r' < "$LOG" | grep -c '^FOUT' || true)"
    {
      echo "## $title"
      echo
      if [ "$fails" -eq 0 ]; then echo "**Oordeel: OK**"; else echo "**Oordeel: FOUT** — $fails controle(s) faalden."; fi
      if [ "${RELEASE_VERIFY_STRICT:-1}" != "1" ]; then echo; echo "_Rapportmodus (pull_request): een FOUT maakt deze job niet rood._"; fi
      echo
      echo "| controle | uitkomst | detail |"
      echo "|---|---|---|"
      while IFS=$'\t' read -r status name detail; do
        echo "| $name | $status | $detail |"
      done < <(tr -d '\r' < "$LOG")
      echo
    } | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
    if [ "$fails" -gt 0 ] && [ "${RELEASE_VERIFY_STRICT:-1}" = "1" ]; then exit 1; fi
    ;;
  *)
    echo "onbekend subcommando: $cmd" >&2; exit 2
    ;;
esac
