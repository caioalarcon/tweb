# Telegram Web - View Once Helper (Chrome Extension)

Pequena extensão de conteúdo (Manifest V3) para o Chrome/Chromium que injeta um seletor de TTL no Telegram Web e força o preenchimento do campo `ttl_seconds` durante o envio de arquivos.

## O que ela faz

- Adiciona um dropdown flutuante fixo no canto inferior direito com as opções:
  - `Sem timer` (default)
  - `Visualização única`
  - `3s`, `10s`, `30s`
- Replica o mesmo seletor dentro de popups/modal de envio (quando encontrados) para ficar próximo da área de legenda.
- Propaga a escolha para o contexto da página e cria um patch em `appMessagesManager.sendFile` para inserir `ttl_seconds` antes do envio.
- Persiste a escolha em `localStorage` para que o timer permaneça entre sessões.

> Observação: o hook procura o `appMessagesManager` em globais acessíveis do Telegram Web. Caso a estrutura mude ou os objetos sejam ofuscados, será necessário ajustar a heurística de descoberta no `content-script.js`.

## Instalação manual

1. Execute um build/serve normal do Telegram Web ou abra `https://web.telegram.org` diretamente.
2. Abra `chrome://extensions` no navegador.
3. Ative o "Modo do desenvolvedor" (canto superior direito).
4. Clique em "Carregar sem compactação" e selecione a pasta `extensions/view-once-helper` dentro deste repositório.
5. Abra ou recarregue o Telegram Web; o seletor "TTL da mídia" deve aparecer no canto inferior direito.

## Como funciona o patch

O `content-script.js` injeta um script no contexto da página que:

1. Escuta um evento `tweb-view-once:set-ttl` para obter o valor do timer escolhido pelo usuário.
2. Localiza o `appMessagesManager` buscando globais com os métodos `sendFile`, `sendTextMessage` e `sendMultiMedia`.
3. Sobrescreve `sendFile` adicionando `ttl_seconds` (usa `1` quando a opção é "visualização única"; demais valores são segundos reais).

Se o timer estiver em `Sem timer`, o `sendFile` original é chamado sem alterações.

## Próximos passos / ideias

- Ajustar seletores do popup para combinar exatamente com a estrutura do modal de envio do Telegram Web (atualmente é heurística genérica `div[role="dialog"], .popup, .modal-dialog`).
- Copiar o valor de TTL também para envios agrupados/álbuns (ex.: interceptar `sendMultiMedia`).
- Adicionar UI específica no "..." (three dots) do popup ou no header do modal, conforme feedback do usuário.
