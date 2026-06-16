# extra/

Place `goodies.iso` here. It will be mounted **read-only** as a second CD-ROM drive (D: or E:) inside every VM automatically.

## Suggested contents

### Browsers
- **Firefox ESR** (last version supporting Win XP: 52.9.0) — https://ftp.mozilla.org/pub/firefox/releases/52.9.0esr/win32/en-US/
- **Pale Moon** (XP/2000 compatible fork) — https://www.palemoon.org

### Compression
- **7-Zip** (7z2301.exe, supports Win2000+) — https://www.7-zip.org/download.html

### Utilities
- **Notepad++** (last XP-compatible: 7.9.2)
- **VLC** (last XP-compatible: 3.0.18)
- **CPU-Z** (portable)
- **CrystalDiskInfo** (portable)

## Building the ISO

On Linux:
```bash
# Put your files in a folder called goodies/
genisoimage -o extra/goodies.iso -J -r -V "Goodies" goodies/
# or with mkisofs:
mkisofs -o extra/goodies.iso -J -r -V "Goodies" goodies/
```

On Windows:
Use **ImgBurn** or **CDBurnerXP** in "create image from files" mode.
