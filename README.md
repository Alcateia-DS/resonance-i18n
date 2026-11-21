# resonance-i18n

Repositório oficial de dicionários de tradução (i18n) do **Resonance**.

Este repositório contém **apenas arquivos de dados JSON estáticos** e suas ferramentas de validação em CI — nenhum código daqui é executado dentro dos aplicativos.

## Estrutura

- `locales.json` — lista ordenada de códigos BCP-47 ativos (idioma de origem e reserva: `pt-BR`).
- `locales/<codigo>.json` — dicionário principal compartilhado entre Web, Desktop (Rust) e Android.
- `native/<app>/<codigo>.json` — textos específicos de plataforma (`native.*` para `android`, `rust`, etc.).
- `manifest.json` — inventário versionado com contagem de chaves e checksums `sha256` por arquivo.

## Testando localmente em outro projeto do Resonance

Clone este repositório na pasta esperada ao lado do projeto consumidor (ex.: `projects/resonance/i18n` ou definindo `RESONANCE_I18N_DIR`):

```zsh
git clone git@github.com:Alcateia-DS/resonance-i18n.git i18n
```

Os scripts de build do consumidor usam a cópia local quando presente (ou baixam a revisão travada por SHA-256 em CI/release).

## Validação local

```zsh
npm run validate
npm test
```

## Contribuições

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Todo Pull Request passa por revisão humana obrigatória via `CODEOWNERS` e validação estrita de chaves, placeholders e segurança.
