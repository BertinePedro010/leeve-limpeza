// Single source of truth for the in-app Central de Treinamento (help/training
// center). Content is data, not scattered JSX/strings, so it can be updated
// or extended (a new module = one more buildModule() call) without touching
// components/TrainingView.tsx. The exact same TRAINING_MODULES array backs
// both the on-screen view and the printable manual (TrainingPrintView), so
// the two can never drift into two different contents.
//
// Every fact described here mirrors an already-confirmed, currently-shipped
// system behaviour (see the code audit this content was built from) - no
// feature described here is invented or aspirational.

export type TrainingSection = { heading: string; body: string[] };
export type TrainingFaq = { q: string; a: string };
export type TrainingModule = {
  id: string;
  icon: string;
  title: string;
  summary: string;
  sections: TrainingSection[];
  faq?: TrainingFaq[];
};

type ModuleInput = {
  id: string;
  icon: string;
  title: string;
  summary: string;
  paraQueServe?: string[];
  comoFazer?: string[];
  passoAPasso?: string[];
  exemplo?: string[];
  importante?: string[];
  eviteEsteErro?: string[];
  faq?: TrainingFaq[];
};

function buildModule(m: ModuleInput): TrainingModule {
  const sections: TrainingSection[] = [];
  if (m.paraQueServe) sections.push({ heading: "Para que serve?", body: m.paraQueServe });
  if (m.comoFazer) sections.push({ heading: "Como fazer", body: m.comoFazer });
  if (m.passoAPasso) sections.push({ heading: "Passo a passo", body: m.passoAPasso });
  if (m.exemplo) sections.push({ heading: "Exemplo", body: m.exemplo });
  if (m.importante) sections.push({ heading: "Importante", body: m.importante });
  if (m.eviteEsteErro) sections.push({ heading: "Evite este erro", body: m.eviteEsteErro });
  return { id: m.id, icon: m.icon, title: m.title, summary: m.summary, sections, faq: m.faq };
}

