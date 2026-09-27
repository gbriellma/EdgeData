# Roadmap

| Nível | Objetivo | Resultado para o pesquisador |
|---|---|---|
| **MVP** | Experimento + schema + coleta manual + ESP32 + CSV/JSON/Parquet | Planeja, coleta em campo (com ou sem sensor) e exporta um dataset autoexplicativo |
| **V1 científica** | QC + metadados + calibração + versionamento + proveniência | Confia no dado: sabe o que é suspeito, calibrado, de qual versão e por quê |
| **V2 IoT** | MQTT + BLE avançado + LoRaWAN + device manager + streams + backend | Vários dispositivos e pessoas coletando ao mesmo tempo, sincronizados |
| **V3 plataforma** | RO-Crate + DataCite + Croissant + publicação + plugins + colaboração | Publica com DOI e integra o laboratório inteiro |

Os números entre parênteses referem-se às ideias do documento de visão.

---

## MVP

**Critério de pronto:** um pesquisador cria um experimento a partir de um template, define
variáveis com unidade, gera as amostras pelo desenho experimental, imprime QR Codes, coleta em
campo sem internet (manual e com um ESP32 via BLE), marca eventos, corrige um valor sem perder o
original e exporta um pacote com CSV, JSONL e Parquet, README, dicionário de dados e checksums.

| Entrega | Ideias |
|---|---|
| Novo modelo de domínio (Projeto → Experimento → Protocolo → Sessão → Amostra/Observação/Evento/Arquivo; Dispositivo/Sensor; Dataset/Release) com migrações versionadas | 1, 83 |
| Criador de experimentos: do zero, por template ou importando template; identificação, objetivo, hipótese, instituição, equipe com ORCID, financiamento, local, período, metodologia, critérios | 2, 56 |
| Desenho experimental: fatores e níveis, tratamentos (fatorial completo ou explícito), controles, réplicas, blocos, sessões previstas, duração e frequência → o app calcula amostras e observações esperadas | 2 |
| Criador visual de variáveis: ID estável, tipo, unidade UCUM, faixa esperada, resolução, precisão, obrigatoriedade, papel (independente/dependente/controle), sensível (LGPD) | 3, 18 (parcial) |
| Unidades UCUM (catálogo embutido com conversão e checagem de dimensão) | 3 |
| Formulários com campos condicionais (“Há doença? → Qual? → Severidade?”), GPS com precisão, leitura de código de barras/QR como campo | 4, 25 (parcial) |
| Identificação de amostras: QR Code com UUID + código legível, busca por código, leitura de etiquetas antigas | 5, 72 (parcial) |
| Sessões de coleta com snapshot do protocolo e do dispositivo; modo campo “Salvar + próxima” | 11 (parcial), 68, 73 |
| Marcadores de evento durante a sessão | 26 |
| Dados brutos imutáveis (triggers), revisões e retratações; trilha de auditoria append-only | 12, 45 |
| Flags de QC automáticas no momento da coleta (ausente, fora da faixa) | 15–16 (parcial) |
| ESP32: biblioteca Arduino/PlatformIO, manifesto do dispositivo, protocolo NDJSON sobre BLE, sincronização de relógio | 6 (BLE), 8, 9 (Arduino/C++), 19 (parcial) |
| App: BLE real (react-native-ble-plx), cadastro de dispositivo a partir do manifesto, leituras ao vivo, vínculo sensor → variável, preenchimento automático e gravação de leituras na sessão | 7 (parcial), 11 (parcial) |
| Exportação: CSV, JSONL, Parquet + README, `datapackage.json` (Frictionless), `metadata.json`, dicionário de dados, `provenance.json`, `checksums.sha256`; cada exportação vira uma release registrada | 29, 30, 33 (parcial), 34, 59, 60 |
| Importação dos dados da versão anterior do app | 63 (parcial) |
| Modo simples × modo científico (campos avançados escondidos) | 57 |

## V1 científica

Já entregue na branch `development`: rascunho automático da coleta, painel de pendências e
qualidade (inclui QC das séries de sensores), revisão humana de valores sinalizados, calibração
de sensores (pontos, ajuste, RMSE, validade, revogação; bruto e corrigido lado a lado),
estatística exploratória com gráficos e ANOVA, diferenças entre versões do protocolo, revisão
antes de exportar e importação de planilhas (.xlsx/CSV) com mapeamento de colunas, unidades e datas.

