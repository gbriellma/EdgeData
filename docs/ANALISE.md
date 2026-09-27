# Análise técnica do projeto (estado em setembro/2026)

Este documento registra o diagnóstico do código herdado antes da reestruturação para o EdgeData:
o que existe, o que funciona, o que está errado e o que precisa mudar — e em que ordem.

## 1. Resumo

O projeto é um **bom aplicativo de coleta de campo** (formulários dinâmicos, QR Code, fotos,
exportação CSV/ZIP, backup) construído com uma stack moderna e sem erros de tipagem. Mas ele
**ainda não é uma plataforma de dados científicos**: o modelo de dados não representa sessões,
protocolos, dispositivos, eventos nem versões de dataset; os dados brutos podem ser alterados e
apagados sem rastro; unidades são texto livre; e a integração com sensores é simulada.

A conclusão principal é que as mudanças mais importantes são **no núcleo** (modelo de domínio,
imutabilidade, migrações, unidades, protocolo de dispositivos), e não em telas. Adicionar
funcionalidades sobre o modelo atual geraria retrabalho, porque ele não consegue representar a
origem de uma observação.

## 2. Inventário

| Parte | Situação |
|---|---|
| App | Expo SDK 54, React Native 0.81 (New Architecture), TypeScript estrito, Expo Router 6, expo-sqlite, Zustand |
| Tamanho | ~16 mil linhas: 21 telas (~6,8 mil) + componentes/hooks/banco (~9,4 mil) |
| Banco | SQLite com 5 tabelas: `projects`, `subjects`, `collections`, `images`, `sensor_bindings` |
| Firmware | Pasta `sensor-firmware/ipa`: repositório de outro projeto do CETENE (outros autores), só imprime no Serial |
| Documentação | Guia de uso detalhado; PDF de requisitos; `PROJECT_STRUCTURE.md` descrevendo arquivos que não existem |
| Qualidade | `tsc --noEmit` sem erros; `expo lint` com 9 erros e 20 avisos; nenhum teste; nenhuma CI |
| Git | 7 commits, remoto institucional, autores misturados, submódulo `ipa` adicionado sem `.gitmodules` |

### O que funciona bem

- Construtor visual de schema com 15 tipos de campo, incluindo foto multi-ângulo e escala.
- Criação de sujeitos manual, em lote (sequencial e fatorial) e por importação CSV.
- Etiquetas de QR Code em PDF e leitura em campo com confirmação do sujeito.
- Exportação para pasta (SAF, Android) ou ZIP nativo sem estourar memória.
- Backup e restauração completos, templates reutilizáveis e projeto demonstrativo.
- Telas pensadas para uso em campo (botões grandes, fluxo curto).

## 3. Problemas encontrados

### Críticos

1. **As rotas do app não estavam no disco.** A pasta `app/app/` (todas as telas do Expo Router)
   estava apagada da cópia de trabalho, embora existisse no último commit. O app não compilava
   a partir da pasta local. Foi restaurada a partir do histórico antes da migração.
2. **A integração com sensores é simulada.** `useBLE` devolve valores fixos (O₂ = 20,95 %,
   CO₂ = 412 ppm…) e não há biblioteca Bluetooth instalada. A tela “Sensores Bluetooth” mostra
   dados falsos, o que é perigoso num app científico: um usuário pode salvar valores inventados.
3. **O firmware não pertence ao projeto.** `sensor-firmware/ipa` é o repositório `cotec/ipa` do
   CETENE, com commits de outras pessoas e datasheets de fabricantes. Não conversa com o app
   (só escreve texto no Serial). Ele foi mantido fora do novo repositório; o EdgeData ganhou uma
   biblioteca de firmware própria.
4. **Dados brutos são mutáveis.** `updateCollection` sobrescreve o JSON da coleta e
   `deleteCollection` apaga fisicamente. Não há histórico nem auditoria — é impossível saber
   qual era o valor original ou quem mudou.

### Altos

5. **Sem migrações de banco.** O schema é criado com `CREATE TABLE IF NOT EXISTS`; qualquer
   alteração de tabela deixa instalações antigas inconsistentes.
6. **Modelo de domínio achatado.** “Projeto” faz o papel de projeto, experimento, protocolo e
   dataset ao mesmo tempo. Não existem sessão/corrida, protocolo, evento, dispositivo, sensor,
   calibração nem versão de dataset.
7. **Schema editável sem versionamento.** Se um campo muda depois de haver coletas, os dados
   antigos passam a ser interpretados com a definição nova.
8. **Unidades como texto livre** (`"cm"`, `"°C"`), sem validação nem conversão.
9. **Exportação usa rótulos como cabeçalho** (`Altura (cm)`, `Condição de Rega`): colunas com
   acentos e espaços, que mudam se o rótulo mudar, e nenhum dicionário de dados acompanha o CSV.

### Médios

10. **Tempo ambíguo.** `collected_at` usa `datetime('now')` (UTC sem sufixo `Z`), enquanto campos
    de data guardam `15/02/2026` em formato local. Não há fuso, relógio do dispositivo nem
    precisão registrados.
11. **GPS incompleto.** Só latitude/longitude; faltam altitude, precisão e sistema de referência.
12. **`auto_uuid` grava o ID do sujeito**, não um identificador único da coleta — o nome engana.
13. **Um único formato de identificação.** QR Code com URI fixa; sem código legível por humanos,
    código de barras ou busca por código da amostra.
