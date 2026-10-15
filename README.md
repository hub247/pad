# Pad Worship Studio • V12

Pacote da aplicação web com os itens 1 a 38 implementados. O cabeçalho mostra apenas Pad / Worship Studio; a versão aparece em Ajustes > Sobre.

## Atualizar sem perder os áudios

1. Faça uma cópia de segurança da pasta do projeto atual.
2. Extraia o ZIP. Copie o conteúdo de `pad-v12/` para a raiz do seu projeto.
3. Substitua **index.html, app.js, styles.css, sw.js, manifest.webmanifest e icons/**. Os arquivos app.js e styles.css são obrigatórios nesta versão.
4. **Preserve todos os seus MP3 em audio/pad/ e audio/metronomo/.** Este pacote não contém os seus áudios e não os substitui.
5. Publique os arquivos na mesma origem e no mesmo caminho do app atual. Feche e reabra o app depois da atualização. Não apague os dados do site se quiser manter setlists e preferências.
6. Teste pelo endereço HTTPS publicado, não pelo caminho `C:/.../index.html`. Para desenvolvimento, um servidor HTTP local também pode ser usado.

O código tenta migrar as preferências e setlists armazenadas pelas versões V8 a V11, quando elas existem no mesmo navegador e na mesma origem. Isso não recupera dados que já foram apagados ou salvos em outro dispositivo. As versões anteriores não estão incluídas neste pacote.

## Estrutura dos áudios

- Pad: `audio/pad/<biblioteca>/<biblioteca>-<nota>.mp3`
- Exemplos: `audio/pad/worship/worship-C.mp3` e `audio/pad/worship/worship-C#.mp3`.
- Metrônomo: `audio/metronomo/0030bpm_1x4.mp3`, `0030bpm_2x4.mp3`, `0030bpm_3x4.mp3`, `0030bpm_4x4.mp3`.
- Os arquivos de metrônomo devem ser os seus arquivos-base a 30 BPM. O app ajusta a velocidade para o BPM escolhido.
- Os arquivos NOMES_ESPERADOS.txt são apenas referências. Não são arquivos de áudio.

## Operação

- Toque na nota para tocar. Toque novamente na nota ativa ou em Parar pad para sair com fade.
- Entrada e Saída: chips de 2, 4, 6 e 8 segundos acima das notas. A troca de nota faz crossfade.
- O ganho é automatizado pelo Web Audio (GainNode), em vez de aguardar e cortar o som. O volume do dispositivo continua sendo o limite físico de saída.
- O metrônomo tem barra de largura total, controle de arraste ampliado, −/+, presets, compasso e TAP. Alterar BPM não recria o slider.
- Setlist: toque para iniciar conforme o modo; segure para editar. Há também botão de edição. Use as setas para reordenar.
- Preparar próxima altera a seleção preparada, sem mudar o som atual. Iniciar preparada aplica a configuração da música.
- Apenas preparar não interrompe nem inicia áudio.
- Copiar: aplique um preset a todas ou personalize os campos de cada música; a prévia segue a ordem da setlist. Campos incompatíveis com o modo ficam desabilitados.
- Ajustes: volumes, loops independentes, tema vermelho, tutorial, instalação, status offline e Sobre.
- Modo Palco: pads e metrônomo juntos, ações de parada em faixa separada e trava por pressão longa.

## Sessão, instalação e offline

- Preferências e setlist são armazenadas localmente. A sessão guarda tela, posição, música atual/preparada e Modo Palco.
- Ao recarregar, a restauração não inicia áudio automaticamente. É necessário um toque.
- Não há recarga programada ao voltar à aba. Não é possível impedir o sistema operacional de suspender ou descartar uma página, nem garantir áudio contínuo em segundo plano. A restauração recupera o estado salvo.
- A instalação usa o convite do navegador quando disponível. No iPhone/iPad, o app exibe instruções de Compartilhar > Adicionar à Tela de Início. O app não instala sozinho.
- Offline: a interface fica em cache; somente os áudios já armazenados por completo ficam disponíveis sem rede. Status offline mostra a quantidade armazenada, não garante que toda biblioteca esteja baixada.
- A atualização do service worker não executa recarga forçada durante a reprodução. A limpeza automática é restrita aos caches antigos de interface com prefixo do Pad; os caches de áudio são preservados.
- Bateria e vibração dependem das APIs disponíveis no navegador. Sem API de bateria, nenhum percentual é inventado.

## Verificação e limites dos testes

- Sintaxe de app.js e sw.js verificada com Node.
- Testes de interação e áudio executados em Chromium headless. Os testes usam um sinal de áudio sintético, apenas em memória, para verificar reprodução, ganho progressivo e crossfade. Esse sinal não está no pacote e não representa seus MP3.
- Testes de layout em 320×568, 390×740, 414×896, 768×1024, 1024×768, 1366×768 e 844×390.
- Testes de cache, recarga offline e respostas parciais de áudio (Range) também executados em Chromium.
- Consulte docs/ para a lista de 38 itens e os resultados automatizados.
- **Não houve teste físico em Safari/iPhone/iPad nem com seus MP3 originais.** Valide o áudio nesses aparelhos antes do uso ao vivo. As simulações de tamanho de tela não substituem esse teste.
