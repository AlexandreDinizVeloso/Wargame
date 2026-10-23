# Concórdia — Trilha original · HTML Cinematic Edition

Cinco composições originais acompanham a campanha e suas cenas. São arquivos **OGG Vorbis estéreo, 44,1 kHz**, entregues junto com o jogo e reproduzidos pelo mixer Web Audio do navegador. A trilha não depende de serviços externos, streaming, chaves de API ou arquivos baixados durante uma partida.

Cada faixa também possui um **MP3 estéreo a 128 kbit/s**, com o mesmo nome e extensão `.mp3`, para navegadores que não decodificam Vorbis, como versões antigas do Safari. OGG é a primeira opção; MP3 preserva a nova composição quando esse formato não está disponível.

| Arquivo           | Tema                     | Duração | Uso                                          |
| ----------------- | ------------------------ | ------- | -------------------------------------------- |
| `bgm-peace.ogg`   | **Atlas das Coroas**     | 72 s    | Planejamento, comércio e diplomacia; loop.   |
| `bgm-war.ogg`     | **Estandartes ao Vento** | 60 s    | Campanha em guerra; loop.                    |
| `bgm-battle.ogg`  | **Aço e Pólvora**        | 40 s    | Cinematics de combate; loop.                 |
| `bgm-victory.ogg` | **O Peso da Vitória**    | 16 s    | Desfecho vitorioso; final com cauda e fade.  |
| `bgm-defeat.ogg`  | **Depois das Cinzas**    | 18 s    | Desfecho de derrota; final com cauda e fade. |

## Composição e instrumentos

A partitura usa uma frase harmônica de oito compassos em Ré menor: **Ré menor → Si♭ maior → Fá maior → Dó maior → Sol menor → Ré menor/Fá → Si♭ maior → Lá maior**. Os temas desenvolvem melodias de pergunta e resposta com três variações de arranjo. A vitória resolve o motivo em Ré maior; a derrota o transforma em uma elegia lenta.

A síntese modela **cordas de câmara, violoncelo, alaúde, flauta, trompa, tímpanos, tambores e sinos graves**, com ataques individuais, envelopes por instrumento, harmônicos limitados, vozes levemente desafinadas e posições estéreo. Reflexos curtos e uma cauda difusa formam a reverberação. Não há osciladores quadrados/serrilhados nem ruído branco aberto. Esses arquivos são instrumentos sintetizados, não gravações de uma orquestra.

As fontes PCM são normalizadas para pico **0,48** antes da compressão. As faixas de loop carregam as caudas do último compasso para o início e corrigem suavemente a junção. Os ganhos e a transição entre temas ficam no mixer do jogo; o volume geral, o canal Música e o mute continuam respeitados.

## Origem e direitos

**Composição, arranjo, timbres e renderização originais produzidos para este repositório.** Não foram incorporados gravações, melodias comerciais, bibliotecas de amostras ou modelos de terceiros. Os arquivos seguem os mesmos termos de uso do projeto; não exigem crédito a fornecedores de áudio externos. O manifest registra os nomes, as durações, os parâmetros de renderização e SHA-256 dos arquivos entregues.

## Reprodução da geração

Na raiz do repositório, com Node.js e `ffmpeg` (encoders `libvorbis` e `libmp3lame`) disponíveis:

```sh
node --import tsx scripts/generate-music-assets.ts
```

O script contém a partitura e os sintetizadores. Cria temporários em `.local/audio-generation/`, codifica OGG e MP3 a partir do PCM original, remove os WAVs temporários depois da conversão e grava os dez arquivos e `manifest.json` nesta pasta. `ffmpeg` só é necessário para regenerar as músicas; quem joga recebe os arquivos prontos. O manifest também informa URL, tamanho e SHA-256 do fallback MP3.

Os antigos `bgm-peace.wav` e `bgm-war.wav`, mono/16 s, permanecem como **último fallback de compatibilidade**, depois do OGG e do MP3. Os WAVs antigos não são a composição nova. O gerador `scripts/generate-sfx-assets.ts` preserva a geração desses fallbacks e cuida dos efeitos sonoros.
