# Civitas — Monitoramento urbano

A **Civitas** é uma plataforma web colaborativa para registrar e acompanhar problemas que afetam os espaços públicos. Ela reúne ocorrências de infraestrutura urbana, acessibilidade e meio ambiente em um só lugar, permitindo consultar registros, visualizar sua localização e analisar os dados cadastrados.

## Problema, objetivo e público-alvo

Problemas como vias danificadas, barreiras de acessibilidade e descarte irregular de resíduos podem afetar a segurança, a mobilidade e a qualidade de vida. Muitas vezes, essas situações ficam dispersas e são difíceis de acompanhar.

A Civitas tem como objetivo centralizar esses registros e transformá-los em informações que ajudem a identificar necessidades e ocorrências recorrentes na cidade.

**Público-alvo:** moradores, cidadãos, pessoas com deficiência ou mobilidade reduzida, associações comunitárias e organizações interessadas nas condições dos espaços públicos.

## Objetivos de Desenvolvimento Sustentável (ODS)

- **ODS 11 — Cidades e Comunidades Sustentáveis (principal):** contribui para identificar problemas nos espaços urbanos e apoiar a busca por cidades mais inclusivas, seguras e sustentáveis.
- **ODS 10 — Redução das Desigualdades:** relacionado ao registro de barreiras que dificultam a circulação e o acesso de pessoas com deficiência ou mobilidade reduzida.
- **ODS 12 — Consumo e Produção Responsáveis:** relacionado ao monitoramento de descarte irregular e de resíduos.

## Módulos da plataforma

- **Infraestrutura:** buracos, calçadas danificadas, iluminação, sinalização e espaços públicos.
- **Acessibilidade:** rampas, piso tátil, travessias, acessos e barreiras de circulação.
- **Meio ambiente:** descarte irregular, resíduos domésticos, entulho e resíduos eletrônicos.

A plataforma permite cadastrar ocorrências com categoria, descrição, endereço, gravidade e localização no mapa. Também aceita até três fotografias por ocorrência (JPG/JPEG, PNG ou WebP, até 5 MB cada).

Os registros podem ser pesquisados e filtrados, acompanhados por status e visualizados no mapa. A área **Análises e Estatísticas** reúne gráficos e indicadores calculados a partir dos dados armazenados.

## Indicadores e processamento dos dados

Os indicadores são calculados com os registros da coleção `occurrences` no MongoDB Atlas. Os filtros selecionados na página de análises restringem os dados considerados.

- **Total de ocorrências:** quantidade de registros que atendem aos filtros selecionados.
- **Distribuição por módulo, categoria, gravidade e status:** contagem dos registros agrupados por cada característica. Categorias com o mesmo nome são separadas por módulo.
- **Evolução temporal:** quantidade de ocorrências cadastradas por dia, semana ou mês, conforme o período analisado.
- **Mapa de calor e áreas de concentração:** representam a concentração de registros que possuem coordenadas geográficas. Registros sem coordenadas continuam nas demais consultas e indicadores, mas não aparecem no mapa.
- **Ocorrências recorrentes:** identifica registros próximos por coordenadas ou com endereço normalizado semelhante. É uma indicação de recorrência no local, não uma confirmação de que se trata do mesmo problema.
- **Tempo até a primeira marcação como resolvida:** diferença entre a data de cadastro e a primeira alteração documentada para o status `Resolvida`. Só entram no cálculo ocorrências com histórico suficiente; não é atribuído tempo estimado a registros sem esses dados.

Os status disponíveis são **Pendente**, **Em análise**, **Em andamento** e **Resolvida**. A mudança de status e seu histórico representam o acompanhamento registrado na Civitas; não confirmam uma ação oficial de prefeitura ou outro órgão público.

## Tecnologias

HTML5, CSS3, JavaScript, Node.js, Express e MongoDB Atlas. O projeto utiliza Mongoose para a modelagem, GridFS para armazenar fotografias, Leaflet e OpenStreetMap/CARTO para os mapas e Chart.js para os gráficos.

## Como instalar e executar

### 1. Pré-requisitos

- Node.js (versão LTS) e npm instalados.
- Acesso à internet.
- Acesso ao MongoDB Atlas utilizado pela Civitas.

Confira a instalação no terminal:

```bash
node -v
npm -v
```

### 2. Configurar o MongoDB Atlas

A aplicação utiliza:

- **Database:** `Civitas-Database`
- **Collection:** `occurrences`
- **GridFS bucket:** `occurrencePhotos`

No Atlas, o cluster deve estar ativo, o usuário do banco deve ter permissão de leitura e escrita em `Civitas-Database` e o endereço IP do computador que executará a aplicação deve estar autorizado em **Network Access**.

### 3. Criar o arquivo `.env`

Na pasta principal do projeto — a mesma que contém `package.json` — crie um arquivo chamado `.env` com estas variáveis:

```env
PORT=3010
MONGODB_URI=mongodb+srv://USUARIO:SENHA@SEU_CLUSTER.mongodb.net/Civitas-Database?retryWrites=true&w=majority
CARTO_BASEMAP_KEY=SUA_CHAVE_CARTO
```

Substitua os valores de exemplo pelos dados de conexão do MongoDB Atlas. A chave `CARTO_BASEMAP_KEY` é opcional: sem ela, o mapa continua disponível no modo claro pelo OpenStreetMap, mas o modo escuro do CARTO fica desabilitado.

**Não compartilhe o `.env` nem publique suas credenciais.** Para outra pessoa executar o projeto, forneça as credenciais por um canal privado e autorize o IP dela no Atlas. Se for usada uma regra temporária que permita conexões de qualquer IP (`0.0.0.0/0`), restrinja as permissões do usuário ao banco `Civitas-Database`, proteja a senha e remova a regra após a avaliação.

### 4. Instalar as dependências

Abra a pasta do projeto no Visual Studio Code. No terminal, confirme que está na pasta que contém `package.json` e execute:

```bash
npm install
```

### 5. Iniciar a aplicação

Para iniciar em desenvolvimento:

```bash
npm run dev
```

Ou, para iniciar sem o Nodemon:

```bash
npm start
```

Quando o terminal informar que o servidor está disponível, abra no navegador:

**http://localhost:3010**

Mantenha o terminal aberto enquanto utilizar a plataforma. Para encerrar o servidor, pressione `Ctrl + C` no terminal.

> O servidor conecta ao MongoDB antes de começar a aceitar requisições. Se a conexão falhar, confira a URI, as credenciais, o estado do cluster e a autorização do IP no Atlas. Se a porta 3010 estiver ocupada, encerre a outra execução ou escolha outra porta em `PORT` e use a mesma porta no navegador.

## Observações

A Civitas não exige instalação de MongoDB local: os dados e fotografias são armazenados no MongoDB Atlas. A aplicação não possui autenticação; qualquer pessoa que consiga acessá-la poderá cadastrar ocorrências e alterar seus status. O sistema é um protótipo acadêmico de monitoramento e não possui integração oficial com prefeituras ou confirmação externa da resolução dos problemas.
