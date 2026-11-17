# Civitas

A Civitas é uma plataforma colaborativa de monitoramento urbano desenvolvida como projeto acadêmico da disciplina Application Development (Global Solution 2026.2). Cidadãos podem registrar e consultar problemas em espaços públicos para tornar visíveis necessidades da comunidade.

## Módulos

- **Infraestrutura urbana:** vias, calçadas, iluminação, sinalização e espaços públicos.
- **Acessibilidade:** barreiras de circulação, rampas, piso tátil e travessias.
- **Meio ambiente:** descarte irregular, resíduos domésticos, entulho e resíduos eletrônicos.

## Tecnologias

HTML5, CSS3, JavaScript puro, Node.js, Express, MongoDB, Mongoose, dotenv, Multer e Sharp. O mapa usa Leaflet 1.9.4 via CDN e tiles raster do OpenStreetMap como alternativa, além dos estilos CARTO quando a chave está configurada. Fotografias processadas são armazenadas em GridFS.

## Estrutura

```text
public/       Interface, estilos e JavaScript do navegador
src/          Servidor, configuração, model, rotas, controller e validações
  config/     Conexão com MongoDB
  controllers/ Lógica das rotas
  middleware/ Tratamento de erros e rotas inexistentes
  models/     Modelos Mongoose
  routes/     Rotas da API
  services/   Processamento de análises e armazenamento GridFS
  utils/      Validações e cálculos auxiliares
scripts/      Migração e verificações automatizadas
```

## Instalação e execução

1. Instale Node.js (versão LTS) e tenha uma instância MongoDB local ou remota acessível.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Configure `MONGODB_URI` no `.env` com a conexão do MongoDB Atlas e o database `Civitas-Database`. Para habilitar os estilos CARTO claro e escuro, configure também `CARTO_BASEMAP_KEY`. O `.env.example` contém valores fictícios.
4. Confirme que o usuário do Atlas tem acesso ao cluster e que a rede está autorizada no Network Access.
5. Execute em desenvolvimento ou modo normal:

   ```bash
   npm run dev
   # ou
   npm start
   ```

