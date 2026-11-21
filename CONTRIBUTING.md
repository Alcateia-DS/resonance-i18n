# Contribuindo com traduções (`resonance-i18n`)

Obrigado por ajudar a traduzir o Resonance!

## Regras para Pull Requests

1. **Altere apenas arquivos de idioma (`locales/<codigo>.json` ou `native/<app>/<codigo>.json`) e, se for adicionar um novo idioma, `locales.json`.**
   - Alterações em `.github/`, `scripts/`, `test/`, `LICENSE` ou `pt-BR.json` são restritas aos mantenedores (`CODEOWNERS`).
2. **Mantenha exatamente os mesmos placeholders `{param}` de `pt-BR.json`.**
   - Nunca remova, traduza ou invente variáveis entre chaves (`{to}`, `{count}`, `{version}`, etc.).
3. **Respeite o contrato de chaves e formatação:**
   - JSON válido em UTF-8 (NFC), chaves em ordem alfabética e sem chaves duplicadas.
   - Não invente chaves que não existam em `pt-BR.json`.
   - Mantenha as mesmas marcações inline (`<privacy>...</privacy>`, `<b>...</b>`, etc.) quando existirem no texto base. Não inclua HTML arbitrário (`<script>`, `<img>`, `<svg>`, `javascript:`, `on*=`) nem caracteres invisíveis/bidi (`U+202E`).
4. **Licença e DCO:**
   - Ao enviar um Pull Request, você concorda que suas traduções sejam distribuídas sob a licença [MIT](LICENSE) do repositório e embutidas nos aplicativos oficiais do Resonance (incluindo distribuições proprietárias). Assine seus commits com `git commit -s` (Developer Certificate of Origin).

## Como testar antes de abrir PR

```zsh
npm run validate
npm test
```
