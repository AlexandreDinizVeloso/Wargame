# Trilha instrumental procedural · v1.01

`bgm-peace.wav` e `bgm-war.wav` são faixas PCM mono de 16 segundos, 44,1 kHz e 16 bits, geradas inteiramente pelo projeto, sem gravações de terceiros.

A paz usa Ré menor → Si bemol maior → Sol menor → Lá maior, cordas quentes, alaúde e pad grave. A guerra acrescenta ostinato de violoncelos, tímpanos e metais graves. As bordas são cruzadas durante 250 ms; o filtro é aquecido ciclicamente e os pontos de junção têm a mesma amostra.

As duas faixas têm pico **0,55**, conforme o limite obrigatório da especificação v1.01. Esse valor prevalece sobre os alvos divergentes nos exemplos da mesma especificação. O volume de música padrão é 0,75; o geral, 0,80, com compressor de segurança compartilhado.

Regenerar: `npx tsx scripts/generate-sfx-assets.ts`; publicar: `npm run build`.
