# Requisitos — EdgeData (MVP)

Este documento substitui o documento de requisitos anterior do aplicativo de coleta. Ele cobre o
MVP; as fases seguintes estão em [`ROADMAP.md`](ROADMAP.md).

## 1. Problema

Pesquisadores de campo e laboratório coletam dados em planilhas, cadernos e scripts soltos.
Fotos não ficam ligadas aos registros, unidades e condições experimentais se perdem, sensores
geram arquivos sem contexto e, meses depois, ninguém sabe qual ganho, firmware ou versão do
protocolo produziu cada valor. Ferramentas de coleta (ODK, KoBoToolbox) não entendem desenho
experimental nem sensores; plataformas IoT não entendem experimentos; repositórios de dados
recebem arquivos já sem proveniência.

## 2. Proposta

Um app offline-first em que o pesquisador **planeja o experimento, define as variáveis, coleta
(à mão ou com um embarcado) e exporta um dataset autoexplicativo**, com a origem de cada valor
registrada automaticamente.

## 3. Glossário

| Termo | Definição |
|---|---|
| Projeto | Agrupador de experimentos (ex.: uma tese, um convênio) |
| Experimento | Estudo com objetivo, hipótese, desenho e protocolo |
| Protocolo | Metodologia versionada; contém as variáveis |
| Variável | O que é medido ou registrado: tipo, unidade UCUM, faixa, precisão, papel |
| Amostra | Unidade experimental persistente (planta, vaso, parcela, corpo de prova) |
| Sessão | Uma ida a campo ou corrida de aquisição; usa uma versão do protocolo |
| Observação | Valores medidos de uma amostra numa sessão; imutável, corrigida por revisão |
| Leitura | Valor recebido de um sensor de dispositivo |
| Evento | Marcador temporal durante a sessão |
| Dispositivo / Sensor | Hardware de aquisição, descrito pelo manifesto |
| Release | Versão exportada e registrada de um dataset |

## 4. Requisitos funcionais

### Experimentos
- **RF-01** Criar experimento do zero, por template embutido ou importando template (`.edgetemplate.json`).
- **RF-02** Registrar nome, código, descrição, objetivo, hipótese, instituição, laboratório,
  equipe (nome, papel, ORCID), financiamento, local, período, metodologia, critérios de
  inclusão/exclusão e observações.
- **RF-03** Definir desenho experimental: fatores com níveis, tratamentos (fatorial completo ou
  lista explícita), controles, réplicas, blocos, sessões previstas, duração e frequência de coleta.
- **RF-04** Mostrar o total esperado de amostras e de observações e gerar as amostras do plano.
- **RF-05** Alternar entre modo simples e modo científico (campos avançados).

### Variáveis e formulários
- **RF-06** Criar variáveis de amostra e de observação com: ID estável (`snake_case`), rótulo,
  descrição, tipo, unidade UCUM, faixa esperada, resolução, obrigatoriedade, papel
  (identificador, independente, dependente, controle, covariável, metadado) e marcação de dado sensível.
- **RF-07** Tipos: texto curto/longo, inteiro, decimal, categoria, multicategoria, booleano, data,
  hora, escala, imagem, multi-imagem (ângulos), GPS (com precisão), código de barras/QR,
  timestamp automático e UUID automático.
- **RF-08** Campos condicionais: exibir uma variável apenas quando outra satisfaz uma condição.
- **RF-09** Alterar variáveis de um experimento com dados cria nova versão do protocolo.

### Amostras e identificação
- **RF-10** Cadastrar amostras manualmente, em lote (sequencial/fatorial), por CSV ou pelo plano
  do desenho experimental; cada amostra tem UUID e código legível único no experimento.
- **RF-11** Gerar etiquetas em PDF com QR Code (`edgedata://sample/<uuid>?c=<código>`).
- **RF-12** Identificar amostra por QR, por código digitado/lido ou por busca; aceitar etiquetas
  impressas por versões anteriores.

### Coleta
- **RF-13** Abrir e encerrar sessões; a sessão registra versão do protocolo, operador, horário e
  dispositivos conectados.
- **RF-14** Formulário dinâmico com validação (obrigatório, tipo, faixa, opções) e campos automáticos.
- **RF-15** Preencher variáveis automaticamente a partir de sensores vinculados.
- **RF-16** Modo campo: “Salvar + próxima” volta direto à identificação da próxima amostra.
- **RF-17** Registrar marcadores de evento durante a sessão.
- **RF-18** Atribuir flags de QC automáticas (ausente, fora da faixa) sem bloquear o registro.
- **RF-19** Corrigir observação criando revisão; retratar com motivo; nunca apagar o original.

### Dispositivos
- **RF-20** Procurar dispositivos BLE EdgeData, conectar, ler o manifesto e cadastrar.
- **RF-21** Mostrar leituras ao vivo; iniciar/parar leitura periódica; sincronizar relógio.
- **RF-22** Vincular sensores a variáveis do experimento.
- **RF-23** Gravar leituras recebidas durante uma sessão com os três relógios (dispositivo, UTC do
  dispositivo, recepção).

### Exportação e dados
- **RF-24** Exportar pacote de dataset com dados em CSV, JSONL e/ou Parquet, arquivos de mídia,
  README, `datapackage.json`, `metadata.json`, dicionário de dados, `provenance.json` e
  `checksums.sha256`.
- **RF-25** Registrar cada exportação como release com versão semântica e manifesto de checksums.
- **RF-26** Backup e restauração completos do banco e dos arquivos.
- **RF-27** Importar dados da versão anterior do aplicativo.

## 5. Requisitos não funcionais

- **RNF-01** Todas as operações de coleta funcionam sem internet.
- **RNF-02** Nenhuma perda de dados em fechamento inesperado: gravação transacional no SQLite.
- **RNF-03** Dados brutos imutáveis garantidos pelo banco (triggers), não só pela interface.
- **RNF-04** Abrir o formulário após leitura do QR em menos de 1 s; salvar observação com foto em
  menos de 2 s em aparelho intermediário.
- **RNF-05** Suportar 10.000 amostras e 100.000 observações por experimento sem degradação perceptível.
- **RNF-06** Interface utilizável com uma mão, botões grandes, alto contraste; modo claro e escuro.
- **RNF-07** Android 10+ e iOS 15+.
- **RNF-08** Tempo em ISO-8601 UTC; unidades em UCUM; identificadores UUID.
- **RNF-09** Núcleo de domínio testável sem o app (TypeScript puro, testes automatizados).
