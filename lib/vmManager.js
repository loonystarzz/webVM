import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBROOT = path.join(__dirname, '../');
const VM_DIR = path.join(WEBROOT, 'vm');
const TEMPLATES_DIR = path.join(WEBROOT, 'templates');

const VM_TYPES = {
  xp: {
    name: 'Windows XP',
    template: 'vol-xp.qcow2',
    iso: 'winxp.iso',
    memory: 262144,   // 256 MiB in KiB
    libvirtName: (code) => `vm-xp-${code}`,
  },
  '2000': {
    name: 'Windows 2000',
    template: 'vol-2000.qcow2',
    iso: 'win2k.iso',
    memory: 65536,    // 64 MiB in KiB
    libvirtName: (code) => `vm-2000-${code}`,
  },
};

function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A1B2C3"
}

function generateMac() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  return `52:54:00:${hex()}:${hex()}:${hex()}`;
}

function buildXml({ code, type, imagePath, isoPath, mac, vmName }) {
  const cfg = VM_TYPES[type];
  return `<domain type="kvm">
  <name>${vmName}</name>
  <memory unit="KiB">${cfg.memory}</memory>
  <currentMemory unit="KiB">${cfg.memory}</currentMemory>
  <vcpu placement="static">1</vcpu>
  <os>
    <type arch="x86_64" machine="pc-i440fx-10.0">hvm</type>
    <boot dev="hd"/>
    <bootmenu enable="yes"/>
  </os>
  <features>
    <acpi/>
    <apic/>
    <vmport state="off"/>
  </features>
  <cpu mode="custom" match="exact" check="none">
    <model fallback="allow">Opteron_G1</model>
  </cpu>
  <clock offset="utc">
    <timer name="rtc" tickpolicy="catchup"/>
    <timer name="pit" tickpolicy="delay"/>
    <timer name="hpet" present="no"/>
  </clock>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <pm>
    <suspend-to-mem enabled="no"/>
    <suspend-to-disk enabled="no"/>
  </pm>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type="file" device="disk">
      <driver name="qemu" type="qcow2"/>
      <source file="${imagePath}"/>
      <target dev="hdc" bus="ide"/>
      <address type="drive" controller="0" bus="1" target="0" unit="0"/>
    </disk>
    <disk type="file" device="cdrom">
      <driver name="qemu" type="raw"/>
      <source file="${isoPath}"/>
      <target dev="hdb" bus="ide"/>
      <readonly/>
      <address type="drive" controller="0" bus="0" target="0" unit="1"/>
    </disk>
    <controller type="usb" index="0" model="ich9-ehci1">
      <address type="pci" domain="0x0000" bus="0x00" slot="0x05" function="0x7"/>
    </controller>
    <controller type="usb" index="0" model="ich9-uhci1">
      <master startport="0"/>
      <address type="pci" domain="0x0000" bus="0x00" slot="0x05" function="0x0" multifunction="on"/>
    </controller>
    <controller type="usb" index="0" model="ich9-uhci2">
      <master startport="2"/>
      <address type="pci" domain="0x0000" bus="0x00" slot="0x05" function="0x1"/>
    </controller>
    <controller type="usb" index="0" model="ich9-uhci3">
      <master startport="4"/>
      <address type="pci" domain="0x0000" bus="0x00" slot="0x05" function="0x2"/>
    </controller>
    <controller type="pci" index="0" model="pci-root"/>
    <controller type="ide" index="0">
      <address type="pci" domain="0x0000" bus="0x00" slot="0x01" function="0x1"/>
    </controller>
    <controller type="virtio-serial" index="0">
      <address type="pci" domain="0x0000" bus="0x00" slot="0x06" function="0x0"/>
    </controller>
    <interface type="network">
      <mac address="${mac}"/>
      <source network="default"/>
      <model type="rtl8139"/>
      <address type="pci" domain="0x0000" bus="0x00" slot="0x03" function="0x0"/>
    </interface>
    <serial type="pty">
      <target type="isa-serial" port="0">
        <model name="isa-serial"/>
      </target>
    </serial>
    <console type="pty">
      <target type="serial" port="0"/>
    </console>
    <channel type="spicevmc">
      <target type="virtio" name="com.redhat.spice.0"/>
      <address type="virtio-serial" controller="0" bus="0" port="1"/>
    </channel>
    <input type="mouse" bus="ps2"/>
    <input type="keyboard" bus="ps2"/>
    <graphics type="spice" autoport="yes">
      <listen type="address" address="127.0.0.1"/>
      <image compression="off"/>
    </graphics>
    <sound model="ac97">
      <address type="pci" domain="0x0000" bus="0x00" slot="0x04" function="0x0"/>
    </sound>
    <audio id="1" type="spice"/>
    <video>
      <model type="virtio" heads="1" primary="yes">
        <acceleration accel3d="no"/>
      </model>
      <address type="pci" domain="0x0000" bus="0x00" slot="0x02" function="0x0"/>
    </video>
    <redirdev bus="usb" type="spicevmc">
      <address type="usb" bus="0" port="2"/>
    </redirdev>
    <redirdev bus="usb" type="spicevmc">
      <address type="usb" bus="0" port="3"/>
    </redirdev>
    <memballoon model="virtio">
      <address type="pci" domain="0x0000" bus="0x00" slot="0x07" function="0x0"/>
    </memballoon>
  </devices>
</domain>`;
}

