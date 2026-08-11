#!/usr/bin/env bash
# Watch for the telegram-parser container to move off the old image.
OLD="bdcp8kraf9s12uinqyh96fd7:b1624d79ba81c6dea3802fc645ac0f4ebd524bdb"
for i in $(seq 1 40); do
  IMG=$(docker ps --format '{{.Image}}' 2>/dev/null | grep bdcp8kraf9s)
  if [ -n "$IMG" ] && [ "$IMG" != "$OLD" ]; then
    echo "DEPLOY COMPLETE: container now on image $IMG (was $OLD)"
    exit 0
  fi
  sleep 15
done
echo "TIMEOUT after ~10min - container still: $(docker ps --format '{{.Image}}' | grep bdcp8kraf9s)"
exit 1