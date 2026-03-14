# senaev.com media server

## How to use

Desktop: use Jellyfin web interface or download files via WebDAV.

Android: use VidHub to connect both Jellyfin and WebDAV https://play.google.com/store/apps/details?id=com.oumi.utility.media.hub

## Services

After deploying main cluster, you have to set up components of the media server

### Jellyfin

Login https://jellyfin.senaev.com/

### Qbittorrent

Login on the page https://qbittorrent.senaev.com/ with password from Qbittorrent output

```shell
ssh $control_plane_user@$control_plane_ip "kubectl -n senaev-com logs deploy/qbittorrent | grep password"
```

### WebDav

https://webdav.senaev.ru/

### Unmanic

Settings → Plugins → INSTALL PLUGIN FROM REPO ➕ → REFRESH REPOSITORIES → Install plugins:
- `Ignore video files under size`
- `Mover v2`
- `Transcode Video Files`

Settings → Library → Libraries → and configure default library:
- Name: `Convert files to mobile format`
- Library path: `/downloads/complete`
- Configure Library for receiving remote files only ❌
- Enable library scanner for this library ✅
- Enable file monitor for this library ✅
- Plugins → ➕ → Add all plugins

Settings → Workers → Worker groups → ➕
- Name: `Worker`
- Worker count: `2`
