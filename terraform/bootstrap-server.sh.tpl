#!/usr/bin/env bash
set -euo pipefail

echo "👉 [bootstrap-server] Installing necessary packages"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y cloud-init ca-certificates jq zsh git curl rsync sudo
echo "✅ [bootstrap-server] Necessary packages installed"

echo "👉 [bootstrap-server] Setting up qemu-guest-agent"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive  apt-get install -y qemu-guest-agent
systemctl start qemu-guest-agent
echo "✅ [bootstrap-server] qemu-guest-agent set up"

echo "👉 [bootstrap-server] Setting up shell and tools"
chsh -s /usr/bin/zsh root
sh -c "RUNZSH=no CHSH=no $(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
git clone https://github.com/zsh-users/zsh-autosuggestions /root/.oh-my-zsh/custom/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting /root/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
sed -i 's/^plugins=.*/plugins=(git docker kubectl sudo history zsh-autosuggestions zsh-syntax-highlighting)/' /root/.zshrc
echo "✅ [bootstrap-server] Shell and tools set up"

echo "👉 [bootstrap-server] Setting up Powerlevel10k theme"
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /root/.oh-my-zsh/custom/themes/powerlevel10k
sed -i 's/^ZSH_THEME=.*/ZSH_THEME="powerlevel10k\/powerlevel10k"/' /root/.zshrc
cp /root/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-lean.zsh /root/.p10k.zsh
sed -i "s/POWERLEVEL9K_MODE=nerdfont-complete/POWERLEVEL9K_MODE=powerline/" /root/.p10k.zsh
sed -i "s/POWERLEVEL9K_PROMPT_ADD_NEWLINE=true/POWERLEVEL9K_PROMPT_ADD_NEWLINE=false/" /root/.p10k.zsh
sed -i "s/POWERLEVEL9K_TRANSIENT_PROMPT=off/POWERLEVEL9K_TRANSIENT_PROMPT=always/" /root/.p10k.zsh
sed -i "/newline/d" /root/.p10k.zsh
echo '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' >> /root/.zshrc
echo "✅ [bootstrap-server] Powerlevel10k theme set up"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <tailscale_auth_key> <server_name>" >&2
  exit 1
fi

TAILSCALE_AUTH_KEY="$1"
SERVER_NAME="$2"

echo "👉 [bootstrap-server] Setting server name to [$SERVER_NAME]"
hostnamectl set-hostname "$SERVER_NAME"
echo "✅ [bootstrap-server] Server name set"

echo "👉 [bootstrap-server] Configuring swap"
SWAPFILE_PATH="/swapfile"
SWAPFILE_SIZE="2G"
if ! swapon --show=NAME --noheadings | grep -Fxq "$SWAPFILE_PATH"; then
  if [ ! -f "$SWAPFILE_PATH" ]; then
    fallocate -l "$SWAPFILE_SIZE" "$SWAPFILE_PATH"
    chmod 600 "$SWAPFILE_PATH"
    mkswap "$SWAPFILE_PATH"
  fi

  swapon "$SWAPFILE_PATH"
else
  echo "✅ [bootstrap-server] Swap file already active"
fi

if ! grep -qE "^$${SWAPFILE_PATH//\//\\/}[[:space:]]+none[[:space:]]+swap[[:space:]]+sw[[:space:]]+0[[:space:]]+0$" /etc/fstab; then
  echo "$SWAPFILE_PATH none swap sw 0 0" >> /etc/fstab
fi

cat >/etc/sysctl.d/99-swap.conf <<"EOF"
vm.swappiness=10
EOF
sysctl --system >/dev/null
echo "✅ [bootstrap-server] Swap configured"

echo "👉 [bootstrap-server] Installing Tailscale"
curl -fsSL https://tailscale.com/install.sh | sh
echo "✅ [bootstrap-server] Tailscale installed"

echo "👉 [bootstrap-server] Connecting to Tailscale"
tailscale up --auth-key="$TAILSCALE_AUTH_KEY" --hostname="$SERVER_NAME"
echo "✅ [bootstrap-server] Tailscale installed and connected"

# k3s flannel is pinned to tailscale0; Tailscale auto-updates restart tailscaled,
# briefly remove tailscale0, and can leave flannel without cross-node pod routes.
echo "👉 [bootstrap-server] Disabling Tailscale auto-updates"
tailscale set --auto-update=false
echo "✅ [bootstrap-server] Tailscale auto-updates disabled"

echo "👉 [bootstrap-server] Installing Helm"
curl -fsSL https://get.helm.sh/helm-v4.1.1-linux-amd64.tar.gz | tar -xz -C /tmp
mv /tmp/linux-amd64/helm /usr/local/bin/helm
chmod +x /usr/local/bin/helm
echo "✅ [bootstrap-server] Helm installed"

echo "👉 [bootstrap-server] Installing k9s"
curl -fsSL -L https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_amd64.tar.gz | tar -xz -C /tmp
mv /tmp/k9s /usr/local/bin/k9s
chmod +x /usr/local/bin/k9s
echo "✅ [bootstrap-server] k9s installed"
