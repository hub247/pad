# Shimmer Pads V4

## Substituição no GitHub
Substitua `index.html`, `manifest.webmanifest`, `sw.js` e a pasta `icons`. Adicione a estrutura `audio/pad` e `audio/metronomo`.

## Pads
Cada biblioteca tem pasta própria, por exemplo: `audio/pad/worship/worship-D.mp3`. Os sustenidos mantêm `#`, por exemplo `worship-C#.mp3`; o app codifica o endereço corretamente.

## Metrônomo
Coloque em `audio/metronomo`: `0030bpm_1x4.mp3`, `0030bpm_2x4.mp3`, `0030bpm_3x4.mp3` e `0030bpm_4x4.mp3`. A V4 usa 30 BPM como base e altera a velocidade conforme o BPM escolhido.

## Atualização PWA
Depois do commit, abra o site, atualize duas vezes ou limpe os dados do site se a versão antiga permanecer em cache.

## Observação
A reprodução web em segundo plano depende do navegador e sistema operacional. A V4 diagnostica interrupções e orienta o usuário, mas a garantia total exige empacotamento nativo.
