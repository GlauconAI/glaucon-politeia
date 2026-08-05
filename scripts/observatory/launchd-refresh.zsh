#!/bin/zsh

set -u

repo_root=${OBSERVATORY_REPO_ROOT:-}
telegram_target=${OBSERVATORY_TELEGRAM_TARGET:-}
telegram_account=${OBSERVATORY_TELEGRAM_ACCOUNT:-plato}

if [[ -z $repo_root || -z $telegram_target ]]; then
  print -r -- "OBSERVATORY_REFRESH_UNEXPECTED_FAILURE"
  exit 0
fi

runner="$repo_root/scripts/observatory/cron-refresh.zsh"
report_path="$repo_root/.observatory/latest-refresh-report.txt"
safe_output=$($runner 2>/dev/null)

notify() {
  local message="$1"
  openclaw message send \
    --account "$telegram_account" \
    --channel telegram \
    --target "$telegram_target" \
    --message "$message" >/dev/null 2>&1 || true
}

read_report() {
  if [[ -f $report_path ]]; then
    /bin/cat "$report_path"
  fi
}

if [[ $safe_output == *OBSERVATORY_REFRESH_UNEXPECTED_FAILURE* ]]; then
  notify "Dashboard 每日更新未完成
状态：刷新流程发生异常，Dashboard 继续使用上一份有效数据
诊断：请检查本机 .observatory/last-refresh-error.log"
elif [[ $safe_output == *OBSERVATORY_REFRESH_FAILURE* ]]; then
  report=$(read_report)
  if [[ -n $report ]]; then
    notify "$report"
  else
    notify "Dashboard 每日更新未完成；Dashboard 继续使用上一份有效数据。"
  fi
elif [[ $safe_output == *OBSERVATORY_REFRESH_STALE* ]]; then
  notify "Dashboard 每日更新未完成
状态：最新数据已超过预期更新时间，Dashboard 继续使用上一份有效数据"
elif [[ $safe_output == *OBSERVATORY_REFRESH_OK* && $safe_output == *OBSERVATORY_RETENTION_OK* ]]; then
  report=$(read_report)
  if [[ -n $report ]]; then
    notify "$report"
  fi
fi

print -r -- "$safe_output"
exit 0
