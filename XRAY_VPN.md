# Xray — VLESS + Reality

Сервер настроен на протокол VLESS с Reality: трафик выглядит как обычный TLS до `senaev.ru`, что помогает обходить блокировки.

## Архитектура

```
Клиент ──VLESS+Reality──→ yandex-cloud:443 (XRAY)
                               │
                               ├─ VPN-клиент (есть Reality-маркеры) → xray-socks:1080 (hetzner) → Интернет
                               │
                               └─ Обычный HTTPS (нет маркеров) → traefik-hetzner:443 → nextjs-app:3000
                                  (камуфляж: цензор видит настоящий сайт senaev.ru)

HTTP (порт 80) → XRAY dokodemo-door → traefik-hetzner:80
                  (ACME-челленджи Let's Encrypt + редирект на HTTPS)
```

Reality анализирует TLS ClientHello: если в Session ID есть зашифрованные маркеры (расшифровываются `privateKey`), соединение обрабатывается как VPN. Если маркеров нет — сырой TCP проксируется в `dest` (Traefik), который отвечает настоящим сайтом с настоящим сертификатом Let's Encrypt.

## Как генерировать ключи

Сгенерировать `XRAY_USER_UUID`:

```bash
uuidgen
# ec4249b8-12aa-4ca3-a4cb-693dc48147be
```

Сгенерировать пару ключей Reality (внутри pod XRAY):

```bash
xray x25519
# PrivateKey: <XRAY_REALITY_PRIVATE_KEY>  ← в Vault
# PublicKey:  <XRAY_REALITY_PUBLIC_KEY>   ← в ссылку клиента
```

В секрет Vault `senaev-com-kv` вставляем:

- `XRAY_REALITY_PRIVATE_KEY` — приватный ключ
- `XRAY_USER_UUID` — UUID клиента

После этого необходимо подождать пару минут, чтобы кублет прогрузил секреты в pod.

## Настройки клиента

Установить [Hiddify](https://hiddify.com/) или [Happ](https://www.happ.su/main).

Заполнить макросы и скопировать ссылку:

```text
vless://{XRAY_USER_UUID}@{SERVER_HOST}:443?flow=xtls-rprx-vision&type=tcp&headerType=none&security=reality&fp=chrome&sni=senaev.ru&pbk={XRAY_REALITY_PUBLIC_KEY}&sid=0123456789abcdef#connection_name
```

В приложении `Add new` → `Import from clipboard`.
