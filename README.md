# EdgeData

**Do sensor ao dataset.** Aplicativo para planejar experimentos, coletar dados em campo e
laboratório — à mão ou a partir de sistemas embarcados (ESP32) — e transformar essas
observações em datasets científicos rastreáveis, versionados e reprodutíveis.

> Status: em desenvolvimento — fase **MVP** (veja o [roadmap](docs/ROADMAP.md)).

## O que já faz

- **Experimentos** com metadados científicos (objetivo, hipótese, equipe com ORCID, local,
  licença), criados do zero, por template ou importando um template JSON.
- **Desenho experimental**: fatores, níveis, tratamentos, réplicas e blocos geram as amostras.
- **Variáveis** com ID estável, unidade UCUM, faixa esperada, resolução e campos condicionais;
  protocolo versionado e congelado após o uso.
- **Etiquetas QR** por amostra e coleta em modo campo (“Salvar + próxima”), offline.
- **Sessões de coleta** com operador, fuso, versão do protocolo, eventos e dispositivos.
- **Dados brutos imutáveis**: correções viram revisões com motivo; trilha de auditoria.
- **QC** automático (ausente, fora da faixa) no momento da coleta.
- **ESP32 por Bluetooth LE**: manifesto do dispositivo, leituras ao vivo, vínculo sensor →
  variável com conversão de unidade e gravação das leituras brutas na sessão.
- **Exportação** em CSV, JSONL e Parquet com README, `datapackage.json` (Frictionless),
  `metadata.json`, dicionário de dados, `provenance.json` (W3C PROV) e `checksums.sha256`.

## Estrutura

```
EdgeData/
├── apps/mobile/          # App Expo / React Native (TypeScript)
│   ├── app/              # Telas (Expo Router)
│   ├── core/             # Domínio puro: unidades, validação, QC, protocolo de dispositivo, exportação
│   ├── database/         # SQLite: migrações, repositórios, importação legada
│   ├── devices/          # Transporte Bluetooth LE
│   ├── components/ lib/ stores/ hooks/
├── firmware/             # Biblioteca Arduino/PlatformIO para ESP32 e exemplos
├── schemas/              # JSON Schemas públicos (manifesto de dispositivo)
├── docs/                 # Análise, requisitos, arquitetura, protocolo, roadmap e guia de uso
└── scripts/              # Build do APK
```

## Rodando o app

Pré-requisitos: Node.js 22+ (os testes usam `node:sqlite`) e, para Android, JDK 17 e Android SDK.

```bash
cd apps/mobile
npm install
npx expo start            # Expo Go: tudo, exceto Bluetooth
npx expo run:android      # development build (necessário para Bluetooth)
```

APK de release: `scripts/build-android.sh` (gera em `dist/`).

## Qualidade

```bash
cd apps/mobile
npm run typecheck
npm run lint
npm test                  # Vitest: domínio e banco (SQLite via node:sqlite)
```

O mesmo roda no GitHub Actions a cada push e pull request.

## Firmware

A biblioteca em [`firmware/edgedata-arduino`](firmware/edgedata-arduino) implementa o
[EdgeData Device Protocol v1](docs/PROTOCOLO_DISPOSITIVOS.md): o dispositivo se descreve por um
manifesto (sensores, unidades UCUM, faixas) e troca mensagens JSON por BLE e Serial.

```cpp
#include <EdgeData.h>
edgedata::Device edge("Estacao01");

void lerSensores(edgedata::Reading& r) { r.set("temp_ar", lerTemperatura()); }

void setup() {
  edge.firmware("estacao", "0.1.0");
  edge.addSensor("temp_ar", "Cel").label("Temperatura do ar").range(-40, 85).resolution(0.1);
  edge.onRead(lerSensores);
  edge.begin();
}

void loop() { edge.loop(); }
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [Guia de uso](docs/GUIA_DE_USO.md) | Do experimento ao dataset, passo a passo |
| [Análise](docs/ANALISE.md) | Diagnóstico do projeto e decisões |
| [Requisitos](docs/REQUISITOS.md) | Requisitos funcionais e não funcionais |
| [Arquitetura](docs/ARQUITETURA.md) | Camadas, modelo de dados e fluxos |
| [Protocolo de dispositivos](docs/PROTOCOLO_DISPOSITIVOS.md) | Manifesto, BLE e mensagens NDJSON |
| [Roadmap](docs/ROADMAP.md) | MVP, V1 científica, V2 IoT e V3 plataforma |
| [Contribuindo](CONTRIBUTING.md) | Padrão de commits e fluxo de trabalho |

## Licença

Ainda não definida.
