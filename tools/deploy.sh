#!/bin/bash
# 命の砂時計を https://games.satoru.net/sunadokei/ に公開する（rootで実行）
# やること: pm2(nodeユーザー)でポート3049に起動 → nginx設定をバックアップして /sunadokei/ を追加 → 構文チェック後にリロード
set -euo pipefail
APP=/var/www/sites/games.satoru.net/sunadokei
CONF=/etc/nginx/conf.d/games-satoru.conf
BACKUP="$CONF.bak-$(date +%Y%m%d)-sunadokei"

cd "$APP"
chmod -R a+rX "$APP"
mkdir -p "$APP/data" && chown -R node:node "$APP/data"   # イイネ累計の保存先

# ゲーム本体
su -s /bin/bash node -c "export PM2_HOME=/home/node/.pm2; cd $APP && (pm2 delete sunadokei >/dev/null 2>&1 || true); PORT=3049 BASE_PATH=/sunadokei pm2 start server/index.js --name sunadokei --update-env >/dev/null && pm2 save >/dev/null"
sleep 1.5
curl -fsS http://127.0.0.1:3049/sunadokei/status >/dev/null || { echo "ゲームサーバーが起動しませんでした"; exit 1; }
echo "ゲームサーバー起動OK"

# nginx（追加済みなら何もしない）
if ! grep -q 'location \^~ /sunadokei/' "$CONF"; then
  cp -p "$CONF" "$BACKUP"
  python3 - "$CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
block = '''    # ─── 命の砂時計（大人数オンライン3D）→ localhost:3049 ───
    # アプリ側は BASE_PATH=/sunadokei で配信しているので、プレフィックスは付けたまま渡す
    location = /sunadokei { return 301 https://$host/sunadokei/; }

    location ^~ /sunadokei/ {
        proxy_pass         http://127.0.0.1:3049;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;          # WebSocket（対戦の同期）
        proxy_set_header   Connection $connection_upgrade;
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

'''
mark = '    # 今はゲームが1本だけなので'
assert mark in s, 'nginx設定の挿入位置が見つかりません'
open(p, 'w').write(s.replace(mark, block + mark))
PY
  if ! nginx -t; then
    cp -p "$BACKUP" "$CONF"
    echo "nginxの構文エラーのため設定を元に戻しました"; exit 1
  fi
  systemctl reload nginx
  sleep 1
  echo "nginx設定を追加しました（バックアップ: $BACKUP）"
fi

curl -fsS -o /dev/null -w '公開ページ: HTTP %{http_code}\n' https://games.satoru.net/sunadokei/
echo "完了: https://games.satoru.net/sunadokei/"
