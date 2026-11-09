#!/bin/sh
set -eu

PORTFOLIO_DIR=/opt/portfolio
CONF_DIR="$PORTFOLIO_DIR/nginx/conf.d"
WEBROOT="$PORTFOLIO_DIR/certbot-www"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)/nginx/conf.d"
DOMAINS="planimax.djcode.ge planimax-server.djcode.ge"
BACKUP="/root/nginx-conf.d.bak-$(date +%F-%H%M%S)"

nginx_cmd() {
  cd "$PORTFOLIO_DIR" && docker compose exec -T nginx nginx "$@"
}

rollback() {
  echo "Ошибка, возвращаю конфиги nginx из $BACKUP"
  rm -rf "$CONF_DIR"
  cp -a "$BACKUP" "$CONF_DIR"
  nginx_cmd -t && nginx_cmd -s reload
  exit 1
}

for D in $DOMAINS; do
  test -f "$SRC_DIR/$D.conf" || { echo "Нет $SRC_DIR/$D.conf"; exit 1; }
done

cp -a "$CONF_DIR" "$BACKUP"
echo "Бэкап конфигов: $BACKUP"
trap rollback INT TERM

for D in $DOMAINS; do
  if [ -f "/etc/letsencrypt/live/$D/fullchain.pem" ]; then
    echo "$D: сертификат уже есть"
    continue
  fi

  cat > "$CONF_DIR/$D.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $D;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 404;
    }
}
EOF
  nginx_cmd -t || rollback
  nginx_cmd -s reload || rollback

  certbot certonly --webroot -w "$WEBROOT" -d "$D" \
    --key-type ecdsa --non-interactive --keep-until-expiring \
    || rollback
done

for D in $DOMAINS; do
  cp "$SRC_DIR/$D.conf" "$CONF_DIR/$D.conf"
  chown deployment:deployment "$CONF_DIR/$D.conf"
done

nginx_cmd -t || rollback
nginx_cmd -s reload || rollback
trap - INT TERM

echo "Готово: nginx отдаёт $DOMAINS"
