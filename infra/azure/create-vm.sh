#!/usr/bin/env bash
# Creates the Lumen VM on Azure with the az CLI: resource group + tags, static public IP, NSG (22 from your IP only,
# 80/443 public), Ubuntu 24.04 VM (B1ms = 1 vCPU / 2 GB by default; cloud-init adds 2 GB swap), SSH-key login only,
# cloud-init that installs Docker + compose + ufw + fail2ban. Nothing else is created (no storage account, no
# monitoring, no bastion).
#
#   infra/azure/create-vm.sh --name lumen --location southeastasia [--size Standard_B1ms] [--ssh-key ~/.ssh/id_ed25519.pub]
#                            [--ssh-source <ip or cidr>]   # default: this machine's public IP (curl ifconfig.me); '*' = anywhere (warned)
#   env: AZ_SUBSCRIPTION (optional; defaults to the CLI's current subscription), AZ_BUDGET_EUR (optional budget alert, see below)
#
# Idempotent: every `az ... create` is skipped when the resource already exists (to change the SSH source later:
# az network nsg rule update -g rg-<name> --nsg-name nsg-<name> -n allow-ssh --source-address-prefixes <new ip>/32, and
# on the VM: sudo ufw delete allow from <old> to any port 22 proto tcp && sudo ufw allow from <new> to any port 22 proto tcp).
# Prints the public IP at the end — put it in your DNS as an A record for APP_DOMAIN, then run infra/deploy.sh.
set -euo pipefail

NAME="lumen"
LOCATION="southeastasia"
SIZE="Standard_B1ms"
SSH_KEY="${HOME}/.ssh/id_ed25519.pub"
SSH_SOURCE=""
ADMIN_USER="lumen"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    --size) SIZE="$2"; shift 2 ;;
    --ssh-key) SSH_KEY="$2"; shift 2 ;;
    --ssh-source) SSH_SOURCE="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[[ -f "$SSH_KEY" ]] || { echo "SSH public key not found: $SSH_KEY (ssh-keygen -t ed25519)" >&2; exit 2; }
command -v az >/dev/null || { echo "az CLI missing (https://aka.ms/installazurecli)" >&2; exit 2; }
if [[ -n "${AZ_SUBSCRIPTION:-}" ]]; then az account set --subscription "$AZ_SUBSCRIPTION"; fi

