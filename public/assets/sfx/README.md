# Efeitos de campanha e cinema · v1.2

Quatorze efeitos originais em PCM mono, 44,1 kHz e 16 bits. Foram compostos e sintetizados para Concórdia, sem gravações, vozes, bibliotecas de amostras ou serviços externos. O navegador carrega os WAVs locais; o mesmo DSP determinístico fornece os efeitos durante o carregamento ou se uma transferência falhar.

| Arquivo               | Cena / material                         | Duração | Pico PCM |
| --------------------- | --------------------------------------- | ------- | -------- |
| `cannon.wav`          | Canhão grave com cauda de pólvora       | 1,8 s   | 0,24     |
| `musket.wav`          | Salva de três mosquetes                 | 1,45 s  | 0,19     |
| `steel.wav`           | Choques de lâminas e escudos            | 1,65 s  | 0,16     |
| `charge.wav`          | Passos em aceleração e trompas de carga | 3,2 s   | 0,21     |
| `impact.wav`          | Impacto grave e madeira                 | 1,8 s   | 0,20     |
| `naval.wav`           | Água, casco e artilharia distante       | 3,6 s   | 0,19     |
| `battle-ambience.wav` | Vento e tiros distantes                 | 8 s     | 0,075    |
| `victory.wav`         | Cadência ascendente de vitória          | 3,8 s   | 0,19     |
| `defeat.wav`          | Cadência descendente de derrota         | 3,8 s   | 0,16     |
| `season.wav`          | Vento e sinos suaves de transição       | 1,6 s   | 0,12     |
| `horn.wav`            | Trompa de declaração de guerra          | 1,5 s   | 0,20     |
| `march.wav`           | Passos curtos e abafados                | 0,9 s   | 0,14     |
| `sail.wav`            | Água e madeira em navegação             | 2,2 s   | 0,12     |
| `coin.wav`            | Moedas do conselho                      | 0,9 s   | 0,20     |

## Regenerar

```sh
node --import tsx scripts/generate-sfx-assets.ts --sfx-only
```

O código está em `shared/audioDSP.ts`: envelopes suaves, ruído marrom filtrado e parciais senoidais afinadas. O filtro Butterworth e a normalização limitam os picos. A quantização trunca em direção a zero. Os cinco efeitos anteriores mantêm seus filtros e limites; os novos efeitos acrescentam materiais e pequenas frases musicais, sem ondas quadradas ou serrilhadas.

Sem `--sfx-only`, o gerador também recria os dois WAVs musicais curtos de compatibilidade. A trilha principal da v1.2 é composta pelos cinco OGGs documentados em `../music/README.md`.

## Integração

- O cinema dispara os efeitos junto das fases de artilharia, mosquetes, carga e resultado. SFX não calculam nem alteram combate.
- Até quatro fontes de combate tocam ao mesmo tempo; chamadas duplicadas do mesmo efeito em menos de 80 ms são descartadas.
- Pular ou fechar uma batalha interrompe efeitos de combate, marcha e navegação; o som da interface é preservado.
- Ocultar a aba ou silenciar interrompe as fontes. Não há uma fila de tiros atrasados ao retornar.
- O mixer mantém seis canais independentes: Geral 80%, Música 75%, Combate 18%, Marcha 12%, Navegação 10%, Interface 20%. Preferências já salvas continuam válidas.
- O mixer oferece a aba **Trilha e efeitos** para ouvir os temas e os principais SFX. As prévias de música reduzem o fundo e são encerradas ao fechar a janela.
