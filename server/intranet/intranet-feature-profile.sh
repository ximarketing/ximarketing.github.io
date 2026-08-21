#!/usr/bin/env bash

# Shared renderer for independently optional Intranet features. Source this
# file, then render one of four profiles:
#   base   = no optional features
#   ab     = A/B Test only
#   picker = Classroom Picker only
#   full   = both optional features
# Marker comments remain in enabled output so later updaters can derive the
# active feature set without a second configuration store.

readonly INTRANET_AB_BEGIN='XIMARKETING AB TEST FEATURE BEGIN'
readonly INTRANET_AB_END='XIMARKETING AB TEST FEATURE END'
readonly INTRANET_PICKER_BEGIN='XIMARKETING CLASSROOM PICKER FEATURE BEGIN'
readonly INTRANET_PICKER_END='XIMARKETING CLASSROOM PICKER FEATURE END'

_intranet_markers_are_full() {
  local input=$1
  local begin=$2
  local end=$3
  [[ -f $input && ! -L $input ]] || return 1
  [[ $(grep -cF "$begin" "$input" || true) -eq 1 ]] || return 1
  [[ $(grep -cF "$end" "$input" || true) -eq 1 ]] || return 1
  awk -v begin="$begin" -v end="$end" '
    index($0, begin) { if (inside || seen_begin) exit 41; inside=1; seen_begin=1; next }
    index($0, end) { if (!inside || seen_end) exit 42; inside=0; seen_end=1; next }
    END { if (inside || seen_begin != 1 || seen_end != 1) exit 43 }
  ' "$input" >/dev/null
}

_intranet_markers_are_absent() {
  local input=$1
  local begin=$2
  local end=$3
  [[ -f $input && ! -L $input ]] || return 1
  ! grep -Fq "$begin" "$input" && ! grep -Fq "$end" "$input"
}

intranet_ab_markers_are_full() {
  _intranet_markers_are_full "$1" "$INTRANET_AB_BEGIN" "$INTRANET_AB_END"
}

intranet_ab_markers_are_absent() {
  _intranet_markers_are_absent "$1" "$INTRANET_AB_BEGIN" "$INTRANET_AB_END"
}

intranet_picker_markers_are_full() {
  _intranet_markers_are_full "$1" "$INTRANET_PICKER_BEGIN" "$INTRANET_PICKER_END"
}

intranet_picker_markers_are_absent() {
  _intranet_markers_are_absent "$1" "$INTRANET_PICKER_BEGIN" "$INTRANET_PICKER_END"
}

intranet_profile_for_features() {
  local ab_active=$1
  local picker_active=$2
  [[ $ab_active == 0 || $ab_active == 1 ]] || return 2
  [[ $picker_active == 0 || $picker_active == 1 ]] || return 2
  if [[ $ab_active == 1 && $picker_active == 1 ]]; then
    printf 'full\n'
  elif [[ $ab_active == 1 ]]; then
    printf 'ab\n'
  elif [[ $picker_active == 1 ]]; then
    printf 'picker\n'
  else
    printf 'base\n'
  fi
}

render_intranet_feature_file() {
  local profile=$1
  local input=$2
  local output=$3
  local keep_ab=0
  local keep_picker=0
  case "$profile" in
    base) ;;
    ab) keep_ab=1 ;;
    picker) keep_picker=1 ;;
    full) keep_ab=1; keep_picker=1 ;;
    *) return 2 ;;
  esac
  [[ -f $input && ! -L $input ]] || return 3
  intranet_ab_markers_are_full "$input" || return 4
  intranet_picker_markers_are_full "$input" || return 5

  awk \
      -v keep_ab="$keep_ab" \
      -v keep_picker="$keep_picker" \
      -v ab_begin="$INTRANET_AB_BEGIN" \
      -v ab_end="$INTRANET_AB_END" \
      -v picker_begin="$INTRANET_PICKER_BEGIN" \
      -v picker_end="$INTRANET_PICKER_END" '
    index($0, ab_begin) {
      if (inside || seen_ab_begin) exit 41
      inside="ab"; seen_ab_begin=1
      if (keep_ab) print
      next
    }
    index($0, ab_end) {
      if (inside != "ab" || seen_ab_end) exit 42
      inside=""; seen_ab_end=1
      if (keep_ab) print
      next
    }
    index($0, picker_begin) {
      if (inside || seen_picker_begin) exit 43
      inside="picker"; seen_picker_begin=1
      if (keep_picker) print
      next
    }
    index($0, picker_end) {
      if (inside != "picker" || seen_picker_end) exit 44
      inside=""; seen_picker_end=1
      if (keep_picker) print
      next
    }
    !inside || (inside == "ab" && keep_ab) || (inside == "picker" && keep_picker) { print }
    END {
      if (inside || seen_ab_begin != 1 || seen_ab_end != 1 ||
          seen_picker_begin != 1 || seen_picker_end != 1) exit 45
    }
  ' "$input" > "$output"
}

render_intranet_feature_profile() {
  local profile=$1
  local portal_input=$2
  local proxy_input=$3
  local portal_output=$4
  local proxy_output=$5
  render_intranet_feature_file "$profile" "$portal_input" "$portal_output"
  render_intranet_feature_file "$profile" "$proxy_input" "$proxy_output"
}
