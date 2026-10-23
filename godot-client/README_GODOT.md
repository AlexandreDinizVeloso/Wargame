# Concórdia 3D — War Table Edition · v1.1

Cliente **Godot 4.3+ Standard**, em GDScript, para o mesmo servidor Node.js usado pelo navegador. Não precisa da edição .NET. O projeto usa Compatibility 3D e MSAA 4× para funcionar em mais GPUs; a taxa de quadros depende da máquina e do driver.

## Abrir e jogar

1. Instale Node.js 20.19+ ou 22.12+ e [Godot 4.3 ou superior](https://godotengine.org/download/).
2. Na raiz do repositório, execute:

   ```sh
   npm ci
   npm run godot:sync
   npm run dev
   ```

3. Abra `godot-client/project.godot` no Godot e pressione **F5**. Alternativamente, use `npm run godot:editor` ou `npm run godot` em outro terminal.
4. No cliente, conecte a `http://localhost:3000`. Escolha seu nome/nação e crie uma campanha, ou entre com o código da sala aberta por outro cliente Godot ou pelo navegador.
5. O anfitrião adiciona bots até haver pelo menos três participantes e inicia a partida. São aceitos de três a oito jogadores/bots. As ordens são simultâneas: todos confirmam para resolver a rodada.

Se o executável Godot não estiver no `PATH`, defina `GODOT_BIN`. Exemplo no PowerShell:

```powershell
$env:GODOT_BIN = 'C:\Godot\Godot_v4.3-stable_win64.exe'
npm.cmd run godot:editor
```

O cliente possui uma prévia local do mapa para abrir sem o servidor. **Criar salas, enviar ordens e resolver turnos requer conexão com Node.js.** A sincronização copia geometrias e fontes do repositório; não há download de modelos externos para abrir o projeto.

## Controles

| Ação                                      | Controle                                                             |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Mover a câmera                            | WASD ou arrastar botão do meio                                       |
| Orbitar a câmera                          | Alt + botão do meio / Q e E                                          |
| Aproximar/afastar                         | Roda do mouse                                                        |
| Qualidade gráfica                         | Seletor Alta/Equilibrada/Leve no topo, ou F6                         |
| Selecionar região/miniatura               | Clique esquerdo                                                      |
| Marchar/atacar com a formação selecionada | Clique direito na região ou em qualquer prop nela                    |
| Embarcar                                  | Selecione o exército e escolha uma frota no inspetor                 |
| Desembarcar                               | Selecione o exército embarcado e clique direito na costa             |
| Construir/recrutar                        | Selecione uma cidade própria                                         |
| Cancelar uma ordem                        | Crônica / Ordens → × na ordem exata                                  |
| Resolver a rodada                         | Confirmar ordens; pode reabri-las enquanto ainda houver planejamento |

As duas janelas de inspeção e Crônica são independentes, móveis e redimensionáveis pelo canto. O HUD mostra **Ouro disponível**, descontando as ordens reservadas. Custos, condições de guerra, disponibilidade das construções e resultados vêm do servidor; o cliente não resolve combates nem aceita ordens por conta própria.

O perfil **Alta** mantém MSAA4×. **Equilibrada** e **Leve** reduzem sombras, partículas ou resolução3D para máquinas com menos recursos. Essa escolha é local e não altera as regras ou o estado da partida. Também é possível iniciar com `--quality=low` depois de `--` na linha de comando.

O painel Minha Nação contém o Conselho, seus efeitos temporários, objetivos secretos e doutrinas. Diplomacia permite declarar guerras, negociar alianças, responder ofertas e propor paz branca. Ao tentar marchar sobre um reino sem guerra ativa, há confirmação explícita da declaração e do movimento.

## Servidor, Radmin e IPv6

Para jogar em computadores diferentes, todos devem apontar para a mesma máquina que executa Node.js. Use a URL do IP Radmin, por exemplo `http://26.x.x.x:3000`, ou uma URL IPv6 entre colchetes, como `http://[endereco-ipv6]:3000`. O anfitrião precisa permitir a porta 3000 no firewall. O servidor é a autoridade; não é necessário alterar o projeto nem reescrever regras para trocar a rede.

O polling usa uma única fila HTTP autenticada e entrega apenas o `GameView` da vaga. Credenciais ficam em `user://concordia-session.cfg` e não são registradas no console. Após uma interrupção, use **Retomar minha última sessão**. Salas sem ações humanas por 15 minutos são arquivadas; a retomada é explícita, preservando o comportamento do navegador. Não compartilhe o arquivo privado de sessão.

## Exportar Windows (.exe)

1. No editor Godot, instale os **Export Templates da mesma versão** pelo menu Editor → Manage Export Templates.
2. Em Project → Export, selecione o preset **Windows Desktop** incluído e pressione **Export Project**. O `.exe` incorpora o pacote do jogo.
3. Ou, da raiz, execute:

   ```sh
   npm run godot:export:windows
   ```

   A saída automatizada fica em `.local/godot-build/Concordia.exe`. O preset do editor aponta para `godot-client/build/Concordia.exe`.

Se os templates não estiverem instalados, o Godot informa o caminho necessário e a exportação falha; abrir e executar o projeto com F5 continua funcionando. O executável é o cliente: o servidor Node.js continua necessário, localmente ou em outra máquina da rede.

## Organização e validação

- `scripts/NetworkClient.gd`: bootstrap, lobby, sessões, fila serial de comandos, polling e recuperação.
- `scripts/NativeMain.gd`: conexão entre rede, mesa, HUD e transições.
- `scripts/WarTable3D.gd`: peças extrudadas, câmera orbital, raycast, oceano e estações.
- `scripts/Props3DFactory.gd`: miniaturas físicas de tropas, galeões e edifícios.
- `scripts/HUDController.gd` e `FloatingPanel.gd`: controles e janelas nativas.
- `scripts/WarCutscene3D.gd`: brasões 3D animados, declaração de guerra e transição de estação de 2,5 segundos.
- `data/`: cópia sincronizada da geometria, schema e fontes licenciadas.

```sh
npm run godot:check
```

Esse comando importa recursos e carrega o projeto no editor em modo headless. A entrega também usa testes do protocolo HTTP e do jogo compartilhado. Para medir a cena com janela, execute `npm run godot:benchmark`; o modo headless não comprova desempenho gráfico. A nuvem usa renderização por CPU (llvmpipe) e registrou 7,7 / 10,1 / 17,0 FPS nos perfis Alta / Equilibrada / Leve. A meta de 60 FPS ainda exige validação em uma GPU com aceleração de hardware. Veja as [condições da medição](../docs/V1_1.md#medição-desta-entrega).
