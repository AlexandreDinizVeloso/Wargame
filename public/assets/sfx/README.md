# Efeitos PCM incluídos

`cannon.wav`, `march.wav`, `sail.wav`, `horn.wav` e `coin.wav` são arquivos PCM reais, mono, 44,1 kHz e 16 bits, gerados pelo projeto com DSP e semente fixa. Não usam gravações de terceiros.

Regenerar: `npx tsx scripts/generate-sfx-assets.ts`. Execute `npm run build` para copiá-los para produção. O carregador prefere WAV, admite OGG/MP3 opcionais e mantém síntese de contingência durante o carregamento ou se o navegador recusar áudio. Música e efeitos têm volumes separados.
