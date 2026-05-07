# senaev.com media server

## How to use

Desktop:

- use Jellyfin web interface
- or download files via WebDAV.

Android:

- use [VidHub](https://play.google.com/store/apps/details?id=com.oumi.utility.media.hub) to connect both Jellyfin and WebDAV
- [File Manager](https://play.google.com/store/apps/details?id=com.alphainventor.filemanager) is perfect for copying files from WebDAV server (converted-for-mobile) to local folder before the flight

## Services

After deploying main cluster, you have to set up components of the media server

### Jellyfin

Login https://jellyfin.senaev.com/

Dashboard → Playback → Transcoding → Hardware Acceleration → Intel Quicksync (QSV)

Add two libraries as "Home Videos and Photos" (to preserve folder structure):

- /media/downloads/completed
- /media/downloads/never_remove

### Qbittorrent

Login on the page https://qbittorrent.senaev.com/ with password from Qbittorrent output

```shell
ssh $control_plane_user@$control_plane_ip "kubectl -n senaev-com logs deploy/qbittorrent | grep password"
```

### WebDAV

https://webdav.senaev.ru/

### Filebrowser

https://filebrowser.senaev.com/

### Unmanic

Settings → Plugins → INSTALL PLUGIN FROM FILE → `./unmanic-plugins`:

- `Ignore video files under size`: https://github.com/Unmanic/plugin.ignore_under_size/releases
- `Mover v2`: https://github.com/Unmanic/plugin.mover2/releases
- `Transcode Video Files`: https://github.com/Unmanic/plugin.video_transcoder/releases
- `Audio Encoder AAC`: https://github.com/Unmanic/plugin.encoder_audio_aac/releases

Settings → Library → Libraries → and configure default library:

- Name: `Convert files to mobile format`
- Library path: `/downloads/complete`
- Configure Library for receiving remote files only ❌
- Enable library scanner for this library ✅
- Enable file monitor for this library ✅
- Plugins → ➕ → Add all plugins

Settings → Workers → Worker groups → ➕

- Group name: `Worker group`
- Worker count: `1`