6. Abra [http://localhost:3000](http://localhost:3000), ou a porta indicada pela variável `PORT`.

O servidor só inicia depois de confirmar a conexão com o MongoDB. Se a conexão falhar, confira o serviço e a URI exibida em `.env`. Os documentos são armazenados na coleção `occurrences`.

### Migração dos registros legados

O script `scripts/migrate-occurrences.js` copia os documentos de `test.occurrences` para `Civitas-Database.occurrences`, preservando `_id`, timestamps e demais campos. Ele usa upsert com `$setOnInsert`, não altera nem remove registros de origem e pode ser executado repetidamente. Primeiro confira os totais sem copiar:

```bash
npm run migrate:occurrences -- --check-only
```

Para executar a cópia:

```bash
npm run migrate:occurrences
```

O resultado informa contagens antes e depois, documentos copiados, IDs que já estavam no destino e a verificação de cobertura da origem.

Para verificar a conexão e as rotas sem deixar um registro de teste no Atlas, execute `npm run verify:atlas`. O cadastro válido é exercitado dentro de uma transação que é revertida ao final; a consulta HTTP usa os documentos reais da collection.

Para verificar os contratos estáticos de mapa, atribuição, filtros, formulário e coordenadas, execute `npm run verify:ui`.

Para verificar o processamento de imagens, limites de upload, uso do GridFS e limpeza de arquivos, execute `npm run verify:photos`. O script usa fotos geradas em memória, registros dentro de transações revertidas e remove os arquivos GridFS temporários antes de terminar.

Para verificar filtros, detalhes, mudanças de status, compatibilidade com registros sem histórico e saúde da API/Atlas, execute `npm run verify:management`. Os registros criados pelo teste são revertidos em transação.

Para testar os cálculos auxiliares das análises sem conexão com o banco, execute `npm run verify:analytics:logic`. Para a verificação integrada de agregações e filtros com o MongoDB Atlas, execute `npm run verify:analytics`; o script usa documentos temporários dentro de uma transação revertida.

## API

- `POST /api/occurrences` — valida e cadastra uma ocorrência com status inicial `Pendente`.
- `GET /api/occurrences` — lista até 200 ocorrências; aceita `module`, `category`, `severity`, `status` e `search` como filtros. Use `all=true` para retornar todos os registros.
- `GET /api/occurrences?geolocated=true` — lista todas as ocorrências com coordenadas válidas, sem o limite da lista geral.
- `GET /api/occurrences/stats` — retorna totais por módulo, categoria, gravidade e status, além de `withoutCoordinates`; aceita os filtros da lista.
- `GET /api/occurrences/:id` — retorna os detalhes completos de uma ocorrência.
- `PATCH /api/occurrences/:id/status` — atualiza o status e acrescenta uma entrada ao histórico; recebe `status` e `note` (opcional, até 500 caracteres).
- `GET /api/occurrences/:occurrenceId/photos/:fileId` — exibe uma foto WebP somente quando o arquivo está associado à ocorrência informada.
- `GET /api/config/maps` — retorna exclusivamente `cartoBasemapKey`, uma chave de tile pública para uso no navegador.
- `GET /api/health` — verifica se a API e o MongoDB estão disponíveis, sem retornar dados de conexão.
- `GET /api/analytics` — calcula indicadores, séries temporais, pontos do mapa de calor, áreas de concentração, recorrências e métricas de resolução. Aceita `module`, `category`, `severity`, `status`, `period` (`7d`, `30d`, `90d`, `all` ou `custom`), `start`, `end` e `cellMeters` (`100`, `250`, `500` ou `1000`). Para `custom`, `start` e `end` devem ser datas ISO com fuso horário.

O cadastro aceita até três fotografias JPG/JPEG, PNG ou WebP (5 MB cada). O servidor verifica o conteúdo, redimensiona até 1600 × 1600, converte para WebP e armazena no bucket `occurrencePhotos`; a ocorrência guarda somente as referências. A preferência Claro/Escuro é compartilhada entre o mapa principal e o seletor de localização e fica no `localStorage`. Sem chave CARTO, o mapa continua com OpenStreetMap e a opção escura fica desabilitada.

A página **Gerenciamento** pesquisa por descrição, categoria e localização e combina filtros por módulo, categoria, gravidade e status. O histórico começa com as novas ocorrências; registros antigos sem `statusHistory` permanecem sem histórico inventado até que uma alteração seja feita. A aplicação não possui autenticação: qualquer pessoa com acesso poderá atualizar status. Essas atualizações representam somente o acompanhamento registrado na Civitas e não confirmam ações de órgãos públicos.

## Análises e Estatísticas

A página **Análises e Estatísticas** utiliza a rota `GET /api/analytics` e os dados reais de `Civitas-Database.occurrences`. Ela apresenta indicadores do período, mapa de calor, áreas de concentração, evolução temporal, comparação entre módulos, ocorrências recorrentes e tempo até a primeira transição documentada para `Resolvida`.

As categorias são agrupadas por módulo e nome. Assim, categorias homônimas — por exemplo, `Outros` — permanecem separadas entre infraestrutura, acessibilidade e meio ambiente.

O mapa de calor e os agrupamentos espaciais utilizam somente coordenadas válidas. Registros sem coordenadas continuam participando dos indicadores e podem ser agrupados por endereço normalizado apenas na análise textual de recorrência. As áreas geográficas são células aproximadas, não bairros oficiais. A dimensão norte-sul corresponde ao tamanho nominal selecionado; a dimensão leste-oeste varia com a latitude e é apresentada separadamente.

A evolução temporal agrupa os cadastros por dia, semana ou mês, no fuso `America/Sao_Paulo`. O tempo até resolução é calculado a partir de `createdAt` e do primeiro evento válido de `statusHistory` com `newStatus: "Resolvida"`; documentos sem histórico confiável não recebem uma duração estimada. A mediana só é apresentada quando há pelo menos cinco amostras.

O comando `npm run verify:analytics:logic` valida a separação de categorias por módulo, as dimensões geográficas aproximadas e a preservação de métricas iguais a zero sem precisar acessar o Atlas. O comando `npm run verify:analytics` executa verificações integradas de agregação, filtros, timeline, mapa de calor e histórico com documentos temporários revertidos por transação.

## Estado desta versão

Cadastro, consulta, filtros, dashboard geral, indicadores por módulo, temas dinâmicos, mapa geográfico, gerenciamento e análises estatísticas estão implementados. A geolocalização só é solicitada após o usuário clicar em **Usar minha localização**; a seleção manual no mapa continua disponível. O mapa carrega tiles somente para a área visualizada pelo usuário e mantém a atribuição do OpenStreetMap visível. Os registros antigos continuam acessíveis nas listas e indicadores, mesmo sem coordenadas.

O Leaflet e os tiles OpenStreetMap exigem conexão com a internet. A Geolocation API depende de permissão do usuário e, fora de `localhost`, de um contexto seguro HTTPS.
