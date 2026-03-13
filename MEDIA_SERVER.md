# senaev.com media server

After deploying main cluster, you have to set up components of the media server

## Qbittorrent

### Login

Login on the page https://qbittorrent.senaev.com/ with password from Qbittorrent output

```shell
ssh $control_plane_user@$control_plane_ip "kubectl -n senaev-com logs deploy/qbittorrent | grep password"
```

### Setup Download Folders (Tools → Options → Downloads)

Setup folders:
- Default Save Path: `/downloads/complete`
- ✅ Keep incomplete torrents in: `/downloads/incomplete`
- ✅ Copy .torrent files for finished downloads to: `/downloads/archive-torrent-files`
- Automatically add torrents from:
    - Monitored Folder: `/downloads/watch-torrent-files`
    - Override Save Location: `Default save location`

### Add Notifications (Tools → Options → Downloads)

✅ Run on torrent added:
```shell
curl -X POST http://helper.senaev-com.svc.cluster.local/tg -H "Content-Type: text/plain" -d "🚀 Download started: name=[%N] rootPath=[%R] savePath=[%D] size(bytes)=[%Z]"
```

✅ Run on torrent finished:
```shell
curl -X POST http://helper.senaev-com.svc.cluster.local/tg -H "Content-Type: text/plain" -d "🏁 Download finished: name=[%N] rootPath=[%R] savePath=[%D] size(bytes)=[%Z]"
```

### Removing Torrents After Downloading (Tools → Options → BitTorrent)

Seeding Limits → ✅ When total seeding time reaches `1` minutes

## Filebrowser

https://filebrowser.senaev.com/

## Jellyfin

Right after the installation, go to the WEB UI https://jellyfin.senaev.com/ and setup:
- Login/password (From Vault)
- Media library
    - Content type: Home Videos And Photos (preserves folders structure)
    - Folders → ➕ → `/media/downloads`

## WebDav

https://webdav.senaev.ru/

## Unmanic

Settings → Library → Enable periodic library scans → ✅ `5` minutes → SUBMIT

Settings → Plugins → INSTALL PLUGIN FROM REPO ➕ → REFRESH REPOSITORIES

Install plugins:
- `Ignore video files under size`
- `Mover v2`
- `Transcode Video Files`

Settings → Library → Libraries → and configure default library:
- Name: `Convert files to mobile format`
- Library path: `/downloads/complete`
- Configure Library for receiving remote files only ❌
- Enable library scanner for this library ✅
- Enable file monitor for this library ✅
- Plugins:
    - Ignore video files under size
        - Minimal file size (assuming 1080p): `0.3GB/h`
    - Mover v2
        - ❌ Force processing of all files
        - Destination directory: `/downloads/converted-for-mobile`
        - ✅ Recreate directory structure
        - ❌ Also include library path when re-creating the directory structure
        - ❌ Remove source files
    - Transcode Video Files
        - Config mode: `Standard`
        - Max input stream packet buffer: `≈2048`
        - Video Codec: `HEVC/H265`
            - ❌ Force transcoding even if the file is already using the desired video codec
        - Video Encoder: `CPU - libx265`
            - Encoder quality preset: `Medium`
            - CRF (Constant Rate Factor) - `23`
        - ❌ Keep the same container
            - `.mkv - Matroska`
        - ✅ Enable plugin's smart video filters
            - ❌ Autocrop black bars
            - `720p`
            - ✅ Strip data streams
            - ✅ Strip attachment streams

Settings → Workers → Worker groups → ➕
- Name: `Worker`
- Worker count: `1`
