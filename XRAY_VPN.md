# Xray

## Как генерировать ключи

Сгенерировать `XRAY_USER_UUID`:

```bash
uuidgen
# ec4249b8-12aa-4ca3-a4cb-693dc48147be
```

Сгенерировать пару ключей Reality (внутри pod XRAY):

```bash
xray x25519
# PrivateKey: <XRAY_REALITY_PRIVATE_KEY>
# PublicKey:  <XRAY_REALITY_PUBLIC_KEY>
```

Все ключи вставить в Vault секрет `senaev-com-kv`

## Инструкция по подключению клиента на странице

https://vpn-subscription.senaev.com/{VPN_SUBSCRIPTION_SECRET}

`VPN_SUBSCRIPTION_SECRET` тоже лежит в Vault
