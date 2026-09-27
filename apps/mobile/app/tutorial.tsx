import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface TutorialSection {
  id: string;
  icon: IconName;
  title: string;
  content: TutorialBlock[];
}

interface TutorialBlock {
  type: 'paragraph' | 'heading' | 'step' | 'tip' | 'warning' | 'list';
  text: string;
  items?: string[];
}

const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    id: 'overview',
    icon: 'information-circle-outline',
    title: 'O que é o EdgeData?',
    content: [
      {
        type: 'paragraph',
        text: 'O EdgeData é um aplicativo de coleta de dados estruturados, projetado para profissionais que precisam coletar informações padronizadas em campo, laboratórios ou qualquer ambiente de trabalho.',
      },
      {
        type: 'paragraph',
        text: 'Com ele, você pode definir exatamente quais dados precisa coletar (criando "schemas" personalizados), registrar suas unidades de observação (chamadas de "sujeitos"), identificá-las rapidamente via QR Code, e registrar observações em campo de forma padronizada — tudo funcionando 100% offline, sem precisar de internet.',
      },
      {
        type: 'heading',
        text: 'Conceitos principais',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Projeto — Um experimento ou estudo. Contém os schemas que definem quais dados serão coletados.',
          'Schema — A definição dos campos de dados. Existem dois: um para Sujeitos (dados fixos de cada unidade) e outro para Coletas (dados registrados em cada observação).',
          'Sujeito — Uma unidade de observação: pode ser qualquer item, equipamento, local, ponto de amostragem ou entidade que será observada ao longo do tempo. Os dados do sujeito são fixos e definidos no schema de sujeito.',
          'Coleta — Uma observação registrada em campo para um sujeito específico. Um sujeito pode ter muitas coletas ao longo do tempo.',
          'QR Code — Etiqueta com código único que identifica cada sujeito. Ao escanear, o app sabe exatamente qual sujeito você está observando.',
        ],
      },
      {
        type: 'heading',
        text: 'Fluxo de trabalho típico',
      },
      {
        type: 'list',
        text: '',
        items: [
          '1. Crie um projeto definindo os campos de sujeito e coleta (use templates prontos ou importe de arquivo)',
          '2. Cadastre sujeitos: manualmente, em lote (sequencial ou fatorial) ou importando CSV',
          '3. Gere e imprima etiquetas com QR Codes (PDF pronto para impressão)',
          '4. Cole as etiquetas nas unidades de observação em campo',
          '5. Em campo: escaneie o QR Code → preencha o formulário → salve',
          '6. Repita para cada observação ao longo do experimento',
          '7. Ao final, exporte o dataset completo em CSV + imagens (com fotos nomeadas automaticamente)',
        ],
      },
    ],
  },
  {
    id: 'create-project',
    icon: 'add-circle-outline',
    title: 'Criando um projeto',
    content: [
      {
        type: 'paragraph',
        text: 'Para começar, você precisa criar um projeto. O projeto é o container principal que organiza todos os seus dados.',
      },
      {
        type: 'step',
        text: 'Na tela inicial (aba "Projetos"), toque no botão verde "+" no canto inferior direito da tela.',
      },
      {
        type: 'heading',
        text: 'Etapa 1: Informações básicas',
      },
      {
        type: 'paragraph',
        text: 'Preencha o nome do projeto (obrigatório) e uma descrição opcional. O nome deve ser único — não pode haver dois projetos com o mesmo nome.',
      },
      {
        type: 'tip',
        text: 'Use um nome descritivo que identifique claramente o projeto, por exemplo: "Inspeção Equipamentos Fev 2026", "Monitoramento Qualidade Linha A" ou "Levantamento Campo Norte".',
      },
      {
        type: 'heading',
        text: 'Templates prontos',
      },
      {
        type: 'paragraph',
        text: 'Abaixo dos campos de texto, você encontra templates pré-configurados como exemplos. Ao tocar em um template, ele preenche automaticamente os schemas de sujeito e coleta com campos típicos. Você pode modificá-los depois conforme sua necessidade.',
      },
      {
        type: 'list',
        text: 'Templates incluídos:',
        items: [
          'Avaliação de Severidade — Campos para avaliar intensidade/severidade de condições: nota em escala, categorias, foto, observações.',
          'Monitoramento de Crescimento — Campos para acompanhamento periódico: medidas quantitativas, estágios, fotos, datas.',
          'Monitoramento de Ocorrências — Campos para registro e quantificação: categorias, contagens, nível de impacto, ações recomendadas.',
        ],
      },
      {
        type: 'heading',
        text: 'Templates personalizados',
      },
      {
        type: 'paragraph',
        text: 'Além dos templates incluídos, você pode criar e gerenciar seus próprios templates:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Importar de arquivo — Toque em "Importar Template" para carregar um arquivo .edgetemplate.json. Você pode aplicá-lo imediatamente ou salvá-lo para uso futuro.',
          'Meus Templates — Templates salvos aparecem na seção "Meus Templates" com ícone ⭐. Toque para aplicar, pressione longamente para excluir.',
          'Exportar template — No dashboard de um projeto existente, toque em "Exportar Template" para salvar a configuração de campos como template reutilizável.',
        ],
      },
      {
        type: 'tip',
        text: 'Templates são ótimos para padronizar projetos em equipe. Exporte o template de um projeto configurado e compartilhe o arquivo .edgetemplate.json com colegas para que todos usem a mesma estrutura de dados.',
      },
      {
        type: 'heading',
        text: 'Etapa 2: Schema de Sujeitos',
      },
      {
        type: 'paragraph',
        text: 'Aqui você define os campos fixos que descrevem cada unidade de observação. Estes dados são cadastrados uma vez e não mudam entre coletas.',
      },
      {
        type: 'paragraph',
        text: 'Por exemplo: você pode ter campos como "Identificador" (texto), "Tipo" (categoria), "Localização" (texto), "Setor" (inteiro) e "Responsável" (texto).',
      },
      {
        type: 'step',
        text: 'Toque em "+ Adicionar Campo" para abrir o seletor de tipos. Escolha o tipo adequado, depois configure o nome, rótulo e opções do campo.',
      },
      {
        type: 'heading',
        text: 'Etapa 3: Schema de Coletas',
      },
      {
        type: 'paragraph',
        text: 'Aqui você define os campos que serão preenchidos em cada observação/coleta em campo. Estes dados são registrados cada vez que você faz uma coleta para um sujeito.',
      },
      {
        type: 'paragraph',
        text: 'Exemplo: "Avaliação" (escala 1-5), "Observações" (texto longo), "Foto" (imagem), "Timestamp" (automático) e "GPS" (automático).',
      },
      {
        type: 'tip',
        text: 'Campos automáticos (timestamp, GPS, UUID) são preenchidos automaticamente no momento da coleta. Você não precisa digitá-los — basta adicioná-los ao schema.',
      },
      {
        type: 'step',
        text: 'Ao terminar de configurar ambos os schemas, toque em "Criar Projeto". O projeto será salvo e você será levado ao dashboard.',
      },
    ],
  },
  {
    id: 'field-types',
    icon: 'list-outline',
    title: 'Tipos de campo disponíveis',
    content: [
      {
        type: 'paragraph',
        text: 'O EdgeData oferece 14 tipos de campo para cobrir as necessidades mais comuns de coleta de dados:',
      },
      {
        type: 'heading',
        text: 'Campos de texto',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Texto Curto — Para valores breves como nomes, identificadores, códigos. Exibe um campo de texto simples de uma linha.',
          'Texto Longo — Para observações, descrições e anotações detalhadas. Exibe um campo multilinha expansível.',
        ],
      },
      {
        type: 'heading',
        text: 'Campos numéricos',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Inteiro — Números sem casas decimais. Teclado numérico. Pode ter mínimo e máximo configuráveis. Ideal para contagens, quantidades, códigos numéricos.',
          'Decimal — Números com casas decimais configuráveis. Pode ter unidade de medida (cm, kg, etc.). Ideal para medições como dimensões, peso, temperatura.',
        ],
      },
      {
        type: 'heading',
        text: 'Campos de seleção',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Categoria — Seleção de UMA opção de uma lista predefinida. Abre um seletor modal com as opções. Ideal para tipos, classificações, status.',
          'Múltiplas Categorias — Seleção de VÁRIAS opções simultaneamente. Exibe chips com checkboxes. Ideal para características observadas, tags, marcadores.',
        ],
      },
      {
        type: 'heading',
        text: 'Outros campos',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Sim/Não — Um switch booleano. Ideal para presença/ausência, aprovado/reprovado, conforme/não conforme.',
          'Imagem — Captura única com a câmera. A foto é salva no dispositivo e vinculada à coleta.',
          'Multi-imagem — Múltiplas fotos com ângulos configuráveis. Você define os nomes de cada entrada de foto.',
          'Data — Seletor de data. Ideal para datas de início, vencimento, ocorrência.',
          'Escala — Botões circulares numerados (ex: 0 a 5). Pode ter rótulos descritivos. Ideal para notas de avaliação, graus de severidade.',
        ],
      },
      {
        type: 'heading',
        text: 'Campos automáticos',
      },
      {
        type: 'paragraph',
        text: 'Estes campos são preenchidos automaticamente pelo app no momento da coleta. Você não precisa digitá-los — basta adicioná-los ao schema.',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Timestamp Automático — Registra a data e hora exata da coleta automaticamente.',
          'GPS Automático — Captura as coordenadas geográficas (latitude e longitude) no momento da coleta.',
          'UUID Automático — Gera um identificador único universal para cada registro.',
        ],
      },
      {
        type: 'heading',
        text: 'Configurações dos campos',
      },
      {
        type: 'paragraph',
        text: 'Ao adicionar ou editar um campo, você pode configurar:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Nome interno — Identificador usado internamente (sem espaços, sem acentos). Ex: "nota_severidade".',
          'Rótulo — Texto exibido ao usuário no formulário. Ex: "Nota de Severidade".',
          'Obrigatório — Se marcado, a coleta não pode ser salva sem preencher este campo.',
          'Mín/Máx — Para campos numéricos e escala, define os limites aceitos.',
          'Casas decimais — Para campo decimal, quantas casas mostrar.',
          'Unidade — Para campos numéricos, a unidade de medida exibida (cm, kg, etc.).',
          'Opções — Para campos de categoria, a lista de valores possíveis.',
          'Rótulos da escala — Para campo escala, texto descritivo para cada valor numérico.',
        ],
      },
    ],
  },
  {
    id: 'subjects',
    icon: 'leaf-outline',
    title: 'Gerenciando sujeitos',
    content: [
      {
        type: 'paragraph',
        text: 'Sujeitos são suas unidades de observação — as "coisas" que você está estudando. Podem ser equipamentos, locais, amostras, pontos de amostragem, ou qualquer outra unidade que receberá observações repetidas.',
      },
      {
        type: 'heading',
        text: 'Cadastro manual',
      },
      {
        type: 'step',
        text: 'No dashboard do projeto, toque em "Sujeitos" → "Adicionar". Preencha o formulário (gerado automaticamente a partir do schema de sujeito) e toque em "Salvar Sujeito".',
      },
      {
        type: 'paragraph',
        text: 'O formulário exibe todos os campos que você definiu no schema de sujeito, com o tipo de entrada apropriado para cada um (teclado numérico para números, seletor para categorias, etc.).',
      },
      {
        type: 'heading',
        text: 'Criação em lote',
      },
      {
        type: 'paragraph',
        text: 'Para cadastrar muitos sujeitos rapidamente, use a criação em lote. Na lista de sujeitos, toque em "Em Lote". Existem dois modos:',
      },
      {
        type: 'list',
        text: 'Modo Sequencial:',
        items: [
          'Gera sujeitos numerados automaticamente: Planta_001, Planta_002, Planta_003...',
          'Configure: prefixo (ex: "Planta_"), número inicial, quantidade e campo alvo.',
          'Opção de zero-padding para manter a numeração alinhada (001, 002... vs 1, 2...).',
        ],
      },
      {
        type: 'list',
        text: 'Modo Fatorial:',
        items: [
          'Gera todas as combinações possíveis entre os valores dos campos de categoria.',
          'Ideal para delineamentos experimentais: ex. 3 variedades × 2 tipos de rega × 5 tratamentos = 30 sujeitos.',
          'Use "*" para incluir todas as opções de um campo, ou digite valores separados por vírgula.',
          'Um campo identificador é gerado automaticamente juntando os fatores (ex: "Var1_Irrigado_Trat3").',
        ],
      },
      {
        type: 'tip',
        text: 'O modo fatorial é perfeito para experimentos científicos com delineamento fatorial completo. O app gera até 5.000 sujeitos de uma vez e pede confirmação para lotes grandes (>500).',
      },
      {
        type: 'heading',
        text: 'Importação via CSV',
      },
      {
        type: 'paragraph',
        text: 'Se você já tem seus sujeitos em uma planilha, pode importá-los de uma vez só:',
      },
      {
        type: 'step',
        text: 'Na lista de sujeitos, toque em "CSV". Selecione o arquivo CSV do seu dispositivo.',
      },
      {
        type: 'paragraph',
        text: 'O app irá:',
      },
      {
        type: 'list',
        text: '',
        items: [
          '1. Ler o arquivo e identificar as colunas',
          '2. Mapear automaticamente as colunas do CSV para os campos do schema (por nome ou rótulo, ignorando maiúsculas/minúsculas)',
          '3. Mostrar um preview com as primeiras linhas e indicar quais campos foram encontrados (verde) ou não (laranja)',
          '4. Converter os tipos automaticamente (texto → número, "sim/não" → booleano, etc.)',
        ],
      },
      {
        type: 'tip',
        text: 'Prepare seu CSV com as colunas tendo os mesmos nomes dos campos do schema (ou os mesmos rótulos). Aceita separador vírgula ou ponto-e-vírgula. Campos entre aspas são tratados corretamente.',
      },
      {
        type: 'heading',
        text: 'Visualizar e editar sujeitos',
      },
      {
        type: 'paragraph',
        text: 'Toque em qualquer sujeito na lista para abrir seus detalhes. Lá você pode:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Ver todos os dados cadastrados em formato chave-valor',
          'Editar os dados tocando no ícone de lápis (abre o formulário preenchido)',
          'Ver o histórico de todas as coletas realizadas para este sujeito',
          'Tocar em qualquer coleta para ver seus detalhes',
          'Excluir o sujeito (atenção: exclui também todas as coletas vinculadas)',
        ],
      },
      {
        type: 'warning',
        text: 'Excluir um sujeito remove permanentemente todas as coletas e imagens associadas. Esta ação não pode ser desfeita. Faça backup antes se necessário.',
      },
    ],
  },
  {
    id: 'qrcodes',
    icon: 'qr-code-outline',
    title: 'QR Codes e etiquetas',
    content: [
      {
        type: 'paragraph',
        text: 'Os QR Codes são a forma mais rápida de identificar sujeitos em campo. Cada sujeito recebe um QR Code único que, ao ser escaneado pelo app, abre diretamente o formulário de coleta para aquele sujeito.',
      },
      {
        type: 'heading',
        text: 'Gerando etiquetas',
      },
      {
        type: 'step',
        text: 'No dashboard do projeto, toque em "QR Codes". Selecione os sujeitos desejados (ou "Selecionar todos") e toque em "Gerar PDF".',
      },
      {
        type: 'paragraph',
        text: 'O app gera um PDF com etiquetas organizadas em 3 colunas. Cada etiqueta contém:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'O QR Code do sujeito (codifica a URI edgedata://subject/{id})',
          'O nome/identificador do sujeito abaixo do código',
          'O UUID do sujeito para referência',
        ],
      },
      {
        type: 'step',
        text: 'Após gerar, o sistema de compartilhamento abre automaticamente. Você pode enviar o PDF por email, WhatsApp, salvar no Google Drive, ou imprimir diretamente.',
      },
      {
        type: 'tip',
        text: 'Imprima as etiquetas em papel adesivo resistente à água. Cole-as nas unidades de observação antes de ir a campo.',
      },
      {
        type: 'heading',
        text: 'Status de geração',
      },
      {
        type: 'paragraph',
        text: 'Na lista de QR Codes, sujeitos que já tiveram etiquetas geradas mostram um badge verde "Gerado". Isso é apenas informativo — você pode gerar novamente a qualquer momento.',
      },
    ],
  },
  {
    id: 'collecting',
    icon: 'scan-outline',
    title: 'Coletando dados em campo',
    content: [
      {
        type: 'paragraph',
        text: 'Esta é a funcionalidade principal do app — o que você fará repetidamente em campo. O fluxo de coleta tem 3 passos simples:',
      },
      {
        type: 'heading',
        text: 'Passo 1: Identificar o sujeito',
      },
      {
        type: 'step',
        text: 'No dashboard do projeto, toque no botão grande verde "Iniciar Coleta".',
      },
      {
        type: 'paragraph',
        text: 'Você tem duas formas de identificar o sujeito:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Escanear QR Code — Toque em "Escanear QR Code" para abrir a câmera. Aponte para a etiqueta do sujeito. O app reconhece automaticamente o código.',
          'Busca manual — Se o QR Code estiver danificado ou ilegível, use o campo de busca abaixo. Digite o nome, identificador ou ID do sujeito. A lista filtra em tempo real.',
        ],
      },
      {
        type: 'heading',
        text: 'Passo 2: Confirmar o sujeito',
      },
      {
        type: 'paragraph',
        text: 'Após a identificação, o app exibe todos os dados do sujeito encontrado para que você confirme visualmente que é o sujeito correto. Verifique as informações e:',
      },
      {
        type: 'list',
        text: '',
        items: [
          '"Confirmar e Coletar" — Avança para o formulário de coleta.',
          '"Voltar" — Retorna ao passo 1 para escolher outro sujeito.',
        ],
      },
      {
        type: 'tip',
        text: 'A confirmação visual é importante para evitar erros. Se o sujeito exibido não corresponde ao esperado, volte e tente novamente.',
      },
      {
        type: 'heading',
        text: 'Passo 3: Preencher o formulário',
      },
      {
        type: 'paragraph',
        text: 'O formulário é gerado automaticamente a partir do schema de coleta do projeto. Um banner verde no topo indica para qual sujeito você está coletando.',
      },
      {
        type: 'paragraph',
        text: 'Campos automáticos (timestamp, GPS, UUID) já vêm preenchidos — você não precisa fazer nada com eles.',
      },
      {
        type: 'paragraph',
        text: 'Preencha os demais campos conforme sua observação. Campos obrigatórios serão validados antes de salvar.',
      },
      {
        type: 'step',
        text: 'Toque em "Salvar Coleta". O app captura automaticamente a localização GPS, salva todos os dados no banco e exibe uma mensagem de sucesso.',
      },
      {
        type: 'paragraph',
        text: 'Após salvar, você pode:',
      },
      {
        type: 'list',
        text: '',
        items: [
          '"Nova Coleta" — Volta ao passo 1 para coletar o próximo sujeito. Ideal para trabalho contínuo em campo.',
          '"Voltar" — Retorna ao dashboard do projeto.',
        ],
      },
      {
        type: 'warning',
        text: 'Certifique-se de que as permissões de câmera e localização estão concedidas para o app. O GPS pode demorar alguns segundos para obter uma posição precisa.',
      },
    ],
  },
  {
    id: 'collections',
    icon: 'grid-outline',
    title: 'Visualizando coletas',
    content: [
      {
        type: 'paragraph',
        text: 'Você pode visualizar e gerenciar todas as coletas do projeto de duas formas:',
      },
      {
        type: 'heading',
        text: 'Galeria de coletas (por projeto)',
      },
      {
        type: 'step',
        text: 'No dashboard, toque em "Coletas" para ver todas as coletas do projeto em ordem cronológica.',
      },
      {
        type: 'paragraph',
        text: 'Cada card mostra: data/hora da coleta, preview do primeiro campo de dados, coordenadas GPS (se disponíveis) e miniatura da imagem (se houver campo de imagem).',
      },
      {
        type: 'heading',
        text: 'Histórico por sujeito',
      },
      {
        type: 'step',
        text: 'Na tela de detalhe de um sujeito, role para baixo para ver o histórico de coletas daquele sujeito específico.',
      },
      {
        type: 'heading',
        text: 'Detalhe da coleta',
      },
      {
        type: 'paragraph',
        text: 'Ao tocar em uma coleta, você vê:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Metadados — Data/hora de coleta, data de modificação (se editada), coordenadas GPS formatadas.',
          'Dados da coleta — Todos os campos e valores em formato chave-valor.',
          'Imagens — Galeria com todas as fotos capturadas, organizadas por campo.',
          'Botão de edição (lápis) — Abre o formulário dinâmico preenchido para corrigir valores.',
          'Botão "Excluir Coleta" — Remove permanentemente a coleta e suas imagens.',
        ],
      },
      {
        type: 'tip',
        text: 'É possível editar coletas já salvas. Isso é útil quando você percebe um erro de digitação ou precisa complementar informações.',
      },
    ],
  },
  {
    id: 'export',
    icon: 'download-outline',
    title: 'Exportando datasets',
    content: [
      {
        type: 'paragraph',
        text: 'Após coletar seus dados, você pode exportar tudo em formato estruturado para análise.',
      },
      {
        type: 'step',
        text: 'No dashboard do projeto, toque em "Exportar". Selecione o formato CSV + Imagens (ZIP) e toque em "Exportar Dataset".',
      },
      {
        type: 'heading',
        text: 'O que é exportado?',
      },
      {
        type: 'paragraph',
        text: 'O app gera um arquivo ZIP contendo:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'subjects.csv — Tabela com todos os sujeitos. Colunas: id, created_at, e uma coluna para cada campo do schema de sujeito (usando o rótulo como cabeçalho).',
          'collections.csv — Tabela com todas as coletas. Colunas: id, subject_id, collected_at, latitude, longitude, e uma coluna para cada campo do schema de coleta.',
          'images/ — Pasta com todas as fotos capturadas, nomeadas de forma inteligente (ex: "T2_C_F1_R2_15-02-2026.jpg" usando os dados do sujeito).',
        ],
      },
      {
        type: 'heading',
        text: 'Formatos de exportação',
      },
      {
        type: 'list',
        text: '',
        items: [
          'ZIP (compartilhar) — Gera um arquivo ZIP e abre o compartilhamento do sistema para enviar por email, Drive, WhatsApp, etc.',
          'Salvar em Pasta — Exporta diretamente para uma pasta no dispositivo usando o seletor de pasta do Android. Ideal para datasets grandes — usa pouca memória.',
        ],
      },
      {
        type: 'heading',
        text: 'Agrupar imagens por data',
      },
      {
        type: 'paragraph',
        text: 'Ative a opção "Agrupar imagens por data" para organizar as fotos em subpastas por data de coleta:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'images/2026-02-15/ — Fotos coletadas em 15/02/2026',
          'images/2026-02-16/ — Fotos coletadas em 16/02/2026',
          'Desativado: todas as imagens ficam em images/ sem subpastas.',
        ],
      },
      {
        type: 'heading',
        text: 'Nomes inteligentes de imagens',
      },
      {
        type: 'paragraph',
        text: 'As fotos são salvas com nomes descritivos baseados nos dados do sujeito e na data da coleta. Exemplo: se o sujeito tem campos Variedade=T2, Rega=C, Microrganismo=F1, Repetição=R2, a foto será nomeada "T2_C_F1_R2_15-02-2026.jpg". Para multi-imagem, o ângulo é prefixado: "Frente_T2_C_F1_R2_15-02-2026.jpg".',
      },
      {
        type: 'paragraph',
        text: 'Além disso, um arquivo metadata.json é salvo junto a cada imagem contendo informações de rastreabilidade: campo, ângulo, IDs do sujeito e coleta, nome do sujeito e data.',
      },
      {
        type: 'tip',
        text: 'Os CSVs são gerados com BOM UTF-8 e escaping RFC 4180 — compatíveis com Excel, Google Sheets, R, Python/Pandas e qualquer ferramenta de análise de dados. Os subject_id nas coletas permitem fazer JOIN entre as tabelas.',
      },
    ],
  },
  {
    id: 'backup',
    icon: 'shield-checkmark-outline',
    title: 'Backup e segurança dos dados',
    content: [
      {
        type: 'paragraph',
        text: 'Seus dados são valiosos. O EdgeData armazena tudo localmente no dispositivo — o que é ótimo para funcionar offline, mas significa que você precisa cuidar dos backups.',
      },
      {
        type: 'warning',
        text: 'Se o app for desinstalado ou o dispositivo for perdido/danificado, todos os dados locais serão perdidos. Crie backups regularmente!',
      },
      {
        type: 'heading',
        text: 'Criando um backup',
      },
      {
        type: 'step',
        text: 'Vá em Configurações → "Criar Backup Agora". O app gera um arquivo ZIP contendo o banco de dados SQLite completo e todas as imagens.',
      },
      {
        type: 'paragraph',
        text: 'O sistema de compartilhamento abre automaticamente. Sugerimos:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Salvar no Google Drive ou outro serviço de nuvem',
          'Enviar por email para si mesmo',
          'Copiar para um computador via USB',
          'Salvar em um cartão SD',
        ],
      },
      {
        type: 'heading',
        text: 'Restaurando um backup',
      },
      {
        type: 'step',
        text: 'Vá em Configurações → "Restaurar Backup". Selecione o arquivo ZIP de backup. O app substituirá todos os dados atuais pelos do backup.',
      },
      {
        type: 'warning',
        text: 'A restauração substitui TODOS os dados atuais. Qualquer coleta feita após o backup será perdida. Use com cuidado.',
      },
      {
        type: 'heading',
        text: 'Boas práticas',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Faça backup ao final de cada dia de coleta em campo',
          'Exporte os datasets (CSV + ZIP) periodicamente',
          'Mantenha pelo menos uma cópia do backup fora do dispositivo',
          'Antes de restaurar, crie um backup do estado atual',
        ],
      },
      {
        type: 'heading',
        text: 'Gerenciamento de templates',
      },
      {
        type: 'paragraph',
        text: 'Na tela de Configurações você também encontra a seção de Templates Personalizados:',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Importar Template — Carrega um arquivo .edgetemplate.json e salva para uso em novos projetos.',
          'Lista de templates — Visualize todos os templates salvos com opção de excluir individualmente.',
          'Os templates importados ficam disponíveis na tela de criação de projeto, na seção "Meus Templates".',
        ],
      },
    ],
  },
  {
    id: 'bluetooth-sensors',
    icon: 'bluetooth-outline',
    title: 'Sensores Bluetooth (BLE)',
    content: [
      {
        type: 'paragraph',
        text: 'O EdgeData pode se conectar a um dispositivo ESP32 equipado com sensores Atlas Scientific EZO via Bluetooth Low Energy (BLE). Os sensores medem variáveis ambientais automaticamente e preenchem campos do formulário de coleta sem digitação manual.',
      },
      {
        type: 'heading',
        text: 'Sensores suportados',
      },
      {
        type: 'list',
        text: 'O sistema suporta três sensores Atlas Scientific EZO conectados ao ESP32 via I2C:',
        items: [
          'EZO-O2™ — Sensor de oxigênio gasoso (0–42%). Mede a concentração de O₂ no ar ambiente.',
          'EZO-CO2™ — Sensor de CO₂ research grade (0–10.000 ppm). Sensor NDIR para dióxido de carbono.',
          'EZO-HUM™ — Sonda de umidade embutida. Fornece 3 leituras simultâneas: umidade relativa (%), temperatura do ar (°C) e ponto de orvalho (°C).',
        ],
      },
      {
        type: 'paragraph',
        text: 'No total, o dispositivo envia 5 grandezas a cada leitura: O₂, CO₂, Umidade Relativa, Temperatura do Ar e Ponto de Orvalho.',
      },
      {
        type: 'heading',
        text: 'Como funciona',
      },
      {
        type: 'list',
        text: '',
        items: [
          '1. O ESP32 lê os sensores EZO via I2C a cada 5 segundos',
          '2. Os dados são empacotados em JSON e transmitidos via BLE (Bluetooth Low Energy)',
          '3. O app se conecta ao ESP32 e recebe os dados automaticamente',
          '4. Você configura o mapeamento: qual sensor preenche qual campo do formulário',
          '5. Na hora da coleta, toque em "Atualizar Sensores" e os campos são preenchidos automaticamente',
        ],
      },
      {
        type: 'heading',
        text: 'Passo 1: Conectar ao dispositivo',
      },
      {
        type: 'step',
        text: 'Vá em Configurações → "Sensores BLE" → "Escanear Dispositivos". O app procurará dispositivos BLE próximos com o nome "FoldenDataSensor".',
      },
      {
        type: 'paragraph',
        text: 'Quando o dispositivo aparecer na lista, toque nele para conectar. O ícone de status mudará para verde quando a conexão for estabelecida.',
      },
      {
        type: 'tip',
        text: 'Certifique-se de que o Bluetooth do celular está ligado e que o ESP32 está alimentado e ligado. O alcance típico do BLE é de 10–30 metros em campo aberto.',
      },
      {
        type: 'heading',
        text: 'Passo 2: Configurar mapeamento de sensores',
      },
      {
        type: 'paragraph',
        text: 'Após conectar, você precisa definir qual sensor preenche qual campo do seu schema de coleta. Isso é feito uma vez e fica salvo.',
      },
      {
        type: 'step',
        text: 'Na tela de Sensores BLE, toque em "Configurar Mapeamento". Para cada sensor disponível (O₂, CO₂, Umidade, Temperatura, Ponto de Orvalho), selecione o campo correspondente no formulário de coleta.',
      },
      {
        type: 'list',
        text: 'Exemplo de mapeamento:',
        items: [
          'Sensor "Oxigênio (O₂)" → Campo "oxigenio" do formulário',
          'Sensor "Dióxido de Carbono (CO₂)" → Campo "co2" do formulário',
          'Sensor "Umidade Relativa" → Campo "umidade_ar" do formulário',
          'Sensor "Temperatura do Ar" → Campo "temperatura_ar" do formulário',
          'Sensor "Ponto de Orvalho" → Campo "ponto_orvalho" do formulário',
        ],
      },
      {
        type: 'tip',
        text: 'Você não precisa mapear todos os sensores. Mapeie apenas os que correspondem a campos do seu projeto. Sensores sem mapeamento são ignorados.',
      },
      {
        type: 'heading',
        text: 'Passo 3: Coletar com sensores',
      },
      {
        type: 'paragraph',
        text: 'Com o dispositivo conectado e o mapeamento configurado, a coleta com sensores é automática:',
      },
      {
        type: 'step',
        text: 'No formulário de coleta, toque no botão "Atualizar Sensores" (aparece quando há mapeamento configurado). Os campos mapeados serão preenchidos com as leituras atuais dos sensores.',
      },
      {
        type: 'paragraph',
        text: 'Os campos preenchidos por sensores mostram um ícone 📡 indicando que o valor veio de leitura automática. Você ainda pode editar manualmente qualquer valor depois do auto-preenchimento.',
      },
      {
        type: 'heading',
        text: 'Hardware necessário',
      },
      {
        type: 'list',
        text: 'Para usar esta funcionalidade, você precisa montar o dispositivo sensor:',
        items: [
          'ESP32 — Microcontrolador com Bluetooth e Wi-Fi integrados. Qualquer placa ESP32 compatível serve.',
          'EZO-O2™ — Sensor de oxigênio Atlas Scientific (endereço I2C: 108).',
          'EZO-CO2™ — Sensor de CO₂ Atlas Scientific (endereço I2C: 105). Precisa de ~10 segundos de aquecimento.',
          'EZO-HUM™ — Sonda de umidade Atlas Scientific (endereço I2C: 111).',
          'Conexão I2C — Ligue SDA (GPIO 21), SCL (GPIO 22), VCC (3.3V) e GND de todos os sensores ao ESP32.',
          'Fonte de alimentação — Bateria LiPo, power bank USB ou fonte 5V.',
        ],
      },
      {
        type: 'warning',
        text: 'Os sensores Atlas Scientific EZO vêm de fábrica no modo UART. É necessário trocá-los para o modo I2C antes de usar com o firmware. Consulte o datasheet de cada sensor para o procedimento de troca de protocolo.',
      },
      {
        type: 'heading',
        text: 'Instalando o firmware no ESP32',
      },
      {
        type: 'list',
        text: 'Para gravar o firmware no ESP32:',
        items: [
          '1. Instale o PlatformIO no VS Code (extensão gratuita)',
          '2. Abra a pasta sensor-firmware/ do projeto',
          '3. Conecte o ESP32 via USB ao computador',
          '4. Execute: platformio run --target upload',
          '5. Monitore o serial com: platformio device monitor --speed 115200',
        ],
      },
      {
        type: 'paragraph',
        text: 'O firmware verificará a presença de cada sensor na inicialização e mostrará os endereços I2C detectados no monitor serial. Se algum sensor não for encontrado, o sistema continua funcionando com os sensores disponíveis.',
      },
      {
        type: 'heading',
        text: 'Solução de problemas',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Dispositivo não aparece no scan — Verifique se o ESP32 está ligado e o Bluetooth do celular está ativo. Reinicie o ESP32.',
          'Sensor mostra "não pronto" — O EZO-CO2 precisa de ~10s de aquecimento após ligar. Aguarde e tente novamente.',
          'Leitura de O₂ zerada — Verifique se o sensor está exposto ao ar. O valor normal ao ar livre é ~20.9%.',
          'Umidade/temperatura ausentes — Verifique a conexão I2C (SDA no GPIO 21, SCL no GPIO 22) e se o sensor está no modo I2C.',
          'Valores inconsistentes — Recalibre os sensores seguindo as instruções do datasheet Atlas Scientific.',
          'Conexão BLE cai — Mantenha o celular a menos de 10m do ESP32. Obstáculos metálicos reduzem o alcance.',
        ],
      },
    ],
  },
  {
    id: 'tips',
    icon: 'bulb-outline',
    title: 'Dicas para uso em campo',
    content: [
      {
        type: 'heading',
        text: 'Antes de ir a campo',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Explore o projeto demo (90 sujeitos) para conhecer o app antes de criar seu próprio projeto',
          'Use templates para agilizar a criação de projetos com campos padronizados',
          'Para experimentos fatoriais, use a criação em lote no modo fatorial — gera todas as combinações automaticamente',
          'Crie o projeto e todos os sujeitos antes de sair do escritório/laboratório',
          'Imprima e cole as etiquetas QR Code com antecedência',
          'Teste o fluxo de coleta fazendo uma coleta de teste no escritório',
          'Verifique se a bateria do celular está carregada',
          'Conceda as permissões de câmera e localização antes de ir a campo',
          'Se usar sensores BLE: carregue o ESP32, verifique se os sensores estão no modo I2C e teste a conexão BLE antes de sair',
        ],
      },
      {
        type: 'heading',
        text: 'Durante a coleta',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Use o botão "Nova Coleta" após cada salvamento para agilizar o fluxo',
          'Se o QR Code estiver danificado, use a busca manual — é igualmente rápida',
          'Campos automáticos (timestamp, GPS) são preenchidos sozinhos — não se preocupe com eles',
          'Se errar um dado, você pode editar a coleta depois',
          'Mantenha a tela limpa e seca para facilitar a leitura do QR Code',
          'Com sensores BLE: toque em "Atualizar Sensores" antes de salvar para capturar a leitura mais recente',
        ],
      },
      {
        type: 'heading',
        text: 'Após a coleta',
      },
      {
        type: 'list',
        text: '',
        items: [
          'Faça backup imediatamente — dados de campo são preciosos',
          'Revise algumas coletas aleatoriamente para verificar a qualidade',
          'Exporte o dataset quando terminar a campanha de coleta',
          'Use "Agrupar por data" na exportação para organizar imagens cronologicamente',
          'Exporte o template do projeto para reutilizar a estrutura em experimentos futuros',
          'Os CSVs exportados podem ser abertos diretamente em R, Python, Excel ou Google Sheets',
        ],
      },
      {
        type: 'heading',
        text: 'Resolução de problemas',
      },
      {
        type: 'list',
        text: '',
        items: [
          'QR Code não escaneia — Limpe a etiqueta, melhore a iluminação, ou use a busca manual.',
          'GPS não funciona — Verifique se a permissão de localização está concedida. Em áreas com cobertura densa (florestas), o GPS pode ser impreciso.',
          'App lento com muitos dados — O app funciona bem com milhares de sujeitos e coletas. Se ficar lento, reinicie o app.',
          'Sensor BLE não conecta — Reinicie o ESP32, verifique a bateria e certifique-se de que o Bluetooth do celular está ativo.',
          'Perdi meus dados — Se você tem um backup, restaure-o. Caso contrário, os dados foram perdidos permanentemente.',
        ],
      },
    ],
  },
];

