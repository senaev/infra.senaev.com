#cloud-config
package_update: true
package_upgrade: true

packages:
  - jq
  - zsh
  - git
  - curl

runcmd:
  # Shell setup (zsh + oh-my-zsh + plugins)
  - chsh -s /usr/bin/zsh root
  - sh -c "RUNZSH=no CHSH=no $(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
  - git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /root/.oh-my-zsh/custom/themes/powerlevel10k
  - git clone https://github.com/zsh-users/zsh-autosuggestions /root/.oh-my-zsh/custom/plugins/zsh-autosuggestions
  - git clone https://github.com/zsh-users/zsh-syntax-highlighting /root/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
  - sed -i 's/^ZSH_THEME=.*/ZSH_THEME="powerlevel10k\/powerlevel10k"/' /root/.zshrc
  - sed -i 's/^plugins=.*/plugins=(git docker kubectl sudo history zsh-autosuggestions zsh-syntax-highlighting)/' /root/.zshrc
  - cp /root/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-lean.zsh /root/.p10k.zsh
  - echo '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' >> /root/.zshrc
  # Tailscale
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --auth-key=${tailscale_auth_key}
  # Helm
  - curl -fsSL https://get.helm.sh/helm-v4.1.1-linux-amd64.tar.gz | tar -xz -C /tmp
  - mv /tmp/linux-amd64/helm /usr/local/bin/helm && chmod +x /usr/local/bin/helm
  # k9s
  - curl -fsSL -L https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_amd64.tar.gz | tar -xz -C /tmp
  - mv /tmp/k9s /usr/local/bin/k9s && chmod +x /usr/local/bin/k9s
