# Xray — VLESS + Reality

Сервер настроен на протокол **VLESS** с **Reality**: трафик выглядит как обычный TLS до google.com, что помогает обходить блокировки.

## Секреты в конфиге

В `./xray-config-template.json` нужно подставить свои значения (⚠️ делать это только в Vault, не коммить их в репозиторий):

- `{USER_UUID}` — идентификатор пользователя, по которому авторизуется клиентское приложение
- `{REALITY_PRIVATE_KEY}` — приватный ключ пары для Reality (для сервера)
- `{REALITY_PUBLIC_KEY}` - публичный ключ пары для Reality (для приложения)

## Как генерировать ключи

Сгенерировать `{USER_UUID}` командой `uuidgen`, вывод будет типа такого:

```text
ec4249b8-12aa-4ca3-a4cb-693dc48147be
```

Сгенерировать `{REALITY_PRIVATE_KEY}` и `{REALITY_PUBLIC_KEY}` ключ командой внутри pos XRAY `xray x25519`, вывод будет типа такого:

```text
PrivateKey: XXXXX
Password: XXXXX
Hash32: XXXXX
```

Редактируем конфиг:

- На место `{USER_UUID}` вставляем UUID из выхлопа первой команды `uuidgen`
- На место `{REALITY_PRIVATE_KEY}` вставляем `PrivateKey` из выхлопа `xray x25519`
- Запомнить `Password` (`{REALITY_PUBLIC_KEY}`), он потребуется на клиенте

Полученный JSON вставляем в секрет Vault `senaev-com-kv` в поле XRAY_CONFIG. После этого необходимо подождать пару минут, чтобы кублет прогрузил секрет в pod.

## Настройск клиента

Установить Happ https://www.happ.su/main

Заполнить макросы и скопировать ссылку:

```text
vless://{USER_UUID}@{SERVER_HOST}:443?flow=xtls-rprx-vision&type=tcp&headerType=none&security=reality&fp=chrome&sni=www.google.com&pbk={REALITY_PUBLIC_KEY}&sid=0123456789abcdef#%F0%9F%87%A9%F0%9F%87%AA%20senaev.com%20(ionos)
```

В приложении `Add new` → `Import from clipboard`
