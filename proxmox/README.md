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

## Useful commands (on Proxmox host)

```bash
pct enter 200                          # open a shell inside the container
pct stop 200 && pct start 200          # restart the container
pct exec 200 -- docker compose -f /opt/craftcontrol/docker-compose.yml logs -f
pct exec 200 -- docker compose -f /opt/craftcontrol/docker-compose.yml ps
```
