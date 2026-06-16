# 🖥️ webvm

A Node.js web app that lets users spin up and connect to VMs on your server straight from the browser - no client-side setup needed. Styled like it's 1995.

**Live demo:** http://vm.uwukitty.ddns.net/

---

## How it works

libvirt/QEMU runs on the backend. Users pick a VM template from the web UI, launch it, and get a live connection in-browser.

---

## Requirements

- Node.js
- `libvirt-daemon-qemu` and `libvirt-client*` installed and running
- `qemu-system` installed
- The `default` network active and set to autostart in virsh

### Setting up libvirt networking

```bash
# Start the default network
virsh net-start default

# Set it to autostart on boot
virsh net-autostart default

# Verify it's active
virsh net-list --all
```

If `default` doesn't exist, define it first:

```bash
virsh net-define /usr/share/libvirt/networks/default.xml
```

---

## Install & run

```bash
npm install ws express
node server.js
```

> ⚠️ Needs to be run as root to avoid libvirt permission issues. Not recommended for production — consider throwing it in a container or something.

---

## VM templates

Place your images in the `templates/` folder. Placeholder files are included — replace them with real images (not shipped due to Windows licensing).

| File | What it is |
|---|---|
| `templates/vol-2000.qcow2` | Windows 2000 pre-installed disk image |
| `templates/win2k.iso` | Windows 2000 install CD |
| `templates/vol-xp.qcow2` | Windows XP pre-installed disk image |
| `templates/winxp.iso` | Windows XP install CD |

> **License keys not included.** Source your own — this project ships no Microsoft software.

If the pre-installed image still has setup unfinished, the install ISO will be used to complete it.
This is mainly for older Windows versions, where after initial install the OOBE still requires the install ISO mounted.

---

## TO DO
- limit amounts of vms a user can create  in a specific amount of time DONE!!!
- Auto-Delete inactive VMS (Not connected to for 3 days or longer.) DONE!!!

