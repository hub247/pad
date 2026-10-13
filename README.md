# Shimmer Pads V6

## Principais mudanças
- HTMLAudioElement como motor principal do pad para melhorar compatibilidade em segundo plano.
- Clique em qualquer nota toca imediatamente.
- Tocar pad usa a nota selecionada; o padrão inicial é C.
- Fade apenas em ações do usuário; loop reinicia sem fade.
- Slider de BPM, campo, botões -/+ e presets.
- Mobile dividido em Tocar, Setlist e Ajustes.
- Modo Palco.
- Desktop em três colunas.
- Estado selecionado diferente de estado tocando.
- Barra inferior aparece apenas quando existe áudio ativo.

## Atualização
Substitua `index.html`, `manifest.webmanifest`, `sw.js`, `README.md` e `icons`. Não apague os MP3 existentes. Após o push, limpe os dados do site no navegador para remover o Service Worker anterior.
