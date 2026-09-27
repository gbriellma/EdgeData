# Guia de uso do EdgeData

Este guia acompanha um experimento do começo ao fim: planejar, identificar amostras, coletar
(à mão ou com sensor) e exportar o dataset.

## 1. Primeiro acesso

Em **Ajustes**:

- **Seu nome** e **ORCID** - vão para cada sessão, observação e para a trilha de auditoria.
- **Modo de uso** - *Simples* esconde campos avançados (resolução, exatidão, papel da variável,
  LGPD); *Científico* mostra tudo. Dá para trocar a qualquer momento.
- **Backup** - o app lembra de fazer backup a cada N observações. O backup é um `.zip` com o
  banco e as fotos; guarde-o fora do celular.
- **Experimento de demonstração** - cria um experimento com dados sintéticos para explorar o app.

## 2. Criar um experimento

Toque em **+** na aba Experimentos. O assistente tem seis passos:

1. **Início** - comece do zero, de um template embutido (crescimento agrícola, fitopatologia,
   monitoramento ambiental com sensores, qualidade da água, visão computacional, vibração/acústica)
   ou importe um template `.json`.
2. **Identificação** - nome, código curto (usado nas etiquetas e nos arquivos), objetivo e hipótese.
3. **Desenho** - fatores e níveis (fatorial completo) ou tratamentos explícitos, réplicas e
   blocos. O app calcula quantas amostras e observações são esperadas.
4. **Amostras** - variáveis registradas uma vez por amostra.
5. **Observações** - variáveis registradas a cada coleta.
6. **Revisão** - confira e crie. As amostras são geradas pelo desenho.

Depois, em **Dados do experimento**, complete os metadados (instituição, equipe com ORCID,
financiamento, local, período, licença, metodologia). Eles vão para o README e o
`metadata.json` do dataset.

## 3. Protocolo e variáveis

Cada variável tem um **ID estável** (vira o nome da coluna), tipo, **unidade UCUM**, faixa
esperada e, no modo científico, resolução, exatidão e papel. Variáveis podem ser:

- **por amostra** - registradas uma vez (ex.: cultivar, peso inicial);
- **por observação** - registradas a cada coleta (ex.: altura, temperatura).

Campos condicionais: “Há doença?” → “Qual?” → “Severidade” só aparecem quando fazem sentido.

Depois que uma sessão usa o protocolo, ele fica **congelado**: alterar variáveis cria uma nova
versão, e cada observação guarda a versão com que foi feita.

## 4. Amostras e etiquetas

Em **Amostras** você vê, adiciona e arquiva amostras. Em **Etiquetas QR** gere uma folha para
imprimir: cada etiqueta tem um QR com o identificador único da amostra e o código legível
(ex.: `GERM-T1-R2`). Etiquetas da versão anterior do app continuam sendo reconhecidas.

## 5. Sensores (opcional)

1. Grave o firmware de exemplo no ESP32 (veja [`firmware/`](../firmware)).
2. Na aba **Dispositivos**, toque em **Procurar dispositivos** e conecte. O app lê o manifesto
   (sensores, unidades, faixas, firmware) e cadastra o dispositivo.
3. No experimento, abra **Sensores** e vincule cada variável a um sensor. Unidades compatíveis
   são convertidas (ex.: mV → V); dimensões diferentes (°C → cm) são bloqueadas.

> Bluetooth exige o app instalado por build próprio (`npx expo run:android` ou o APK gerado por
> `scripts/build-android.sh`). No Expo Go a aba Dispositivos avisa que o Bluetooth está indisponível.

## 6. Coletar

Toque em **Iniciar coleta** no painel do experimento e abra uma **sessão** (uma por ida a campo
ou corrida de aquisição). A sessão registra operador, horário, fuso, versão do protocolo e os
dispositivos conectados.

- **Escanear etiqueta** ou escolher a amostra na lista; **Próxima pendente** segue a ordem.
- Preencha o formulário. Campos vinculados a sensor mostram **Ler do sensor** com o último valor;
  a leitura bruta fica gravada e ligada à observação. Se você editar o valor à mão, o vínculo com
  a leitura é desfeito (a leitura continua gravada na sessão).
- **Salvar + próxima** abre o leitor para a próxima etiqueta.
- **Evento** marca algo que aconteceu (irrigação, chuva, troca de bateria) com o horário do toque.
- **Sensores** mostra os dispositivos; **Contínuo** grava leituras periódicas na sessão enquanto
  a tela de coleta estiver aberta.

Valores fora da faixa esperada são aceitos, mas recebem a flag de QC `OUT_OF_RANGE`; valores fora
dos limites mínimo/máximo impedem o salvamento.

