#cloud-config
package_update: true
package_upgrade: true

packages:
  - jq
  - zsh
  - git
  - curl

runcmd:
  # Shell setup (zsh + oh-my-zsh)
  - chsh -s /usr/bin/zsh root
  - sh -c "RUNZSH=no CHSH=no $(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
  - git clone https://github.com/zsh-users/zsh-autosuggestions /root/.oh-my-zsh/custom/plugins/zsh-autosuggestions
  - git clone https://github.com/zsh-users/zsh-syntax-highlighting /root/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
  - sed -i 's/^plugins=.*/plugins=(git docker kubectl sudo history zsh-autosuggestions zsh-syntax-highlighting)/' /root/.zshrc
  # Powerlevel10k
  - git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /root/.oh-my-zsh/custom/themes/powerlevel10k
  - sed -i 's/^ZSH_THEME=.*/ZSH_THEME="powerlevel10k\/powerlevel10k"/' /root/.zshrc
  - cp /root/.oh-my-zsh/custom/themes/powerlevel10k/config/p10k-lean.zsh /root/.p10k.zsh
  - sed -i "s/POWERLEVEL9K_MODE=nerdfont-complete/POWERLEVEL9K_MODE=powerline/" /root/.p10k.zsh
  - sed -i "s/POWERLEVEL9K_PROMPT_ADD_NEWLINE=true/POWERLEVEL9K_PROMPT_ADD_NEWLINE=false/" /root/.p10k.zsh
  - sed -i "s/POWERLEVEL9K_TRANSIENT_PROMPT=off/POWERLEVEL9K_TRANSIENT_PROMPT=always/" /root/.p10k.zsh
  - sed -i "/newline/d" /root/.p10k.zsh
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