export const TRAINING_MODULES: TrainingModule[] = [
  buildModule({
    id: "intro",
    icon: "🚀",
    title: "Comecando no sistema",
    summary: "Como entrar, escolher a filial e navegar pelo menu.",
    paraQueServe: ["Explica o basico para comecar a usar o LeeveLimpeza no dia a dia."],
    comoFazer: [
      "Entre com o e-mail e a senha que um administrador cadastrou para voce.",
      "No menu a esquerda, escolha a filial ativa - quase tudo no sistema e filtrado por ela.",
      "Use o menu lateral para navegar entre Dashboard, Ordens de Servico, Clientes e as demais telas.",
    ],
    importante: [
      "Voce so ve as telas e os dados da filial selecionada no momento.",
      "As opcoes do menu que voce ve dependem das permissoes que um administrador liberou para o seu usuario.",
    ],
    eviteEsteErro: ["Nao esqueca de conferir a filial ativa antes de cadastrar algo - um cliente ou OS criado na filial errada precisa ser corrigido depois."],
  }),

  buildModule({
    id: "branches",
    icon: "🏢",
    title: "Filiais",
    summary: "Como as filiais organizam clientes, OS e atendimentos.",
    paraQueServe: ["Cada filial representa uma unidade/cidade da empresa. E ela quem separa os dados no sistema."],
    comoFazer: [
      "A relacao e sempre: Filial -> Clientes -> Ordens de Servico -> Atendimentos.",
      "Um cliente cadastrado numa filial so aparece nas OS daquela mesma filial.",
    ],
    importante: [
      "Cada usuario deve trabalhar dentro da filial (ou filiais) autorizada para ele.",
      "Somente o administrador global (acesso a todas as filiais) cadastra novas filiais.",
    ],
    eviteEsteErro: ["Nao procure um cliente ou uma OS sem antes conferir se voce esta na filial certa."],
  }),

  buildModule({
    id: "clients",
    icon: "👤",
    title: "Clientes",
    summary: "Cadastro, edicao e pesquisa dos clientes da filial ativa.",
    paraQueServe: ["Aqui ficam os clientes da filial ativa - e a partir de um cliente cadastrado que se cria uma Ordem de Servico."],
    comoFazer: ["Clique em 'Novo Cliente' para cadastrar, ou em 'Editar' num cliente da lista para atualizar os dados."],
    passoAPasso: [
      "Preencha nome, telefone, e-mail e CPF/CNPJ (e-mail e CPF/CNPJ sao opcionais).",
      "Digite o CEP e clique em buscar - o sistema preenche Rua, Bairro, Cidade e Estado automaticamente.",
      "Confirme o Numero e complete o que faltar.",
      "Clique em Salvar.",
    ],
    exemplo: ["Cliente 'Pedro da Silva', CEP 29000-000 -> o sistema preenche Rua, Bairro, Cidade e UF sozinho; voce so confirma o numero da casa."],
    importante: [
      "Rua, Numero, Bairro, Cidade e Estado sao obrigatorios - sem eles nao e possivel criar uma OS para esse cliente (veja o modulo Endereco do cliente).",
      "O sistema nao permite dois clientes com o mesmo CPF/CNPJ e o mesmo nome na mesma filial.",
    ],
    eviteEsteErro: ["Nao cadastre um cliente sem completar o endereco - o problema so aparece na hora de tentar criar a OS."],
  }),

  buildModule({
    id: "employees",
    icon: "🧑‍🔧",
    title: "Funcionarios",
    summary: "Cadastro da equipe que realiza os atendimentos.",
    paraQueServe: ["Cadastro da equipe de campo - e quem voce escolhe ao montar uma OS."],
    comoFazer: ["Clique em 'Novo Funcionario', preencha nome, cargo, telefone e valor de diaria/salario, e salve."],
    importante: ["Funcionario tambem e escopado por filial."],
  }),

  buildModule({
    id: "services",
    icon: "🧽",
    title: "Servicos",
    summary: "Catalogo dos servicos que a empresa presta.",
    paraQueServe: ["Cada item adicionado a uma OS e um servico cadastrado aqui."],
    comoFazer: ["Cadastre nome, descricao, preco, duracao e categoria do servico."],
    importante: ["Um servico inativo continua aparecendo em OS antigas, mas nao pode mais ser escolhido em uma OS nova."],
  }),

  buildModule({
    id: "orders",
    icon: "🧾",
    title: "Ordens de Servico",
    summary: "O coracao do sistema: onde voce registra um evento/servico contratado.",
    paraQueServe: ["A Ordem de Servico (OS) e o registro completo de um servico contratado: o que foi vendido, quando, por quem e por quanto."],
    passoAPasso: [
      "Cliente - escolha o cliente ja cadastrado.",
      "Servico - adicione um ou mais servicos contratados.",
      "Data - informe a data do atendimento.",
      "Horario - informe o horario de inicio e fim.",
      "Funcionario - escolha quem vai realizar o atendimento.",
      "Valor - o sistema calcula sozinho, a partir da quantidade e do valor de cada servico.",
      "Endereco - vem automaticamente do cadastro do cliente (veja o modulo Endereco do cliente).",
      "Atendimento - a OS ja nasce com pelo menos um atendimento, a data principal.",
      "Salvar - confira os dados e finalize.",
    ],
    exemplo: ["Faxina semanal para o mesmo cliente em 4 sabados do mes -> 1 unica OS com 4 atendimentos, nao 4 OS separadas."],
    importante: [
      "Uma OS pode ter VARIOS atendimentos/datas para o mesmo servico - nao e preciso criar uma OS nova para cada data (veja o modulo Atendimentos e datas adicionais).",
      "A forma de pagamento pode ser: Nao informado, PIX, Cartao de credito, Cartao de debito, Dinheiro ou Boleto.",
      "Cancelar uma OS e uma acao separada (botao 'Cancelar OS'), nao um status - veja o modulo Status.",
    ],
    eviteEsteErro: ["Nao crie uma OS separada para cada data do mesmo servico/cliente - use 'Datas adicionais' dentro da mesma OS."],
  }),

  buildModule({
    id: "address",
    icon: "📍",
    title: "Endereco do cliente",
    summary: "De onde vem o endereco que aparece na OS.",
    paraQueServe: ["Explica por que o endereco da OS nunca e digitado na propria OS."],
    comoFazer: ["O endereco da OS vem automaticamente do cadastro do cliente."],
    importante: [
      "Se o cliente nao tiver endereco completo (Rua, Numero, Bairro, Cidade e Estado), nao e possivel criar a OS.",
      "Edite o cadastro do cliente, complete o endereco e depois crie a OS.",
    ],
    eviteEsteErro: ["Nao tente digitar ou corrigir o endereco na tela da OS - ele nao existe ali. A correcao e sempre no cadastro do cliente."],
  }),

  buildModule({
    id: "values",
    icon: "💰",
    title: "Valores",
    summary: "Como o sistema calcula o valor de uma OS.",
    paraQueServe: ["Explica de onde vem o valor total de uma OS e a diferenca entre OS, atendimento e valor."],
    comoFazer: ["O valor da OS e a soma de (quantidade x valor) de cada servico contratado."],
    exemplo: ["3 atendimentos x R$ 500 = R$ 1.500."],
    importante: [
      "OS = o contrato/pedido completo.",
      "Atendimento = cada data/execucao dentro da OS.",
      "O valor da OS e o mesmo para todos os atendimentos dela - o valor nao se divide por atendimento.",
    ],
  }),

  buildModule({
    id: "appointments",
    icon: "📅",
    title: "Atendimentos e datas adicionais",
    summary: "Como uma OS pode ter mais de uma data, cada uma com seu proprio status.",
    paraQueServe: ["Uma OS pode ter mais de uma data - cada uma e um atendimento com horario, funcionario e status proprios."],
    comoFazer: [
      "Ao criar a OS, use o calendario de 'Datas adicionais' para marcar mais de uma data de uma vez.",
      "Depois de criada, abra a OS e use 'Adicionar atendimentos' para incluir novas datas.",
    ],
    passoAPasso: ["Abra a OS.", "Escolha reagendar, marcar como realizado, trocar o funcionario ou cancelar um atendimento especifico - sem afetar os demais."],
    importante: [
      "Quando o ultimo atendimento em aberto e marcado como Realizado, a OS inteira tambem vira Realizado automaticamente.",
      "Nao e possivel remover o unico atendimento restante de uma OS - cancele-o ou exclua a OS inteira.",
    ],
    eviteEsteErro: ["Nao cancele um atendimento achando que isso cancela a OS toda - para cancelar a OS inteira, use o botao 'Cancelar OS'."],
  }),

  buildModule({
    id: "recurrence",
    icon: "🔁",
    title: "Recorrencia",
    summary: "Gera automaticamente os atendimentos de um servico que se repete.",
    paraQueServe: ["Util para servicos que se repetem, como uma limpeza toda semana ou todo mes."],
    comoFazer: ["Escolha o cliente, o servico, a frequencia (semanal ou mensal) e o dia."],
    importante: [
      "O sistema gera os atendimentos com ate 90 dias de antecedencia.",
      "Da para adicionar datas avulsas extras junto com a recorrencia.",
    ],
  }),

  buildModule({
    id: "calendar",
    icon: "🗓️",
    title: "Calendario",
    summary: "Visao do mes com todos os atendimentos da filial ativa.",
    paraQueServe: ["Mostra rapidamente o que esta agendado em cada dia do mes."],
    comoFazer: [
      "Navegue entre os meses com os botoes Anterior/Proximo.",
      "Clique em um dia para ver os atendimentos daquele dia.",
      "Clique em um atendimento para abrir a OS correspondente.",
    ],
  }),

  buildModule({
    id: "status",
    icon: "🔵",
    title: "Status",
    summary: "Os dois unicos status que uma OS ou atendimento pode ter.",
    paraQueServe: ["Explica os status que existem hoje no sistema."],
    passoAPasso: ["AGENDADO - ainda nao foi realizado.", "REALIZADO - o atendimento ja aconteceu."],
    importante: [
      "Cancelamento NAO e um status - e tratado separadamente. Ao cancelar uma OS ou um atendimento, o sistema guarda o motivo e a data do cancelamento como historico, mas isso nao e um dos dois status possiveis.",
    ],
    eviteEsteErro: ["Nao procure por 'Confirmado', 'Em andamento', 'Finalizado' ou 'Cancelado' como status - esses nomes nao existem mais no sistema."],
  }),

  buildModule({
    id: "finance",
    icon: "🏦",
    title: "Financeiro",
    summary: "Controle de receitas e despesas da filial.",
    paraQueServe: ["Acompanhar entradas e saidas de dinheiro da filial."],
    comoFazer: ["Lance receitas e despesas manualmente, ou deixe o sistema gerar a receita sozinho quando uma OS vira Realizado."],
    importante: [
      "O status financeiro (Pago/Pendente) e diferente do status da OS (Agendado/Realizado) - sao coisas separadas.",
      "Se uma OS deixar de ser Realizado ou for cancelada, a receita automatica gerada por ela e revertida.",
    ],
  }),

  buildModule({
    id: "dashboard",
    icon: "📊",
    title: "Dashboard",
    summary: "Tela inicial com os numeros gerais da filial.",
    paraQueServe: ["Mostra faturamento, OS agendadas e realizadas, e os proximos eventos, tudo em um so lugar."],
    importante: ["Os numeros nunca incluem OS ou atendimentos cancelados."],
  }),

  buildModule({
    id: "reports",
    icon: "📈",
    title: "Relatorios",
    summary: "Relatorios por funcionario, servico, atendimento, OS, cancelamentos e por cliente.",
    paraQueServe: ["Gera relatorios com os dados da filial para acompanhar o desempenho e o faturamento."],
    comoFazer: [
      "Escolha a Filial, o Tipo de relatorio e o Periodo.",
      "Se quiser, filtre tambem por Funcionario, Servico ou Status.",
      "Clique em 'Gerar Relatorio'.",
    ],
    passoAPasso: [
      "Para o relatorio Por Cliente: escolha a Filial.",
      "Escolha o Cliente (ou 'Todos os clientes').",
      "Em Tipo, selecione 'Por Cliente'.",
      "Escolha o Periodo.",
      "Se quiser, filtre por Funcionario, Servico ou Status.",
      "Clique em Gerar Relatorio.",
    ],
    exemplo: [
      "Pedro",
      "3 Limpeza -> R$ 2.000",
      "3 Limpeza Casa -> R$ 2.000",
      "2 Lavagem -> R$ 2.000",
      "Total: 8 servicos - R$ 6.000",
    ],
    importante: [
      "O relatorio 'Por Cliente' tambem mostra quantas OS desse cliente estao Agendadas e quantas estao Realizadas.",
      "OS canceladas nunca entram nos numeros de nenhum relatorio.",
      "Todo relatorio pode ser baixado em PDF ou impresso.",
    ],
  }),

  buildModule({
    id: "client-search",
    icon: "🔎",
    title: "Busca de clientes",
    summary: "Como encontrar rapidamente um cliente ja cadastrado.",
    paraQueServe: ["Evita rolar a lista inteira de clientes para achar um so."],
    comoFazer: ["Na tela Clientes, digite parte do nome OU o CPF/CNPJ (com ou sem pontuacao) na caixa de pesquisa."],
    exemplo: [
      "Digitar 'Pedro' encontra 'Pedro da Silva', 'Pedro Almeida' etc.",
      "Digitar '11406274000100' ou '11.406.274/0001-00' encontra o mesmo cliente, nao importa como foi digitado.",
    ],
    importante: ["A pesquisa busca somente dentro da filial ativa."],
  }),

  buildModule({
    id: "order-search",
    icon: "🧭",
    title: "Busca de OS por cliente",
    summary: "Encontrar todas as Ordens de Servico de um cliente, com um resumo pronto.",
    paraQueServe: ["Util para ver rapidamente o historico de um cliente sem abrir OS uma por uma."],
    passoAPasso: [
      "Na tela Ordens de Servico, digite o nome do cliente na pesquisa.",
      "O sistema mostra todas as OS daquele cliente.",
      "Um resumo aparece logo abaixo: Total de OS, quantas Agendadas, quantas Realizadas e o Valor total.",
    ],
    exemplo: ["Pesquisar 'Maria' -> lista das OS de Maria + resumo com Total de OS, Agendado, Realizado e Valor total."],
  }),

  buildModule({
    id: "pdf",
    icon: "📄",
    title: "PDF e impressao",
    summary: "Gerar um documento ou imprimir uma OS ou um relatorio.",
    paraQueServe: ["Para entregar ou guardar um registro fisico/digital de uma OS ou relatorio."],
    comoFazer: [
      "Na OS, use 'Baixar PDF' ou 'Gerar PDF / Imprimir'.",
      "Nos relatorios, clique em 'Gerar PDF' depois de gerar o relatorio na tela.",
    ],
    importante: ["O PDF sempre mostra os dados ja salvos - nunca um rascunho nao salvo."],
  }),

  buildModule({
    id: "email",
    icon: "✉️",
    title: "E-mail",
    summary: "Enviar a OS por e-mail para o cliente, com o PDF anexado.",
    comoFazer: ["Na OS, clique em 'Enviar por e-mail', confira o endereco, escreva uma mensagem (opcional) e envie."],
    importante: ["O envio depende do servidor de e-mail estar configurado. Se nao estiver, o sistema avisa e nao trava o restante do trabalho."],
  }),

  buildModule({
    id: "whatsapp",
    icon: "💬",
    title: "WhatsApp",
    summary: "Enviar o resumo da OS pelo WhatsApp do cliente.",
    comoFazer: [
      "Na OS, clique em 'Enviar pelo WhatsApp' - o sistema abre o WhatsApp com a mensagem ja pronta.",
      "Voce ainda precisa apertar Enviar dentro do proprio WhatsApp.",
    ],
    importante: ["O sistema nao envia sozinho - ele so prepara a mensagem e abre a conversa."],
  }),

  buildModule({
    id: "faq",
    icon: "❓",
    title: "Duvidas frequentes",
    summary: "Respostas rapidas para as duvidas mais comuns.",
    faq: [
      { q: "Por que nao consigo criar uma OS?", a: "O motivo mais comum e o cliente nao ter o endereco completo cadastrado. Edite o cliente, preencha Rua, Numero, Bairro, Cidade e Estado, e tente criar a OS novamente." },
      { q: "Como corrigir o endereco de um cliente?", a: "Va em Clientes, clique em Editar no cliente desejado e complete o endereco. Se souber o CEP, digite-o e clique em buscar para preencher automaticamente." },
      { q: "Posso criar uma OS para cada data?", a: "Nao e necessario. Uma mesma OS pode ter varias datas (atendimentos). Use 'Datas adicionais' ao criar a OS, ou 'Adicionar atendimentos' depois de criada." },
      { q: "Como marcar uma OS como realizada?", a: "Abra a OS, encontre o atendimento e clique em 'Marcar realizado'. Quando o ultimo atendimento em aberto e marcado assim, a OS inteira tambem vira Realizado." },
      { q: "Como encontrar todas as OS de um cliente?", a: "Na tela Ordens de Servico, pesquise pelo nome do cliente - a lista e um resumo (total, agendado, realizado, valor) aparecem na hora." },
      { q: "Como gerar relatorio por cliente?", a: "Va em Relatorios, escolha a Filial, o Cliente (ou Todos os clientes), o Tipo 'Por Cliente', o Periodo, e clique em Gerar Relatorio." },
      { q: "Como pesquisar cliente por CPF/CNPJ?", a: "Na tela Clientes, digite o CPF ou CNPJ na pesquisa, com ou sem pontuacao - o sistema encontra do mesmo jeito." },
      { q: "Como enviar uma OS?", a: "Abra a OS e use os botoes 'Enviar por e-mail' ou 'Enviar pelo WhatsApp'." },
      { q: "O que significa 'Cancelado', se nao e um status?", a: "Cancelar uma OS ou atendimento guarda o motivo e a data do cancelamento como historico, mas nao e um dos dois status possiveis (Agendado/Realizado) - veja o modulo Status." },
    ],
  }),
];
