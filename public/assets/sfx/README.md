# Efeitos PCM suaves · v1.1

Os cinco WAVs são PCM mono, 44,1 kHz e 16 bits, gerados deterministicamente pelo projeto. Não usam gravações de terceiros.

| Efeito       | Pico máximo | Filtro biquad passa-baixa | Duração |
| ------------ | ----------- | ------------------------- | ------- |
| `sail.wav`   | 0,12        | 220 Hz                    | 2,2 s   |
| `march.wav`  | 0,14        | 180 Hz                    | 0,9 s   |
| `cannon.wav` | 0,24        | 220 Hz                    | 1,8 s   |
| `horn.wav`   | 0,20        | 250 Hz                    | 1,5 s   |
| `coin.wav`   | 0,20        | 250 Hz                    | 0,9 s   |

Todo buffer passa por `normalizeAndFilterPCM` (Butterworth de dois polos) e depois recebe normalização para o pico alvo. A quantização PCM trunca em direção a zero para não ultrapassar o limite.

Regenerar: `npx tsx scripts/generate-sfx-assets.ts`. Execute `npm run build` para copiar os arquivos para produção. O carregador prefere WAV, admite OGG/MP3 opcionais e usa o mesmo DSP suave como contingência durante carregamento ou falha de rede.

Os canais Combate, Marcha, Navegação e Interface têm ganhos independentes, com padrões 18%, 12%, 10% e 20%. Geral 80% e Música 75% preservam a trilha; o compressor e limitador protegem a saída. Preferências de volume já salvas são preservadas.

Os efeitos usam senóides graves e água/impactos filtrados, sem osciladores quadrados ou dente de serra. Trompas não possuem harmônicos agudos adicionais e as moedas usam frequências de 165/220 Hz. A mesma síntese é usada no fallback do navegador.
