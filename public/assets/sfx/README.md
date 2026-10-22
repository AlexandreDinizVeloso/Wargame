# Efeitos opcionais

Adicione arquivos de áudio licenciados para uso no jogo: `cannon.ogg`, `march.ogg`, `sail.ogg`, `horn.ogg`, `coin.ogg` (ou `.mp3`). O servidor detecta os arquivos presentes; o navegador os decodifica em AudioBuffer após desbloquear o áudio. Até que um buffer esteja pronto, o sintetizador físico responde imediatamente. Arquivos ausentes, inválidos ou bloqueados mantêm o fallback.

Execute `npm run build` após adicionar arquivos em produção. Música e efeitos conservam volumes separados. Nenhum áudio externo é necessário.
