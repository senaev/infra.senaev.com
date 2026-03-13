# Xray — VLESS + Reality

Сервер настроен на протокол VLESS с Reality: трафик выглядит как обычный TLS до популярного сервиса, что помогает обходить блокировки.

## Как генерировать ключи

Сгенерировать `XRAY_USER_UUID` командой `uuidgen`, вывод будет типа такого:

```text
ec4249b8-12aa-4ca3-a4cb-693dc48147be
```

Сгенерировать `{REALITY_PRIVATE_KEY}` и `{XRAY_REALITY_PUBLIC_KEY}` ключ командой внутри pod XRAY `xray x25519`, вывод будет типа такого:

```text
PrivateKey: REALITY_PRIVATE_KEY
Password: XRAY_REALITY_PUBLIC_KEY
Hash32: XXX
```

В секрет Vault `senaev-com-kv` вставляем ключи/значения для `XRAY_REALITY_PRIVATE_KEY` и `XRAY_USER_UUID`.

После этого необходимо подождать пару минут, чтобы кублет прогрузил секреты в pod.

## Настройки клиента

Установить Happ https://www.happ.su/main

Заполнить макросы и скопировать ссылку:

```text
vless://{XRAY_USER_UUID}@{SERVER_HOST}:443?flow=xtls-rprx-vision&type=tcp&headerType=none&security=reality&fp=chrome&sni=www.google.com&pbk={XRAY_REALITY_PUBLIC_KEY}&sid=0123456789abcdef#vpn.senaev.com
```

В приложении `Add new` → `Import from clipboard`