| Entrega | Ideias |
|---|---|
| Motor de QC completo: lacunas temporais, relógio voltando, perda de pacotes, saturação de ADC, sensor congelado, valores fisicamente improváveis, duplicatas, deriva, unidade incompatível, taxa inconsistente | 15, 16 |
| Calibração e metrologia: equipamento de referência, pontos, regressão, RMSE, incerteza, validade, certificado; aplicação da curva em dados derivados | 17, 18 |
| Incerteza por variável (valor ± incerteza, resolução, exatidão) propagada para a exportação | 18 |
| Datasets derivados e pipeline de processamento registrado (algoritmo, versão, parâmetros, hash de entrada/saída) - nunca sobre o bruto | 12, 14 |
| Releases congeladas com semver e diff entre versões (+42 amostras, −3 inválidas…) | 31, 32 |
| Proveniência W3C PROV completa | 13 |
| Protocolos versionados com diff e comparação entre versões | 28 |
| Diário de laboratório eletrônico por sessão (texto, fotos, voz, anexos, assinatura) | 27, 74 |
| Scientific Health Check antes de publicar (checklist verificável) | 58 |
| Dashboard científico: esperado × coletado, válidos × rejeitados, calibração vencida | 47 |
| Estatística exploratória (média, mediana, quartis, IQR, correlação, missingness, histogramas, boxplots) | 49 |
| Importação com inferência de schema (CSV, Excel, JSON, Parquet) + assistente de mapeamento de colunas e unidades | 63, 64 |
| Methods Generator e Dataset Card gerados apenas a partir de metadados registrados | 61, 62 |
| Fotos científicas com EXIF completo (câmera, exposição, ISO, orientação) e formatos TIFF/DNG | 22 |
| Anotação de imagens (classificação, bbox, polígono, máscara, keypoints) e exportação COCO/YOLO/VOC com split train/val/test sem vazamento por amostra/sessão | 23 |
| Áudio/vibração: WAV/FLAC, metadados de ADC, waveform, FFT, PSD, espectrograma | 24 |
| Geolocalização avançada: rotas, polígonos, parcelas; exportação GeoJSON/KML/GeoPackage | 25 |
| HDF5, NetCDF, Zarr, Arrow | 33 |
| Agendamento de coletas com lembretes | 76 |
| QR Code do experimento (bancada) | 72 |

## V2 IoT

| Entrega | Ideias |
|---|---|
| Backend: FastAPI + PostgreSQL/TimescaleDB + MinIO; sincronização offline-first (união de conjuntos por UUID) | 20, 79, 80 |
| MQTT (Mosquitto/EMQX), HTTP/REST, WebSocket, TCP/UDP, CoAP | 6 |
| USB Serial/CDC, Bluetooth Classic, Wi-Fi direto | 6 |
| Industrial e campo: Modbus RTU/TCP, RS-485, CAN/CAN-FD, OPC-UA, SDI-12, LoRa/LoRaWAN, Zigbee, Thread | 6 |
| Device Manager completo (bateria, RSSI, armazenamento, drift, firmware, histórico de calibração, datasheets) | 7, 71 |
| Provisionamento: QR → BLE → Wi-Fi/credenciais → registro → coleta | 10 |
| Protocolo binário (CBOR/MessagePack/Protobuf) em blocos com sequência e CRC | 81, 82 |
| Aquisição em tempo real com gráficos, FFT, PSD, RMS, SNR, perda de pacotes | 11 |
| Edge buffering (RAM → SD → rede) na biblioteca de firmware | 21 |
| Sincronização temporal (NTP/PTP/GPS PPS, offset e drift por dispositivo) | 19 |
| Automação de coleta (gatilhos por condição/tempo) e comandos para o dispositivo (tasking) | 77, 78 |
| Segurança IoT: token por dispositivo, TLS, certificados, rotação e revogação | 46 |
| Multiusuário em campo com divisão de amostras | 75 |
| Firmware vinculado aos dados (commit do firmware, snapshot de hardware por sessão) | 68, 69, 70 |
| SDKs: C, Python, MicroPython | 9 |
| REST API pública e webhooks | 53, 54 |

## V3 plataforma

| Entrega | Ideias |
|---|---|
| Exportação RO-Crate, DataCite (XML/JSON), ML Croissant | 35, 36, 38 |
| OGC SensorThings API | 37 |
| Publicação: Zenodo, Dataverse, OSF, Figshare, Dryad, Hugging Face, Kaggle, GitHub Releases; DOI | 39, 40 |
| CITATION.cff, BibTeX, RIS | 41 |
| Assistente de licenciamento (CC0, CC-BY, CC-BY-NC…) | 42 |
| LGPD: consentimento, pseudonimização, retenção, acesso restrito | 43 |
| Papéis e permissões por projeto/experimento/dataset/campo | 44 |
| Sistema de plugins carregáveis (sensores, protocolos, importadores, exportadores, processadores, visualizadores) | 55 |
| Relações entre datasets (IsDerivedFrom, IsSupplementTo) | 67 |
| Data Explorer visual, busca semântica | 48, 66 |
| Integração Python (`pip install edgedata`), Jupyter, MATLAB, R | 50, 51, 52 |
| IA como assistente (sempre “sugerido por IA - requer confirmação”) | 65 |
| App web | 79 |
