# Contribuindo com o EdgeData

## Padrão de commits

Toda mensagem de commit segue o formato:

```
[tipo] "descrição curta no presente, em português"
```

Exemplos:

```
[feat] "adiciona criador de experimentos"
[fix] "corrige validação de campos obrigatórios"
[docs] "descreve o protocolo BLE dos dispositivos"
```

| Tipo       | Uso                                                        |
|------------|------------------------------------------------------------|
| `feat`     | Nova funcionalidade                                        |
| `fix`      | Correção de bug                                            |
| `refactor` | Mudança de código sem alterar comportamento                |
| `perf`     | Melhoria de desempenho                                     |
| `test`     | Adição ou ajuste de testes                                 |
| `docs`     | Documentação                                               |
| `build`    | Dependências, empacotamento e scripts de build             |
| `ci`       | Integração contínua                                        |
| `chore`    | Manutenção geral (configuração, organização de arquivos)   |
| `style`    | Formatação, sem mudança de lógica                          |

Regras:

- Um commit = uma mudança coerente. Prefira vários commits pequenos a um commit gigante.
- A descrição cabe em uma linha (até ~72 caracteres). Detalhes vão no corpo do commit, após uma linha em branco.
- Não misture refatoração com funcionalidade nova no mesmo commit.

## Branches

- `main` — sempre estável.
- `feat/<assunto>`, `fix/<assunto>`, `docs/<assunto>` — trabalho em andamento, integrado via pull request.

## Antes de commitar (app mobile)

```bash
cd apps/mobile
npm run typecheck
npm run lint
npm test
```