function CollapsibleSection({ section }: { section: TutorialSection }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.sectionContainer}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionIconContainer}>
          <Ionicons name={section.icon} size={22} color={Colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.sectionBody}>
          {section.content.map((block, idx) => (
            <RenderBlock key={idx} block={block} />
          ))}
        </View>
      )}
    </View>
  );
}

function RenderBlock({ block }: { block: TutorialBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <Text style={styles.paragraph}>{block.text}</Text>;

    case 'heading':
      return <Text style={styles.heading}>{block.text}</Text>;

    case 'step':
      return (
        <View style={styles.stepContainer}>
          <View style={styles.stepBullet}>
            <Ionicons name="arrow-forward-circle" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.stepText}>{block.text}</Text>
        </View>
      );

    case 'tip':
      return (
        <View style={styles.tipContainer}>
          <Ionicons name="bulb-outline" size={18} color={Colors.primary} />
          <Text style={styles.tipText}>{block.text}</Text>
        </View>
      );

    case 'warning':
      return (
        <View style={styles.warningContainer}>
          <Ionicons name="warning-outline" size={18} color={Colors.warning} />
          <Text style={styles.warningText}>{block.text}</Text>
        </View>
      );

    case 'list':
      return (
        <View style={styles.listContainer}>
          {block.text ? <Text style={styles.listTitle}>{block.text}</Text> : null}
          {block.items?.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.listBullet}>•</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );

    default:
      return null;
  }
}

export default function TutorialScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBanner}>
        <Ionicons name="school-outline" size={40} color={Colors.primary} />
        <Text style={styles.bannerTitle}>Tutorial do EdgeData</Text>
        <Text style={styles.bannerSubtitle}>
          Toque em cada seção para expandir e ler as instruções detalhadas.
        </Text>
      </View>

      {TUTORIAL_SECTIONS.map((section) => (
        <CollapsibleSection key={section.id} section={section} />
      ))}

      <View style={styles.footer}>
        <Ionicons name="heart-outline" size={20} color={Colors.textSecondary} />
        <Text style={styles.footerText}>
          Desenvolvido para facilitar a coleta de dados estruturados.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  // Header banner
  headerBanner: {
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
    borderRadius: 16,
    padding: 24,
    gap: 8,
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Section
  sectionContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionBody: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
  },
  // Content blocks
  paragraph: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  heading: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    padding: 12,
  },
  stepBullet: {
    marginTop: 1,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.primaryDark,
    lineHeight: 21,
    fontWeight: '500',
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0FFF4',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 20,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warningLight,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    lineHeight: 20,
  },
  listContainer: {
    gap: 6,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  listBullet: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
    marginTop: 1,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 21,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});