# SSH source: the caller's public IP unless given; '*' only as an explicit choice or when the lookup fails
if [[ -z "$SSH_SOURCE" ]]; then
  MY_IP="$(curl -fsS --max-time 8 https://ifconfig.me 2>/dev/null || curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
  if [[ "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then SSH_SOURCE="${MY_IP}/32"; else SSH_SOURCE="*"; fi
fi
[[ "$SSH_SOURCE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && SSH_SOURCE="${SSH_SOURCE}/32"
if [[ "$SSH_SOURCE" == "*" ]]; then
  echo "WARNING: SSH (port 22) will be open to the whole internet (public IP lookup failed or --ssh-source '*'); key-only login + fail2ban still apply." >&2
  UFW_SSH_RULE="ufw allow 22/tcp"
else
  echo "== SSH allowed from ${SSH_SOURCE} only (NSG + ufw)"
  UFW_SSH_RULE="ufw allow from ${SSH_SOURCE} to any port 22 proto tcp"
fi

RG="rg-${NAME}"
VM="vm-${NAME}"
IP="pip-${NAME}"
NSG="nsg-${NAME}"
VNET="vnet-${NAME}"
SUBNET="snet-${NAME}"
NIC="nic-${NAME}"
TAGS=(project=lumen owner=personal purpose=private-streaming)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_INIT="$(mktemp)"
trap 'rm -f "$CLOUD_INIT"' EXIT
# inject the public key + the ufw SSH rule into cloud-init (the deploy user `lumen` gets the same key as the az admin user)
sed -e "s|__SSH_PUBLIC_KEY__|$(cat "$SSH_KEY")|" -e "s|__UFW_SSH_RULE__|${UFW_SSH_RULE}|" "$HERE/cloud-init.yaml" > "$CLOUD_INIT"

exists() { az "$@" --only-show-errors >/dev/null 2>&1; }

echo "== resource group $RG ($LOCATION)"
exists group show -n "$RG" || az group create -n "$RG" -l "$LOCATION" --tags "${TAGS[@]}" -o none

echo "== static public IP $IP"
exists network public-ip show -g "$RG" -n "$IP" || az network public-ip create -g "$RG" -n "$IP" --sku Standard --allocation-method Static --version IPv4 --tags "${TAGS[@]}" -o none

echo "== NSG $NSG (22 from ${SSH_SOURCE}, 80, 443)"
exists network nsg show -g "$RG" -n "$NSG" || az network nsg create -g "$RG" -n "$NSG" --tags "${TAGS[@]}" -o none
prio=100
for rule in "ssh:22:Tcp:${SSH_SOURCE}" "http:80:Tcp:*" "https:443:Tcp:*" "https-udp:443:Udp:*"; do
  IFS=: read -r rname port proto source <<<"$rule"
  exists network nsg rule show -g "$RG" --nsg-name "$NSG" -n "allow-$rname" || az network nsg rule create -g "$RG" --nsg-name "$NSG" -n "allow-$rname" --priority "$prio" --direction Inbound --access Allow --protocol "$proto" --destination-port-ranges "$port" --source-address-prefixes "$source" -o none
  prio=$((prio + 10))
done

echo "== vnet $VNET / subnet $SUBNET / nic $NIC"
exists network vnet show -g "$RG" -n "$VNET" || az network vnet create -g "$RG" -n "$VNET" --address-prefix 10.42.0.0/24 --subnet-name "$SUBNET" --subnet-prefix 10.42.0.0/26 --tags "${TAGS[@]}" -o none
exists network nic show -g "$RG" -n "$NIC" || az network nic create -g "$RG" -n "$NIC" --vnet-name "$VNET" --subnet "$SUBNET" --network-security-group "$NSG" --public-ip-address "$IP" --tags "${TAGS[@]}" -o none

echo "== VM $VM ($SIZE, Ubuntu 24.04, SSH key only)"
if ! exists vm show -g "$RG" -n "$VM"; then
  az vm create -g "$RG" -n "$VM" --image Ubuntu2404 --size "$SIZE" --nics "$NIC" \
    --admin-username "$ADMIN_USER" --ssh-key-values "$SSH_KEY" --authentication-type ssh \
    --os-disk-size-gb 32 --storage-sku StandardSSD_LRS --custom-data "$CLOUD_INIT" \
    --tags "${TAGS[@]}" -o none
fi
# auto-shutdown is NOT configured (24/7 app); boot diagnostics off (nothing to pay for)

if [[ -n "${AZ_BUDGET_EUR:-}" ]]; then
  echo "== budget alert ${AZ_BUDGET_EUR} EUR/month on $RG (consumption API; needs the Cost Management permission)"
  SUB="$(az account show --query id -o tsv)"
  START="$(date -u +%Y-%m-01)"
  az consumption budget create --budget-name "budget-${NAME}" --amount "$AZ_BUDGET_EUR" --category cost --time-grain monthly \
    --start-date "$START" --end-date "2030-12-01" --resource-group "$RG" -o none 2>/dev/null \
    || echo "   (budget creation failed — create it in the portal: Cost Management → Budgets, scope $RG, alert at 80 %)"
  echo "   subscription $SUB"
fi

PUBLIC_IP="$(az network public-ip show -g "$RG" -n "$IP" --query ipAddress -o tsv)"
cat <<EOF

VM ready: ssh ${ADMIN_USER}@${PUBLIC_IP}   (cloud-init needs ~2 min: ssh ... 'cloud-init status --wait')
SSH source: ${SSH_SOURCE}
Next steps:
  1. DNS: A record  <APP_DOMAIN>  ->  ${PUBLIC_IP}
  2. .env on your PC: APP_URL=https://<APP_DOMAIN>  APP_DOMAIN=<APP_DOMAIN>  ACME_EMAIL=<you@example.com>  + keys
  3. VM_HOST=${PUBLIC_IP} infra/deploy.sh
EOF
