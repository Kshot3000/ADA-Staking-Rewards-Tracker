# ADA Staking Rewards Tracker

A lightweight, static website to track your personal Cardano staking rewards per epoch.

Inspired by pool.pm, pooltool.io, cardanoscan.io, cexplorer.io, adastat.net.

## Features

- Connect your Cardano wallet via CIP-30 (Nami, Eternl, Yoroi, Flint) or paste an address manually
- View lifetime rewards and current epoch
- Chart and table of rewards per epoch
- Shows staking pool ID
- Data sourced from Koios REST API (free, no API key required)

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Settings → Pages → Deploy from branch `main` / root
3. Visit `https://<user>.github.io/ADA-Staking-Rewards-Tracker/`

## Local development

Open `index.html` in a browser, or serve with a static server:

```bash
python -m http.server 8000
```

## Notes

- The site runs entirely in the browser. No private keys are ever exposed.
- Koios API is public and CORS-enabled. For heavy use, consider running your own Koios instance or using Blockfrost with an API key.
- Rewards are displayed in ADA (1 ADA = 1,000,000 lovelace).

## License

MIT
