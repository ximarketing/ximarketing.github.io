#!/usr/bin/env bash

# Shared renderer for optional intranet features. Source this file, then call
# render_intranet_feature_profile with either "base" (omit optional games) or
# "full" (retain them). The markers remain in full output so later updaters can
# determine whether a feature is active without a second configuration store.

readonly INTRANET_AB_BEGIN='XIMARKETING AB TEST FEATURE BEGIN'
readonly INTRANET_AB_END='XIMARKETING AB TEST FEATURE END'

intranet_ab_markers_are_full() {
  local input=$1
  [[ -f $input && ! -L $input ]] || return 1
  [[ $(grep -cF "$INTRANET_AB_BEGIN" "$input" || true) -eq 1 ]] || return 1
  [[ $(grep -cF "$INTRANET_AB_END" "$input" || true) -eq 1 ]] || return 1
  awk -v begin="$INTRANET_AB_BEGIN" -v end="$INTRANET_AB_END" '
    index($0, begin) { if (inside || seen_begin) exit 41; inside=1; seen_begin=1; next }
    index($0, end) { if (!inside || seen_end) exit 42; inside=0; seen_end=1; next }
    END { if (inside || seen_begin != 1 || seen_end != 1) exit 43 }
  ' "$input" >/dev/null
}

intranet_ab_markers_are_absent() {
  local input=$1
  [[ -f $input && ! -L $input ]] || return 1
  ! grep -Fq "$INTRANET_AB_BEGIN" "$input" &&
    ! grep -Fq "$INTRANET_AB_END" "$input"
}

render_intranet_feature_file() {
  local profile=$1
  local input=$2
  local output=$3
  [[ $profile == base || $profile == full ]] || return 2
  [[ -f $input && ! -L $input ]] || return 3
  intranet_ab_markers_are_full "$input" || return 4

  awk -v keep="$([[ $profile == full ]] && printf 1 || printf 0)" \
      -v begin="$INTRANET_AB_BEGIN" -v end="$INTRANET_AB_END" '
    index($0, begin) {
      if (inside || seen_begin) exit 41
      inside=1
      seen_begin=1
      if (keep) print
      next
    }
    index($0, end) {
      if (!inside || seen_end) exit 42
      inside=0
      seen_end=1
      if (keep) print
      next
    }
    !inside || keep { print }
    END { if (inside || seen_begin != 1 || seen_end != 1) exit 43 }
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
