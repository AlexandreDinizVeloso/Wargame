# Concórdia na nuvem · v0.99

Um processo Node atende o site, `/api/health` e `/ws` na mesma porta. Amigos acessam um link HTTPS; não precisam de Radmin, Node instalado ou IP público em casa. A imagem usa **Node 20 Alpine**, com versão mínima 20.19 para Vite, build em estágio separado, dependências de produção e usuário sem privilégios.

## Docker local ou VPS

Na pasta do repositório:

```sh
docker build -t concordia:rc .
docker volume create concordia-data
docker run -d --name concordia --restart unless-stopped \
  -p 3000:3000 -v concordia-data:/app/.local concordia:rc
curl http://localhost:3000/api/health
```

Abra `http://localhost:3000`. O contêiner escuta em `::`, atendendo IPv4/IPv6 conforme a rede Docker do host. Se o host não oferecer IPv6, acrescente `-e HOST=0.0.0.0`. `PORT` e `ROOMS_STATE_FILE` são configuráveis; o volume deve acompanhar o caminho escolhido.

Para atualizar preservando salas:

```sh
git pull --ff-only
docker build -t concordia:rc .
docker stop concordia
docker rm concordia
docker run -d --name concordia --restart unless-stopped \
  -p 3000:3000 -v concordia-data:/app/.local concordia:rc
```

`docker stop` permite o salvamento e desconecta as sessões, que podem se reconectar com o token da aba. Pare o processo anterior antes de iniciar outro sobre o mesmo volume. O navegador de salas não substitui esse token.

## VPS com HTTPS automático

Uma VPS Linux com Docker Compose, aproximadamente **1 vCPU e 1 GB de RAM**, serve como ponto de partida para um grupo pequeno; dimensione depois de medir salas, histórico e uso de memória. Planos anunciados em torno de **US$5/mês** variam por provedor, região, impostos e data. O build pode precisar de memória adicional; também é possível construir a imagem em outra máquina e enviá-la ao seu registro.

1. Crie a VPS, instale Docker Engine e o plugin Compose seguindo o guia oficial da distribuição.
2. Aponte um registro DNS `A` do seu domínio para o IPv4 da VPS. Adicione `AAAA` somente se esse endereço IPv6 estiver alcançável.
3. Libere TCP 80/443 no firewall da VPS e do provedor. A porta 3000 fica interna no Compose. UDP 443 é opcional para HTTP/3.
4. Clone a branch e execute:

```sh
git clone --branch feat/v0.99-webgl-poda-cinematic \
  https://github.com/AlexandreDinizVeloso/Wargame.git
cd Wargame
export GAME_DOMAIN=play.seu-dominio.com
docker compose up -d --build
docker compose ps
curl https://"$GAME_DOMAIN"/api/health
```

Substitua o domínio pelo seu endereço real. O [Caddyfile](../Caddyfile) obtém e renova o certificado e encaminha HTTP/WebSocket para `game:3000`. O navegador seleciona `wss://` automaticamente sob HTTPS. O Compose aguarda a saúde do jogo antes de subir o proxy.

O volume `game-data` guarda campanhas e hashes de sessão; `caddy-data` guarda certificados. `docker compose down` preserva os volumes. `docker compose down -v` os remove e apaga essas informações.

Para atualizar:

```sh
git pull --ff-only
docker compose up -d --build
```

Confira o painel de saúde e a reconexão após a atualização. Não use múltiplas réplicas sobre o mesmo arquivo: o servidor atual é um processo autoritativo com armazenamento local.

## Hospedagem sem custo para demonstração

Em um provedor que ofereça **web service gratuito com Docker e WebSocket**, por exemplo o plano gratuito do Render quando disponível:

1. Conecte o repositório e selecione a branch v0.95.
2. Crie um serviço web com runtime Docker e o `Dockerfile` da raiz.
3. Defina `HOST=0.0.0.0` e `ROOMS_STATE_FILE=/app/.local/rooms-state.json`. Use a porta indicada pelo provedor; o servidor lê `PORT`.
4. Configure a verificação de saúde em `/api/health` e abra o domínio HTTPS fornecido pelo serviço.

Serviços gratuitos podem suspender por inatividade e usar disco efêmero. **Sem disco persistente, as salas podem desaparecer no reinício/redeploy**; esse caminho serve para demonstrações. Para manter campanhas, use um disco/volume persistente, geralmente pago, ou a VPS com volume descrita acima. Planos e franquias gratuitos precisam ser conferidos no provedor no momento da contratação.

Railway, Fly.io e DigitalOcean também podem executar a imagem: escolha um serviço com processo persistente, suporte a WebSocket e volume montado em `/app/.local`. Créditos de avaliação não significam hospedagem gratuita permanente. Não é necessário banco externo ou chave de API para o jogo.

## Backup e restauração

Com o serviço `game` parado:

```sh
docker compose stop game
docker compose cp game:/app/.local ./backup-concordia
docker compose start game
```

Guarde essa cópia fora da VPS. Ela contém credenciais de reconexão na forma de hashes e o histórico das salas; não a coloque em repositório público. Para restaurar em um volume novo, pare `game`, copie o conteúdo de `backup-concordia/.` para `game:/app/.local/` e inicie novamente. A imagem roda como `node` (UID 1000); um bind mount externo deve permitir escrita a esse usuário.

## Conferência da publicação

- `/api/health` responde com `status:ok`, versão `0.95.0` e protocolo 7.
- Duas abas conseguem criar/entrar na mesma sala e trocar mensagens em tempo real.
- O site é HTTPS e a conexão WebSocket usa WSS.
- Após reiniciar o contêiner com o mesmo volume, a sala reaparece e a aba original recupera seu jogador.
- `docker logs concordia` ou `docker compose logs game` não mostra falhas de persistência.

Os testes automatizados do repositório usam salas temporárias; as instruções acima preparam a implantação. DNS, certificado público e disponibilidade de um provedor só podem ser conferidos quando a instância real estiver configurada.

### Build em rede com certificado corporativo

A imagem aceita uma CA adicional como secret de build, sem incorporá-la na imagem final e sem desativar TLS:

```sh
docker build --secret id=build_ca,src=/caminho/ca-corporativa.crt -t concordia:rc .
```

`HTTP_PROXY`, `HTTPS_PROXY` e `NO_PROXY` podem ser passados como build args quando sua rede exigir. O deploy comum não precisa desse secret. Para conferir a imagem construída localmente, execute `npm run test:docker`; ele cria e remove apenas seu próprio contêiner/volume de teste e verifica a reconexão após reinício.