14. **Permissões Android desatualizadas e duplicadas** (`READ/WRITE_EXTERNAL_STORAGE` obsoletas a
    partir do Android 13, `CAMERA` e localização repetidas, `RECORD_AUDIO` sem uso).
15. **Dependências sobrando**: `@types/react-native` (conflita com os tipos embutidos do RN 0.81),
    `@babel/plugin-proposal-decorators` (resto do WatermelonDB), `expo-auth-session` sem uso.

### Baixos

16. Código morto do template do Expo (`hello-wave`, `parallax-scroll-view`, `external-link`,
    `collapsible`, `haptic-tab`, `scripts/reset-project.js`) e ~900 linhas de exemplos de sensores
    que nenhuma tela usa.
17. Documentação não confiável: `PROJECT_STRUCTURE.md` lista arquivos e documentos que nunca
    existiram; o README antigo cita bibliotecas que não são usadas (WatermelonDB, React Navigation
    manual).
18. Sem testes automatizados, sem CI e com erros de lint.

## 4. O que mudar — prioridades

| Prioridade | Mudança | Por quê |
|---|---|---|
| 1 | Modelo de domínio novo (Projeto → Experimento → Protocolo → Sessão → Amostra/Observação/Evento/Arquivo; Dispositivo/Sensor; Dataset/Release) | Tudo o mais depende de conseguir representar a origem de cada dado |
| 2 | Migrações versionadas no SQLite | Permitir evoluir o modelo sem quebrar instalações |
| 3 | Dados brutos imutáveis + revisões + trilha de auditoria (forçados por *triggers*) | Reprodutibilidade; nunca perder o valor original |
| 4 | Variáveis tipadas com unidade UCUM, faixa, precisão, papel e condição de exibição | Validação, conversão, dicionário de dados automático |
| 5 | Variáveis versionadas junto com o protocolo | Dados antigos continuam ligados à definição que valia na coleta |
| 6 | Protocolo de dispositivo real (BLE) com manifesto + biblioteca de firmware própria | Remover o mock e tornar o ESP32 cidadão de primeira classe |
| 7 | Exportação como pacote de dataset (CSV/JSONL/Parquet + README + dicionário + `datapackage.json` + SHA-256) | Dataset autoexplicativo e verificável |
| 8 | Testes do núcleo, lint limpo, typecheck em CI | Segurança para evoluir rápido |

## 5. Ajustes nas ideias propostas

As 84 ideias do documento de visão são coerentes entre si. Os ajustes abaixo evitam armadilhas
de implementação; o detalhamento está em [`ARQUITETURA.md`](ARQUITETURA.md) e
[`ROADMAP.md`](ROADMAP.md).

1. **Variáveis pertencem ao protocolo, não ao experimento.** Mudar uma variável depois de haver
   dados cria uma nova versão do protocolo; cada sessão registra a versão usada. Isso resolve de
   uma vez “protocolos versionados” (28) e “schema editável” sem perder a interpretação dos dados
   antigos.
2. **Amostras pertencem ao experimento, não à sessão.** Uma planta é observada em várias sessões;
   a observação é que liga amostra + sessão.
3. **Study e Workspace ficam implícitos no modo simples.** O banco já os suporta, mas o usuário
   iniciante só vê Projeto → Experimento.
4. **QR Code carrega o UUID estável + um código legível** (`edgedata://sample/<uuid>?c=T1_C_F1_R1`).
   Códigos puramente semânticos como `PEARL-PIPE03-SENSOR02-RUN017` quebram quando algo é
   renomeado; o código fica como rótulo e como chave de busca, o UUID como identidade.
5. **Unidades: guardar no que foi medido, converter só na saída.** O valor bruto nunca é
   convertido silenciosamente; a unidade UCUM é guardada ao lado e a conversão acontece em
   análise/exportação.
6. **Alta taxa de amostragem não cabe em BLE.** 4 canais × 32 kS/s × 24 bits ≈ 384 kB/s, acima do
   que um celular sustenta via BLE (tipicamente 20–100 kB/s). Nesses casos o embarcado grava em
   SD/flash e transfere arquivos (Wi-Fi/USB), enquanto o BLE transmite só um preview decimado e o
   estado do dispositivo. O protocolo em blocos (81–82) continua válido para Wi-Fi/MQTT.
7. **Sincronização sem conflito para dados brutos.** Como observações são imutáveis e têm UUID
   gerado no aparelho, a sincronização offline (20) vira união de conjuntos; conflitos só existem
   em metadados editáveis, tratados por “última escrita + auditoria”.
8. **Plugins começam pelo que já existe.** No MVP, exportadores e transportes já são registrados
   por interface (registro de plugins em código). Carregar plugins de terceiros em tempo de
   execução fica para a V3.
9. **Stack: manter Expo/React Native.** Já roda Android, iOS e Web, é a stack do projeto e do
   autor, e o Flutter exigiria reescrever o app inteiro antes de entregar valor novo.
10. **Backend só na V2.** O MVP é 100 % offline; a API (FastAPI + PostgreSQL/TimescaleDB + MinIO +
    Mosquitto) entra junto com MQTT, sincronização e colaboração.
