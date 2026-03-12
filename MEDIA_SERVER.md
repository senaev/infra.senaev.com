# senaev.com media server

After deploying main cluster, you have to set up components of the media server

## Qbittorrent

### Login

Login on the page https://qbittorrent.senaev.com/ with password from Qbittorrent output

```shell
ssh $control_plane_user@$control_plane_ip "kubectl -n senaev-com logs deploy/qbittorrent | grep password"
```

### Setup folders

Tools → Options → Downloads
- Default Save Path: `/downloads/complete`
- ✅ Keep incomplete torrents in: `/downloads/incomplete`
- ✅ Copy .torrent files for finished downloads to: `/downloads/archive-torrent-files`
- Automatically add torrents from:
    - Monitored Folder: `/watch-torrent-files`
    - Override Save Location: `Default save location`

### Add notifications

Tools → Options → Downloads

✅ Run on torrent added:
```shell
curl -X POST http://helper.senaev-com.svc.cluster.local/tg -H "Content-Type: text/plain" -d "🚀 Download started: name=[%N] rootPath=[%R] savePath=[%D] size(bytes)=[%Z]"
```

✅ Run on torrent finished:
```shell
curl -X POST http://helper.senaev-com.svc.cluster.local/tg -H "Content-Type: text/plain" -d "🏁 Download finished: name=[%N] rootPath=[%R] savePath=[%D] size(bytes)=[%Z]"
```

### For removing torrents after downloading

Tools → Options → BitTorrent → Seeding Limits → ✅ When total seeding time reaches `1` minutes

## Filebrowser

https://filebrowser.senaev.com/

## Jellyfin

Right after the installation, go to the WEB UI https://jellyfin.senaev.com/ and setup:
- Login/password
- Media library

## WebDav

https://webdav.senaev.ru/
