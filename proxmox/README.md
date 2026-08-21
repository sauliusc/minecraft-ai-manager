# Proxmox Deployment

One-click deployment of CraftControl into a Proxmox LXC container.

## Requirements

- Proxmox VE 7.x or 8.x
- At least **20 GB free** in the LVM thin pool (`lvs pve | grep data` — Data% must be below 80%)
- Internet access from the Proxmox host

## Run

SSH into the Proxmox host as root and execute:

```bash
bash proxmox/deploy.sh
```

That's it. The script will:

1. Download the Debian 12 LXC template (if not cached)
2. Create container **CT200** with 32 GB disk, 6 GB RAM, 4 cores
3. Install Docker inside the container
4. Generate all secrets automatically
5. Pull the pre-built images from ghcr.io and start all services

## Defaults

| Setting | Default | Override |
|---------|---------|----------|
| Container ID | `200` | `CTID=150` |
| Disk | `32 GB` | `CT_DISK=50` |
| RAM | `6144 MB` | `CT_RAM=8192` |
| Storage | `local-lvm` | `STORAGE=local-zfs` |
| Bridge | `vmbr0` | `BRIDGE=vmbr1` |
| Admin email | `admin@example.com` | `ADMIN_EMAIL=you@example.com` |
| Admin password | `changeme123` | `ADMIN_PASSWORD=secret` |

Example with overrides:

```bash
CTID=150 CT_RAM=8192 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret bash proxmox/deploy.sh
```

## After deployment

- Open the web panel at the IP shown at the end of the script
- Log in and **change the admin password immediately**
- Minecraft server is reachable on port `25565`

## Host tuning: swap

**`vm.swappiness` cannot be set from inside the container.** CraftControl runs in
an unprivileged LXC, where `/proc/sys/vm/swappiness` is the *host's* setting
mounted read-only:

```
# inside CT102
$ sysctl -w vm.swappiness=10
sysctl: setting key "vm.swappiness", ignoring: Read-only file system
```

A `/etc/sysctl.d/*.conf` file placed inside the container is silently inert for
the same reason — `systemd-sysctl` cannot apply it, so it looks like the setting
is managed when nothing is enforcing it. If you find such a file in a
CraftControl container, delete it; it is misleading, not load-bearing.

The default of `60` is tuned for desktops and swaps out inactive pages fairly
eagerly. That is a poor fit for a host running a memory-sensitive JVM alongside
several containers, so apply it **on the Proxmox host**:

```bash
# on the Proxmox host, not in the container
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/60-swappiness.conf
sysctl --system                 # verify: sysctl vm.swappiness
```

This is host-wide and affects every guest, which is why `deploy.sh` reports the
current value and the command to change it rather than changing it for you.

To give one container more headroom without touching the host, size its swap
directly instead:

```bash
pct set 200 --swap 2048         # MB
```

## Useful commands (on Proxmox host)

```bash
pct enter 200                          # open a shell inside the container
pct stop 200 && pct start 200          # restart the container
pct exec 200 -- docker compose -f /opt/craftcontrol/docker-compose.yml logs -f
pct exec 200 -- docker compose -f /opt/craftcontrol/docker-compose.yml ps
```