O formulário é salvo como **rascunho** enquanto você preenche. Se o app fechar, o celular
reiniciar ou você sair da tela, ao voltar à coleta o app oferece **Recuperar** ou **Descartar**
o preenchimento. O rascunho não entra no dataset até ser salvo.

## 6.1 Calibrar um sensor

Em **Dispositivos**, abra o dispositivo e toque em **Calibração** no sensor. Registre pontos
comparando o sensor com um padrão (dá para ler o valor do sensor na hora), escolha o ajuste
(deslocamento, linear ou quadrático) e a validade. O app mostra a equação, o R², o RMSE e o
resíduo de cada ponto. A partir daí, cada leitura grava o valor **bruto** e, ao lado, o valor
**corrigido** e a calibração usada. Calibrações não se editam: registre uma nova ou revogue a
antiga, com motivo.

## 6.2 Importar medições de planilhas

Em **Importar planilha** (painel do experimento), escolha um `.xlsx`, CSV ou TSV com uma linha
por medição. O app sugere o mapeamento pelos nomes das colunas: código da amostra, data (e hora),
e cada variável. Informe a unidade da planilha quando for diferente da do protocolo (ex.: mm
para cm) e o formato da data (DD/MM/AAAA, ISO ou número de série do Excel). **Conferir linhas**
mostra o que está pronto e o que tem problema, linha por linha; só as linhas prontas são
importadas, numa sessão própria (`IMP-001`...), com o nome e o SHA-256 do arquivo registrados.

## 7. Pendências, qualidade e análise

O cartão **Pendências e qualidade** do painel resume o que falta. Tocando nele você vê:

- **Pendentes** por sessão: amostras sem observação, com acesso direto a cada uma;
- **Sinalizados**: valores com flag de QC ainda não revisados. Abra para corrigir ou registre
  **Valor conferido** com uma justificativa (o dado original não muda);
- **Atípicos**: valores muito acima ou abaixo do grupo (limites de Tukey);
- **Campos em branco** por variável;
- **Séries de sensores**: lacunas de tempo, valores repetidos (sensor travado), reinícios,
  pacotes perdidos e saturação.

Em **Análise**, escolha uma variável numérica para ver a evolução no tempo (média por dia de cada
tratamento, com erro padrão), a comparação entre grupos (boxplot), a tabela com n, média, desvio,
mediana e CV, e uma ANOVA de um fator em linguagem simples. No desenho fatorial dá para agrupar
por fator (ex.: só cultivar). A comparação usa a última medida de cada amostra ou uma sessão.

## 8. Corrigir sem apagar

Dados brutos são imutáveis. Em **Observações**, abra uma observação para:

- **Corrigir (nova revisão)** - cria a revisão N+1 com o motivo; a original fica guardada como “substituída”.
- **Retratar observação** - marca a observação como inválida, com motivo.

Tudo vai para a trilha de auditoria e para o `provenance.json`.

## 9. Exportar

Em **Exportar dataset**, a **revisão antes de exportar** aponta metadados incompletos, sessões
abertas, rascunhos, valores sinalizados sem revisão, fotos ausentes e variáveis sem unidade.
Cada item leva à tela onde se resolve. Depois, escolha os formatos (CSV, JSONL, Parquet) e a versão (semver). O pacote
`.zip` contém:

| Arquivo | Conteúdo |
|---|---|
| `data/observations.*` | Uma linha por observação vigente, colunas = IDs das variáveis |
| `data/observations_history.*` | Todas as revisões e retratações |
| `data/samples.*`, `sessions.*`, `events.*`, `readings.*` | Amostras, sessões, eventos e leituras dos sensores (bruto e corrigido) |
| `data/calibrations.*`, `data/qc_reviews.*` | Curvas de calibração e valores conferidos (quando houver) |
| `README.md` | Descrição legível do experimento e do dataset |
| `datapackage.json` | Frictionless Data Package (esquema de cada tabela) |
| `metadata.json` | Metadados do experimento (equipe, ORCID, local, licença…) |
| `data_dictionary.csv` | Variáveis, tipos, unidades UCUM e faixas |
| `provenance.json` | Proveniência (W3C PROV) e trilha de auditoria |
| `checksums.sha256` | SHA-256 de cada arquivo |
| `files/` | Fotos, com hash registrado |

Cada exportação é registrada como uma **release** do dataset.

## 10. Dados da versão anterior

Em **Ajustes**, a seção de importação da versão anterior procura o banco antigo no aparelho e
converte schemas, sujeitos e medições para o novo modelo (experimento, protocolo, amostras,
observações), preservando as fotos.