async function virsh(...args) {
  const { stdout, stderr } = await execFileAsync('virsh', args);
  return stdout.trim();
}

export async function createVM(type) {
  if (!VM_TYPES[type]) throw new Error(`Unknown VM type: ${type}`);
  const cfg = VM_TYPES[type];

  let code;
  let vmFolder;
  // Ensure unique code
  for (let i = 0; i < 10; i++) {
    code = generateCode();
    vmFolder = path.join(VM_DIR, code);
    try {
      await fs.access(vmFolder);
      // folder exists, try again
    } catch {
      break; // folder doesn't exist, good
    }
  }

  await fs.mkdir(vmFolder, { recursive: true });

  // Copy template image into vm folder
  const templatePath = path.join(TEMPLATES_DIR, cfg.template);
  const imagePath = path.join(vmFolder, 'vol.qcow2');
  await execFileAsync('cp', ['--reflink=auto', templatePath, imagePath]);

  // Copy ISO into vm folder
  const isoTemplatePath = path.join(TEMPLATES_DIR, cfg.iso);
  const isoPath = path.join(vmFolder, cfg.iso);
  await execFileAsync('cp', ['--reflink=auto', isoTemplatePath, isoPath]);

  const mac = generateMac();
  const vmName = cfg.libvirtName(code);
  const xml = buildXml({ code, type, imagePath, isoPath, mac, vmName });
  const xmlPath = path.join(vmFolder, 'domain.xml');
  await fs.writeFile(xmlPath, xml, 'utf-8');

  // Save metadata
  const meta = { code, type, vmName, mac, imagePath, isoPath, xmlPath, created: new Date().toISOString() };
  await fs.writeFile(path.join(vmFolder, 'meta.json'), JSON.stringify(meta, null, 2));

  // Define and start VM in libvirt
  await virsh('define', xmlPath);
  await virsh('start', vmName);

  return { code, type, vmName };
}

export async function getVM(code) {
  const vmFolder = path.join(VM_DIR, code.toUpperCase());
  let meta;
  try {
    const raw = await fs.readFile(path.join(vmFolder, 'meta.json'), 'utf-8');
    meta = JSON.parse(raw);
  } catch {
    return null;
  }
  return meta;
}

export async function getVMSpicePort(vmName) {
  // Parse virsh output to get SPICE port
  try {
    const output = await virsh('domdisplay', vmName);
    // output like: spice://127.0.0.1:5900
    const match = output.match(/spice:\/\/[\d.]+:(\d+)/);
    if (match) return parseInt(match[1], 10);
  } catch {}
  return null;
}

export async function getVMStatus(vmName) {
  try {
    const output = await virsh('domstate', vmName);
    return output;
  } catch {
    return 'not found';
  }
}

export async function ensureVMRunning(meta) {
  const state = await getVMStatus(meta.vmName);
  if (state !== 'running') {
    // Re-define in case it was undefined, then start
    try { await virsh('define', meta.xmlPath); } catch {}
    await virsh('start', meta.vmName);
    // Wait briefly for SPICE to come up
    await new Promise(r => setTimeout(r, 2000));
  }
}

export { VM_TYPES };
